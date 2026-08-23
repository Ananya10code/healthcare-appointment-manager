const prisma = require("../config/db");
const emailService = require("./emailService");
const calendarService = require("./calendarService");
const llmService = require("./llmService");

const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes to complete the symptom form + confirm

/**
 * Computes candidate slots for a doctor on a given date from their weekly working hours,
 * minus slots already HELD (unexpired) or BOOKED, minus days the doctor is on leave.
 */
async function getAvailableSlots(doctorId, dateStr) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: { workingHours: true, leaves: true },
  });
  if (!doctor) throw new Error("Doctor not found");

  const date = new Date(dateStr);
  const dayStart = new Date(date.setHours(0, 0, 0, 0));
  const dayEnd = new Date(new Date(dayStart).setHours(23, 59, 59, 999));

  const onLeave = doctor.leaves.some(
    (l) => l.date.toDateString() === dayStart.toDateString()
  );
  if (onLeave) return [];

  const dayOfWeek = dayStart.getDay();
  const hours = doctor.workingHours.filter((wh) => wh.dayOfWeek === dayOfWeek);
  if (hours.length === 0) return [];

  // Existing non-cancelled appointments (BOOKED or still-valid HELD) that occupy slots
  const now = new Date();
  const busy = await prisma.appointment.findMany({
    where: {
      doctorId,
      startTime: { gte: dayStart, lte: dayEnd },
      OR: [
        { status: "BOOKED" },
        { status: "HELD", holdExpiresAt: { gt: now } },
      ],
    },
    select: { startTime: true, endTime: true },
  });

  const slots = [];
  for (const wh of hours) {
    const [startH, startM] = wh.startTime.split(":").map(Number);
    const [endH, endM] = wh.endTime.split(":").map(Number);

    let cursor = new Date(dayStart);
    cursor.setHours(startH, startM, 0, 0);
    const windowEnd = new Date(dayStart);
    windowEnd.setHours(endH, endM, 0, 0);

    while (cursor < windowEnd) {
      const slotEnd = new Date(cursor.getTime() + doctor.slotDurationMin * 60000);
      if (slotEnd > windowEnd) break;

      const overlaps = busy.some(
        (b) => cursor < b.endTime && slotEnd > b.startTime
      );
      if (!overlaps) {
        slots.push({ startTime: new Date(cursor), endTime: new Date(slotEnd) });
      }
      cursor = slotEnd;
    }
  }
  return slots;
}

/**
 * Slot-hold mechanism to safely handle simultaneous booking attempts.
 *
 * Two patients can click "book" on the same slot at the same instant. To prevent a race:
 *  1. We run the conflict check + insert inside a single Prisma `$transaction`, which on
 *     SQLite/Postgres executes serially against the same rows, so the second caller's
 *     conflict check will see the first caller's just-inserted HELD/BOOKED row.
 *  2. The DB index on (doctorId, startTime, endTime, status) makes that conflict lookup fast.
 *  3. A HELD row expires after HOLD_DURATION_MS if the patient never confirms (via symptom
 *     form submission), so slots aren't locked forever by abandoned bookings. A cron job
 *     (see jobs/reminderJob.js) periodically flips expired HELD rows to CANCELLED.
 */
async function holdSlot({ patientId, doctorId, startTime, endTime }) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const conflict = await tx.appointment.findFirst({
      where: {
        doctorId,
        OR: [{ status: "BOOKED" }, { status: "HELD", holdExpiresAt: { gt: now } }],
        AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
      },
    });
    if (conflict) {
      const err = new Error("This slot was just taken. Please choose another.");
      err.code = "SLOT_CONFLICT";
      throw err;
    }

    return tx.appointment.create({
      data: {
        patientId,
        doctorId,
        startTime,
        endTime,
        status: "HELD",
        holdExpiresAt: new Date(now.getTime() + HOLD_DURATION_MS),
      },
    });
  });
}

/**
 * Confirms a held appointment: patient submits symptoms, LLM generates the pre-visit
 * summary, status flips to BOOKED, and notifications/calendar events fire.
 * Re-validates the hold hasn't expired inside the same transaction to avoid a stale confirm.
 */
