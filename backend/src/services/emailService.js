const nodemailer = require("nodemailer");
const prisma = require("../config/db");

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

const TEMPLATES = {
  BOOKING_CONFIRMATION: (a) => ({
    subject: "Appointment Confirmed",
    text: `Your appointment is confirmed for ${a.startTime}.`,
  }),
  CANCELLATION: (a) => ({
    subject: "Appointment Cancelled",
    text: `Your appointment scheduled for ${a.startTime} has been cancelled.`,
  }),
  REMINDER: (a) => ({
    subject: "Appointment / Medication Reminder",
    text: `Reminder: you have an upcoming appointment or medication dose at ${a.startTime}.`,
  }),
  LEAVE_CONFLICT: (a) => ({
    subject: "Your appointment needs to be rescheduled",
    text: `Unfortunately your doctor is unavailable on ${a.startTime}. Please rebook at your earliest convenience.`,
  }),
};

/**
 * Sends an email and logs the attempt to NotificationLog for auditability + retry.
 * Never throws — failures are recorded so a background job can retry (see jobs/reminderJob.js).
 */
async function sendNotification({ appointmentId, type, recipient, context }) {
  const log = await prisma.notificationLog.create({
    data: { appointmentId, channel: "EMAIL", type, recipient, status: "PENDING" },
  });

  try {
    const template = TEMPLATES[type];
    if (!template) throw new Error(`Unknown email template type: ${type}`);
    const { subject, text } = template(context);

    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM,
      to: recipient,
      subject,
      text,
    });

    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: "SENT", attempts: { increment: 1 } },
    });
  } catch (err) {
    console.error("[emailService] send failed:", err.message);
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: "FAILED", attempts: { increment: 1 }, lastError: err.message },
    });
  }
}

module.exports = { sendNotification };
