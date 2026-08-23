const cron = require("node-cron");
const prisma = require("../config/db");
const emailService = require("../services/emailService");
const appointmentService = require("../services/appointmentService");

const MAX_RETRY_ATTEMPTS = 5;

async function runMedicationReminders() {
  const due = await prisma.medicationReminder.findMany({
    where: { active: true, nextRunAt: { lte: new Date() } },
    include: { appointment: { include: { patient: true } } },
  });

  for (const reminder of due) {
    await emailService.sendNotification({
      appointmentId: reminder.appointmentId,
      type: "REMINDER",
      recipient: reminder.appointment.patient.email,
      context: reminder.appointment,
    });
    // Advance to next dose window (every 12h here; derive from scheduleCron in a fuller implementation)
    await prisma.medicationReminder.update({
      where: { id: reminder.id },
      data: { nextRunAt: new Date(Date.now() + 12 * 60 * 60 * 1000) },
    });
  }
}

/** Retries notifications that previously failed (transient SMTP errors, etc.), capped by attempts. */
async function retryFailedNotifications() {
  const failed = await prisma.notificationLog.findMany({
    where: { status: "FAILED", attempts: { lt: MAX_RETRY_ATTEMPTS } },
    include: { appointment: { include: { patient: true, doctor: { include: { user: true } } } } },
  });

  for (const log of failed) {
    await emailService.sendNotification({
      appointmentId: log.appointmentId,
      type: log.type,
      recipient: log.recipient,
      context: log.appointment,
    });
  }
}

function start() {
  // Every minute: release abandoned slot holds so they become bookable again
  cron.schedule("* * * * *", async () => {
    const count = await appointmentService.releaseExpiredHolds();
    if (count > 0) console.log(`[reminderJob] released ${count} expired holds`);
  });

  // Every 15 minutes: fire due medication reminders
  cron.schedule("*/15 * * * *", async () => {
    await runMedicationReminders().catch((e) => console.error("[reminderJob] medication reminders:", e));
  });

  // Every 10 minutes: retry failed email notifications
  cron.schedule("*/10 * * * *", async () => {
    await retryFailedNotifications().catch((e) => console.error("[reminderJob] retry failed:", e));
  });
}

module.exports = { start };
