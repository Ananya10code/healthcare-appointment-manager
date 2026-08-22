import React, { useEffect, useState } from "react";
import client from "../../api/client.js";

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [notes, setNotes] = useState("");
  const [prescription, setPrescription] = useState("");
  const [leaveDate, setLeaveDate] = useState("");

  function load() {
    client.get("/doctor/appointments").then((res) => setAppointments(res.data));
  }

  useEffect(load, []);

  async function completeVisit(id) {
    await client.post(`/doctor/appointments/${id}/complete`, { doctorNotes: notes, prescription });
    setActiveId(null);
    setNotes("");
    setPrescription("");
    load();
  }

  async function markLeave(e) {
    e.preventDefault();
    const res = await client.post("/doctor/leave", { date: leaveDate, reason: "Personal leave" });
    alert(`Leave recorded. ${res.data.affectedAppointmentsCancelled} affected patient(s) notified.`);
    setLeaveDate("");
    load();
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Mark a Leave Day</h2>
        <form onSubmit={markLeave} style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <label>Date</label>
            <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} required />
          </div>
          <button className="btn" type="submit" style={{ height: 38 }}>Mark leave</button>
        </form>
      </div>

      <h2>Upcoming Appointments</h2>
      {appointments.map((a) => {
        const preVisit = a.preVisitSummary ? JSON.parse(a.preVisitSummary) : null;
        return (
          <div className="card" key={a.id}>
            <strong>{a.patient?.name}</strong> — {new Date(a.startTime).toLocaleString()}
            {a.preVisitUrgency && (
              <span className={`badge ${cap(a.preVisitUrgency)}`} style={{ marginLeft: 8 }}>
                {cap(a.preVisitUrgency)} urgency
              </span>
            )}
            {preVisit && (
              <div style={{ fontSize: 13, marginTop: 8, background: "#eff6ff", padding: 8, borderRadius: 6 }}>
                <strong>Chief complaint:</strong> {preVisit.chiefComplaint}
                <ul>
                  {preVisit.questions?.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}

            {a.status === "BOOKED" && activeId !== a.id && (
              <button className="btn" style={{ marginTop: 8 }} onClick={() => setActiveId(a.id)}>
                Complete visit
              </button>
            )}

            {activeId === a.id && (
              <div style={{ marginTop: 8 }}>
                <label>Clinical notes</label>
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                <label>Prescription</label>
                <textarea rows={2} value={prescription} onChange={(e) => setPrescription(e.target.value)} />
                <button className="btn" onClick={() => completeVisit(a.id)}>Save & notify patient</button>
              </div>
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
