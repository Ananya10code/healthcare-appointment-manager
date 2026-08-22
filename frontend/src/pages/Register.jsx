import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const { data } = await client.post("/auth/register", form);
      login(data.token, data.user);
      navigate("/patient");
    } catch (err) {
      setError(err.response?.data?.error?.formErrors?.join(", ") || "Registration failed");
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <div className="card">
        <h2>Patient Registration</h2>
        <form onSubmit={handleSubmit}>
          <label>Full name</label>
          <input value={form.name} onChange={update("name")} required />
          <label>Email</label>
          <input type="email" value={form.email} onChange={update("email")} required />
          <label>Phone</label>
          <input value={form.phone} onChange={update("phone")} />
          <label>Password</label>
          <input type="password" value={form.password} onChange={update("password")} required minLength={6} />
          {error && <p style={{ color: "#dc2626" }}>{error}</p>}
          <button className="btn" type="submit">Register</button>
        </form>
      </div>
    </div>
  );
}
