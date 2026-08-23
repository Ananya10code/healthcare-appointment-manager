const express = require("express");
const { authenticate } = require("../middleware/auth");
const calendarService = require("../services/calendarService");

const router = express.Router();

// Redirect the logged-in user to Google's consent screen
router.get("/oauth/start", authenticate, (req, res) => {
  const url = calendarService.getAuthUrl();
  res.redirect(url);
});

// Google redirects here with ?code=...; we exchange it for tokens.
// Note: state param should carry the userId in production (omitted here for brevity —
// see README for the recommended signed-state approach).
router.get("/oauth/callback", authenticate, async (req, res) => {
  try {
    await calendarService.handleOAuthCallback(req.user.id, req.query.code);
    res.redirect(`${process.env.FRONTEND_URL}/calendar-connected`);
  } catch (err) {
    res.status(500).json({ error: "Failed to connect Google Calendar", details: err.message });
  }
});

module.exports = router;
