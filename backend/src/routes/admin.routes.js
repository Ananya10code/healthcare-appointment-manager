const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleCheck");
const appointmentService = require("../services/appointmentService");

const router = express.Router();
router.use(authenticate, requireRole("ADMIN"));

// Create a doctor account + profile (admin-managed, per registration policy)
router.post("/doctors", async (req, res) => {
  const { name, email, password, specialisation, slotDurationMin, bio, workingHours } = req.body;

  const passwordHash = await bcrypt.hash(password, 10);
  const doctorUser = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "DOCTOR",
      doctorProfile: {
        create: {
          specialisation,
          slotDurationMin: slotDurationMin || 30,
          bio,
          workingHours: {
            create: (workingHours || []).map((wh) => ({
              dayOfWeek: wh.dayOfWeek,
              startTime: wh.startTime,
              endTime: wh.endTime,
            })),
          },
        },
      },
    },
    include: { doctorProfile: { include: { workingHours: true } } },
  });

  res.status(201).json(doctorUser);
});

router.get("/doctors", async (req, res) => {
  const doctors = await prisma.doctorProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true } }, workingHours: true, leaves: true },
  });
  res.json(doctors);
});

router.put("/doctors/:id", async (req, res) => {
  const { specialisation, slotDurationMin, bio } = req.body;
  const updated = await prisma.doctorProfile.update({
    where: { id: req.params.id },
    data: { specialisation, slotDurationMin, bio },
  });
  res.json(updated);
});

// Mark a doctor on leave for a date; cancels + notifies any already-booked patients that day
router.post("/doctors/:id/leave", async (req, res) => {
  const { date, reason } = req.body;
  const leave = await prisma.doctorLeave.create({
    data: { doctorId: req.params.id, date: new Date(date), reason },
  });

  const affectedCount = await appointmentService.handleLeaveConflicts(req.params.id, date);

  res.status(201).json({ leave, affectedAppointmentsCancelled: affectedCount });
});

module.exports = router;
