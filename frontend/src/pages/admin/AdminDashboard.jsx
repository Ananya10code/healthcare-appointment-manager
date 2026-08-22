import React, { useEffect, useState } from "react";
import client from "../../api/client.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AdminDashboard() {
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({
    name: "", email: "", password: "", specialisation: "", slotDurationMin: 30,
  });
  const [workingHours, setWorkingHours] = useState([{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }]);

  function load() {
    client.get("/admin/doctors").then((res) => setDoctors(res.data));
  }
  useEffect(load, []);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  function updateHour(idx, field, value) {
    setWorkingHours((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)));
  }

  function addHourRow() {
    setWorkingHours((prev) => [...prev, { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }]);
  }

  async function createDoctor(e) {
    e.preventDefault();
    await client.post("/admin/doctors", { ...form, workingHours });
    setForm({ name: "", email: "", password: "", specialisation: "", slotDurationMin: 30 });
    setWorkingHours([{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }]);
    load();
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Add a Doctor</h2>
        <form onSubmit={createDoctor}>
          <label>Name</label>
          <input value={form.name} onChange={update("name")} required />
          <label>Email</label>
          <input type="email" value={form.email} onChange={update("email")} required />
          <label>Temporary password</label>
          <input type="password" value={form.password} onChange={update("password")} required minLength={6} />
          <label>Specialisation</label>
          <input value={form.specialisation} onChange={update("specialisation")} required />
          <label>Slot duration (minutes)</label>
          <input type="number" value={form.slotDurationMin} onChange={update("slotDurationMin")} />

          <label>Working hours</label>
          {workingHours.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select value={h.dayOfWeek} onChange={(e) => updateHour(i, "dayOfWeek", Number(e.target.value))}>
                {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
              </select>
              <input type="time" value={h.startTime} onChange={(e) => updateHour(i, "startTime", e.target.value)} />
              <input type="time" value={h.endTime} onChange={(e) => updateHour(i, "endTime", e.target.value)} />
            </div>
          ))}
          <button type="button" className="btn secondary" onClick={addHourRow}>+ Add day</button>
          <br /><br />
          <button className="btn" type="submit">Create doctor</button>
        </form>
      </div>

      <h2>Doctors</h2>
      {doctors.map((d) => (
        <div className="card" key={d.id}>
          <strong>Dr. {d.user.name}</strong> — {d.specialisation} ({d.slotDurationMin} min slots)
          <div style={{ fontSize: 13 }}>
            {d.workingHours.map((h) => `${DAYS[h.dayOfWeek]} ${h.startTime}-${h.endTime}`).join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}
