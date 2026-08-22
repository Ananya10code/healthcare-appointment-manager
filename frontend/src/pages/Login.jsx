import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const { data } = await client.post("/auth/login", { email, password });
      login(data.token, data.user);
      const path =
        data.user.role === "ADMIN" ? "/admin" : data.user.role === "DOCTOR" ? "/doctor" : "/patient";
      navigate(path);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <div className="card">
        <h2>Log in</h2>
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p style={{ color: "#dc2626" }}>{error}</p>}
          <button className="btn" type="submit">Log in</button>
        </form>
        <p style={{ fontSize: 13, marginTop: 12 }}>
          Seeded admin: admin@clinic.example.com / Admin@123<br />
          Seeded doctor: dr.jane@clinic.example.com / Doctor@123
        </p>
      </div>
    </div>
  );
}
