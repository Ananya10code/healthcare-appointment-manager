const { google } = require("googleapis");
const prisma = require("../config/db");

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    prompt: "consent",
  });
}

async function handleOAuthCallback(userId, code) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);

  await prisma.googleToken.upsert({
    where: { userId },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      expiryDate: new Date(tokens.expiry_date),
    },
    create: {
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: new Date(tokens.expiry_date),
    },
  });
}

async function getAuthorizedClientForUser(userId) {
  const record = await prisma.googleToken.findUnique({ where: { userId } });
  if (!record) return null; // user hasn't connected Google Calendar — calendar step is skipped gracefully

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    access_token: record.accessToken,
    refresh_token: record.refreshToken,
    expiry_date: record.expiryDate.getTime(),
  });
  return oAuth2Client;
}

/**
 * Creates a calendar event for a user if they've connected Google Calendar.
 * Returns the created event id, or null if the user has no connection or the call fails.
 * Never throws — calendar sync is a best-effort side effect, not a booking blocker.
 */
async function createEvent(userId, { summary, description, startTime, endTime }) {
  try {
    const auth = await getAuthorizedClientForUser(userId);
    if (!auth) return null;

    const calendar = google.calendar({ version: "v3", auth });
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary,
        description,
        start: { dateTime: new Date(startTime).toISOString() },
        end: { dateTime: new Date(endTime).toISOString() },
      },
    });
    return event.data.id;
  } catch (err) {
    console.error("[calendarService] createEvent failed:", err.message);
    return null;
  }
}

async function updateEvent(userId, eventId, { summary, description, startTime, endTime }) {
  try {
    const auth = await getAuthorizedClientForUser(userId);
    if (!auth || !eventId) return false;
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.update({
      calendarId: "primary",
      eventId,
      requestBody: {
        summary,
        description,
        start: { dateTime: new Date(startTime).toISOString() },
        end: { dateTime: new Date(endTime).toISOString() },
      },
    });
    return true;
  } catch (err) {
    console.error("[calendarService] updateEvent failed:", err.message);
    return false;
  }
}

async function deleteEvent(userId, eventId) {
  try {
    const auth = await getAuthorizedClientForUser(userId);
    if (!auth || !eventId) return false;
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.delete({ calendarId: "primary", eventId });
    return true;
  } catch (err) {
    console.error("[calendarService] deleteEvent failed:", err.message);
    return false;
  }
}

module.exports = { getAuthUrl, handleOAuthCallback, createEvent, updateEvent, deleteEvent };
