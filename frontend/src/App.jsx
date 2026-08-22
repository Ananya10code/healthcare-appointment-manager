import React from "react";
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import PatientDashboard from "./pages/patient/PatientDashboard.jsx";
import BookAppointment from "./pages/patient/BookAppointment.jsx";
import DoctorDashboard from "./pages/doctor/DoctorDashboard.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/patient"
          element={<ProtectedRoute role="PATIENT"><PatientDashboard /></ProtectedRoute>}
        />
        <Route
          path="/patient/book"
          element={<ProtectedRoute role="PATIENT"><BookAppointment /></ProtectedRoute>}
        />
        <Route
          path="/doctor"
          element={<ProtectedRoute role="DOCTOR"><DoctorDashboard /></ProtectedRoute>}
        />
        <Route
          path="/admin"
          element={<ProtectedRoute role="ADMIN"><AdminDashboard /></ProtectedRoute>}
        />
      </Routes>
    </>
  );
}
