const express = require("express");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const llmService = require("../services/llmService");
const emailService = require("../services/emailService");
const appointmentService = require("../services/appointmentService");

const router = express.Router();
router.use(authenticate, requireRole("DOCTOR"));

async function getOwnDoctorProfile(userId) {
  return prisma.doctorProfile.findUnique({ where: { userId } });
}

router.get("/appointments", async (req, res) => {
  const profile = await getOwnDoctorProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: "Doctor profile not found" });

  const appointments = await prisma.appointment.findMany({
    where: { doctorId: profile.id, status: { in: ["BOOKED", "COMPLETED"] } },
    include: { patient: { select: { name: true, email: true } } },
    orderBy: { startTime: "asc" },
  });
  res.json(appointments);
});

// Doctor submits post-visit notes + prescription -> LLM generates patient-friendly summary
router.post("/appointments/:id/complete", async (req, res) => {
  const { doctorNotes, prescription } = req.body;

  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  const postVisit = await llmService.generatePostVisitSummary(
    `Notes: ${doctorNotes}\nPrescription: ${prescription}`
  );

  const updated = await prisma.appointment.update({
    where: { id: req.params.id },
    data: {
      doctorNotes,
      prescription,
      postVisitSummary: JSON.stringify(postVisit),
      status: "COMPLETED",
    },
    include: { patient: true },
  });

  // Schedule medication reminders based on prescription frequency parsed by the LLM output
  const reminderCreates = postVisit.medicationSchedule.map((med) =>
    prisma.medicationReminder.create({
      data: {
        appointmentId: updated.id,
        medicationName: med,
        scheduleCron: "0 9,21 * * *", // default twice-daily cadence; adjust per parsed frequency
        nextRunAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    })
  );
  await Promise.all(reminderCreates);

  await emailService.sendNotification({
    appointmentId: updated.id,
    type: "REMINDER",
    recipient: updated.patient.email,
    context: updated,
  });

  res.json(updated);
});

router.post("/leave", async (req, res) => {
  const profile = await getOwnDoctorProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: "Doctor profile not found" });

  const { date, reason } = req.body;
  const leave = await prisma.doctorLeave.create({
    data: { doctorId: profile.id, date: new Date(date), reason },
  });
  const affectedCount = await appointmentService.handleLeaveConflicts(profile.id, date);

  res.status(201).json({ leave, affectedAppointmentsCancelled: affectedCount });
});

module.exports = router;
