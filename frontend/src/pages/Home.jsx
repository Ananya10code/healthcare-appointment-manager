import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="container">
      <div className="card">
        <h1>Healthcare Appointment &amp; Follow-up Manager</h1>
        <p>
          Book appointments, share symptoms in advance, and get AI-assisted pre-visit and
          post-visit summaries, with email and calendar sync for both patients and doctors.
        </p>
        <Link className="btn" to="/register">Get started as a patient</Link>
      </div>
    </div>
  );
}
