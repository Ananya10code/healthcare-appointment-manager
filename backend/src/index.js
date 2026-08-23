require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const doctorRoutes = require("./routes/doctor.routes");
const patientRoutes = require("./routes/patient.routes");
const calendarRoutes = require("./routes/calendar.routes");
const reminderJob = require("./jobs/reminderJob");

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/calendar", calendarRoutes);

// Centralized error handler so unexpected errors return JSON instead of crashing the process
app.use((err, req, res, next) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Healthcare Appointment Manager API listening on port ${PORT}`);
  reminderJob.start();
});
