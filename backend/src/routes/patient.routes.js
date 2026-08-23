const express = require("express");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const appointmentService = require("../services/appointmentService");

const router = express.Router();
router.use(authenticate, requireRole("PATIENT"));

// Search doctors by specialisation (partial match)
router.get("/doctors", async (req, res) => {
  const { specialisation } = req.query;
  const doctors = await prisma.doctorProfile.findMany({
    where: specialisation
      ? { specialisation: { contains: specialisation } }
      : undefined,
    include: { user: { select: { id: true, name: true } } },
  });
  res.json(doctors);
});

router.get("/doctors/:id/slots", async (req, res) => {
  try {
    const { date } = req.query; // "YYYY-MM-DD"
    const slots = await appointmentService.getAvailableSlots(req.params.id, date);
    res.json(slots);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Step 1: hold a slot (before symptom form is filled)
router.post("/appointments/hold", async (req, res) => {
  const { doctorId, startTime, endTime } = req.body;
  try {
    const appointment = await appointmentService.holdSlot({
      patientId: req.user.id,
      doctorId,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    });
    res.status(201).json(appointment);
  } catch (err) {
    const status = err.code === "SLOT_CONFLICT" ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

// Step 2: submit symptoms and confirm the held slot
router.post("/appointments/:id/confirm", async (req, res) => {
  const { symptomText } = req.body;
  try {
    const appointment = await appointmentService.confirmAppointment(
      req.params.id,
      req.user.id,
      symptomText
    );
    res.json(appointment);
  } catch (err) {
    const status = err.code === "HOLD_EXPIRED" ? 410 : 400;
    res.status(status).json({ error: err.message });
  }
});

router.get("/appointments", async (req, res) => {
  const appointments = await prisma.appointment.findMany({
    where: { patientId: req.user.id },
    include: { doctor: { include: { user: { select: { name: true } } } } },
    orderBy: { startTime: "desc" },
  });
  res.json(appointments);
});

router.post("/appointments/:id/cancel", async (req, res) => {
  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment || appointment.patientId !== req.user.id) {
    return res.status(404).json({ error: "Appointment not found" });
  }
  const cancelled = await appointmentService.cancelAppointment(req.params.id, req.user.id);
  res.json(cancelled);
});

module.exports = router;
