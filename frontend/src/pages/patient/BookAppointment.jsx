import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client.js";

const STEPS = { SEARCH: "SEARCH", SLOTS: "SLOTS", SYMPTOMS: "SYMPTOMS", DONE: "DONE" };

export default function BookAppointment() {
  const [step, setStep] = useState(STEPS.SEARCH);
  const [specialisation, setSpecialisation] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState([]);
  const [heldAppointment, setHeldAppointment] = useState(null);
  const [symptomText, setSymptomText] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function searchDoctors(e) {
    e.preventDefault();
    const { data } = await client.get("/patient/doctors", { params: { specialisation } });
    setDoctors(data);
  }

  async function loadSlots(doctor) {
    setSelectedDoctor(doctor);
    const { data } = await client.get(`/patient/doctors/${doctor.id}/slots`, { params: { date } });
    setSlots(data);
    setStep(STEPS.SLOTS);
  }

  async function holdSlot(slot) {
    setError("");
    try {
      const { data } = await client.post("/patient/appointments/hold", {
        doctorId: selectedDoctor.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      setHeldAppointment(data);
      setStep(STEPS.SYMPTOMS);
    } catch (err) {
      setError(err.response?.data?.error || "That slot could not be held. Please try another.");
      // Refresh slot list since a conflict likely means someone else just booked it
      loadSlots(selectedDoctor);
    }
  }

  async function confirm(e) {
    e.preventDefault();
    setError("");
    try {
      await client.post(`/patient/appointments/${heldAppointment.id}/confirm`, { symptomText });
      setStep(STEPS.DONE);
    } catch (err) {
      setError(err.response?.data?.error || "Could not confirm appointment.");
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Book an Appointment</h2>

        {step === STEPS.SEARCH && (
          <form onSubmit={searchDoctors}>
            <label>Specialisation</label>
            <input
              placeholder="e.g. Cardiology, General Medicine"
              value={specialisation}
              onChange={(e) => setSpecialisation(e.target.value)}
            />
            <button className="btn" type="submit">Search doctors</button>
            <div style={{ marginTop: 16 }}>
              {doctors.map((d) => (
                <div key={d.id} className="card">
                  <strong>Dr. {d.user.name}</strong> — {d.specialisation}
                  <br />
                  <label style={{ marginTop: 8 }}>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  <button type="button" className="btn" onClick={() => loadSlots(d)}>
                    View slots
                  </button>
                </div>
              ))}
            </div>
          </form>
        )}

        {step === STEPS.SLOTS && (
          <div>
            <p>Available slots with Dr. {selectedDoctor.user.name} on {date}:</p>
            {error && <p style={{ color: "#dc2626" }}>{error}</p>}
            <div className="slot-grid">
              {slots.length === 0 && <p>No available slots for this date.</p>}
              {slots.map((s, i) => (
                <button key={i} className="slot-btn" onClick={() => holdSlot(s)}>
                  {new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
            <button className="btn secondary" onClick={() => setStep(STEPS.SEARCH)}>Back</button>
          </div>
        )}

        {step === STEPS.SYMPTOMS && (
          <form onSubmit={confirm}>
            <p>
              Slot held for {new Date(heldAppointment.startTime).toLocaleString()}. Please describe your
              symptoms so the doctor can prepare — this hold expires in 5 minutes.
            </p>
            <label>Symptoms</label>
            <textarea
              rows={4}
              value={symptomText}
              onChange={(e) => setSymptomText(e.target.value)}
              required
              placeholder="e.g. Persistent cough for 3 days, mild fever, fatigue..."
            />
            {error && <p style={{ color: "#dc2626" }}>{error}</p>}
            <button className="btn" type="submit">Confirm appointment</button>
          </form>
        )}

        {step === STEPS.DONE && (
          <div>
            <p>✅ Appointment confirmed! A confirmation email and calendar invite have been sent.</p>
            <button className="btn" onClick={() => navigate("/patient")}>Go to my appointments</button>
          </div>
        )}
      </div>
    </div>
  );
}