async function confirmAppointment(appointmentId, patientId, symptomText) {
  const now = new Date();

  const appointment = await prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: { doctor: { include: { user: true } }, patient: true },
    });
    if (!existing || existing.patientId !== patientId) {
      throw new Error("Appointment not found");
    }
    if (existing.status !== "HELD" || existing.holdExpiresAt < now) {
      const err = new Error("Your hold on this slot has expired. Please book again.");
      err.code = "HOLD_EXPIRED";
      throw err;
    }

    return tx.appointment.update({
      where: { id: appointmentId },
      data: { status: "BOOKED", symptomText },
      include: { doctor: { include: { user: true } }, patient: true },
    });
  });

  // Side effects run outside the DB transaction (LLM/email/calendar are slow & non-transactional)
  const preVisit = await llmService.generatePreVisitSummary(symptomText);
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      preVisitSummary: JSON.stringify(preVisit),
      preVisitUrgency: preVisit.urgency.toUpperCase(),
    },
  });

  await Promise.all([
    emailService.sendNotification({
      appointmentId: appointment.id,
      type: "BOOKING_CONFIRMATION",
      recipient: appointment.patient.email,
      context: appointment,
    }),
    emailService.sendNotification({
      appointmentId: appointment.id,
      type: "BOOKING_CONFIRMATION",
      recipient: appointment.doctor.user.email,
      context: appointment,
    }),
  ]);

  const [patientEventId, doctorEventId] = await Promise.all([
    calendarService.createEvent(appointment.patientId, {
      summary: `Appointment with Dr. ${appointment.doctor.user.name}`,
      description: "Booked via Healthcare Appointment Manager",
      startTime: appointment.startTime,
      endTime: appointment.endTime,
    }),
    calendarService.createEvent(appointment.doctor.userId, {
      summary: `Appointment with patient ${appointment.patient.name}`,
      description: preVisit.chiefComplaint,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
    }),
  ]);

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { googleEventIdPatient: patientEventId, googleEventIdDoctor: doctorEventId },
  });
}

/**
 * Cancels an appointment, notifies the patient, and removes calendar events on both sides.
 */
async function cancelAppointment(appointmentId, actorUserId) {
  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
    include: { doctor: { include: { user: true } }, patient: true },
  });

  await Promise.all([
    emailService.sendNotification({
      appointmentId,
      type: "CANCELLATION",
      recipient: appointment.patient.email,
      context: appointment,
    }),
    calendarService.deleteEvent(appointment.patientId, appointment.googleEventIdPatient),
    calendarService.deleteEvent(appointment.doctor.userId, appointment.googleEventIdDoctor),
  ]);

  return appointment;
}

/**
 * Called when a doctor is marked on leave for a date. Finds affected BOOKED appointments,
 * cancels them, and notifies each patient individually so no one shows up to a closed clinic.
 */
async function handleLeaveConflicts(doctorId, leaveDate) {
  const dayStart = new Date(new Date(leaveDate).setHours(0, 0, 0, 0));
  const dayEnd = new Date(new Date(dayStart).setHours(23, 59, 59, 999));

  const affected = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: "BOOKED",
      startTime: { gte: dayStart, lte: dayEnd },
    },
    include: { patient: true, doctor: { include: { user: true } } },
  });

  for (const appt of affected) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: "CANCELLED" },
    });
    await emailService.sendNotification({
      appointmentId: appt.id,
      type: "LEAVE_CONFLICT",
      recipient: appt.patient.email,
      context: appt,
    });
    await calendarService.deleteEvent(appt.patientId, appt.googleEventIdPatient);
    await calendarService.deleteEvent(appt.doctor.userId, appt.googleEventIdDoctor);
  }

  return affected.length;
}

/** Releases HELD appointments whose hold window has expired. Run periodically via cron. */
async function releaseExpiredHolds() {
  const now = new Date();
  const result = await prisma.appointment.updateMany({
    where: { status: "HELD", holdExpiresAt: { lt: now } },
    data: { status: "CANCELLED" },
  });
  return result.count;
}

module.exports = {
  getAvailableSlots,
  holdSlot,
  confirmAppointment,
  cancelAppointment,
  handleLeaveConflicts,
  releaseExpiredHolds,
};
