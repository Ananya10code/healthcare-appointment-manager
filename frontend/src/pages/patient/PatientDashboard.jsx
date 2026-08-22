import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../../api/client.js";

export default function PatientDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get("/patient/appointments").then((res) => {
      setAppointments(res.data);
      setLoading(false);
    });
  }, []);

  async function cancel(id) {
    if (!confirm("Cancel this appointment?")) return;
    await client.post(`/patient/appointments/${id}/cancel`);
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "CANCELLED" } : a))
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2>My Appointments</h2>
        <Link className="btn" to="/patient/book">Book a new appointment</Link>
      </div>

      {loading && <p>Loading...</p>}
      {!loading && appointments.length === 0 && <p>No appointments yet.</p>}

      {appointments.map((a) => {
        const preVisit = a.preVisitSummary ? JSON.parse(a.preVisitSummary) : null;
        const postVisit = a.postVisitSummary ? JSON.parse(a.postVisitSummary) : null;
        return (
          <div className="card" key={a.id}>
            <strong>Dr. {a.doctor?.user?.name}</strong> — {new Date(a.startTime).toLocaleString()}
            <div>
              Status: <b>{a.status}</b>
              {a.preVisitUrgency && (
                <span className={`badge ${cap(a.preVisitUrgency)}`} style={{ marginLeft: 8 }}>
                  {cap(a.preVisitUrgency)} urgency
                </span>
              )}
            </div>
            {preVisit && <p style={{ fontSize: 13 }}>Chief complaint: {preVisit.chiefComplaint}</p>}
            {postVisit && (
              <div style={{ fontSize: 13, background: "#f0fdf4", padding: 8, borderRadius: 6 }}>
                <strong>Visit summary:</strong> {postVisit.summary}
                {postVisit.medicationSchedule?.length > 0 && (
                  <ul>
                    {postVisit.medicationSchedule.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
              </div>
            )}
            {(a.status === "BOOKED") && (
              <button className="btn danger" style={{ marginTop: 8 }} onClick={() => cancel(a.id)}>
                Cancel
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function cap(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
