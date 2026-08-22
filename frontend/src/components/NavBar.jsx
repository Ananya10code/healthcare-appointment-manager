import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const dashboardPath =
    user?.role === "ADMIN" ? "/admin" : user?.role === "DOCTOR" ? "/doctor" : "/patient";

  return (
    <nav>
      <div className="links">
        <Link to="/">Healthcare Manager</Link>
        {user && <Link to={dashboardPath}>Dashboard</Link>}
      </div>
      <div>
        {user ? (
          <>
            <span style={{ marginRight: 12 }}>{user.name} ({user.role})</span>
            <button className="btn secondary" onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>{" "}
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
