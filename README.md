# Healthcare Appointment & Follow-up Manager

A clinic platform with separate portals for **patients**, **doctors**, and an **admin**. Patients
book appointments and submit symptoms in advance; doctors get an AI-generated pre-visit summary;
patients get an AI-generated, plain-language post-visit summary; both sides stay informed by
email and Google Calendar.

## Tech Stack

- **Backend:** Node.js, Express, Prisma ORM, SQLite (swap to Postgres for production)
- **Frontend:** React 18 + Vite, React Router, Axios
- **Auth:** JWT, bcrypt password hashing, role-based access control (PATIENT / DOCTOR / ADMIN)
- **LLM:** Anthropic API (Claude) for pre-visit and post-visit summaries
- **Email:** Nodemailer (works with SendGrid, Mailgun, or any SMTP relay)
- **Calendar:** Google Calendar API via OAuth 2.0
- **Background jobs:** node-cron for hold-expiry, medication reminders, and notification retries

## Project Structure

```
backend/
  prisma/schema.prisma      # DB schema
  prisma/seed.js            # seeds an admin + sample doctor
  src/
    index.js                # Express app entry point
    config/db.js            # Prisma client singleton
    middleware/              # JWT auth + role guard
    routes/                  # auth, admin, doctor, patient, calendar
    services/
      appointmentService.js  # booking, slot-hold, conflict prevention, leave handling
      llmService.js          # Anthropic API calls for summaries
      emailService.js        # Nodemailer + notification logging
      calendarService.js     # Google Calendar OAuth + event CRUD
    jobs/reminderJob.js      # cron: expire holds, send reminders, retry failed emails
frontend/
  src/
    pages/                   # patient, doctor, admin dashboards + booking flow
    context/AuthContext.jsx  # stores logged-in user/role
    api/client.js            # Axios instance with JWT header injection
SYSTEM_DESIGN.md             # write-up covering conflict/leave/notification design
```

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # fill in JWT secret, Anthropic key, SMTP creds, Google OAuth creds
npx prisma migrate dev --name init
npm run seed               # creates an admin + sample doctor login
npm run dev                 # starts on http://localhost:4000
```

Seeded logins (from `npm run seed`):
- Admin: `admin@clinic.example.com` / `Admin@123`
- Doctor: `dr.jane@clinic.example.com` / `Doctor@123`

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env       # set VITE_API_URL if backend isn't on localhost:4000
npm run dev                 # starts on http://localhost:5173
```

### 3. Google Calendar setup

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the
   **Google Calendar API**.
2. Create an **OAuth 2.0 Client ID** (Web application). Add
   `http://localhost:4000/api/calendar/oauth/callback` as an authorized redirect URI.
3. Copy the client ID/secret into `backend/.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. A logged-in user connects their calendar by visiting `GET /api/calendar/oauth/start`
   (add a "Connect Google Calendar" button in the UI pointing here). Tokens are stored in the
   `GoogleToken` table and refreshed automatically by the `googleapis` client.
5. If a user hasn't connected Google Calendar, event creation is skipped silently — booking
   still succeeds (see "Graceful degradation" in `SYSTEM_DESIGN.md`).

### 4. Email setup

Any SMTP provider works. For SendGrid: set `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey`,
`SMTP_PASS=<your SendGrid API key>`. For local testing without a real provider, use
[Mailtrap](https://mailtrap.io) or [Ethereal Email](https://ethereal.email) sandbox SMTP creds.

## API Overview

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | Patient self-registration |
| POST | `/api/auth/login` | public | Login, returns JWT |
| POST | `/api/admin/doctors` | ADMIN | Create doctor account + working hours |
| GET | `/api/admin/doctors` | ADMIN | List doctors |
| POST | `/api/admin/doctors/:id/leave` | ADMIN | Mark doctor on leave; cancels + notifies conflicts |
| GET | `/api/patient/doctors?specialisation=` | PATIENT | Search doctors |
| GET | `/api/patient/doctors/:id/slots?date=` | PATIENT | Get open slots for a date |
| POST | `/api/patient/appointments/hold` | PATIENT | Hold a slot (5 min) |
| POST | `/api/patient/appointments/:id/confirm` | PATIENT | Submit symptoms, confirm booking |
| GET | `/api/patient/appointments` | PATIENT | List own appointments |
| POST | `/api/patient/appointments/:id/cancel` | PATIENT | Cancel |
| GET | `/api/doctor/appointments` | DOCTOR | Own upcoming/completed appointments |
| POST | `/api/doctor/appointments/:id/complete` | DOCTOR | Submit notes/prescription, triggers post-visit summary |
| POST | `/api/doctor/leave` | DOCTOR | Mark own leave day |
| GET | `/api/calendar/oauth/start` | authenticated | Begin Google Calendar OAuth |
| GET | `/api/calendar/oauth/callback` | authenticated | OAuth redirect target |

## LLM Prompts Used

**Pre-visit summary** (`services/llmService.js::generatePreVisitSummary`):
> "Analyse these symptoms and return ONLY a JSON object with keys: urgency (Low/Medium/High),
> chiefComplaint, questions (array of 3 suggested questions for the doctor). Symptoms: `<symptoms>`"

**Post-visit summary** (`services/llmService.js::generatePostVisitSummary`):
> "Convert these clinical notes into a patient-friendly summary. Return ONLY a JSON object with
> keys: summary, medicationSchedule (array), followUp. Clinical notes: `<notes>`"

Both prompts force strict JSON output so structured fields (urgency, medication list) can be
stored and rendered distinctly from free text. Both calls are wrapped in try/catch with a safe
fallback object (`failed: true`) so an LLM outage or malformed response never blocks booking or
visit completion — see `SYSTEM_DESIGN.md` for details.

## Database Schema

See `backend/prisma/schema.prisma`. Key tables: `User` (role-based), `DoctorProfile`,
`WorkingHour` (recurring weekly availability), `DoctorLeave`, `Appointment` (with `HELD` /
`BOOKED` / `CANCELLED` / `COMPLETED` / `NO_SHOW` status and a slot-hold expiry timestamp),
`MedicationReminder`, `NotificationLog` (audit trail + retry queue), `GoogleToken`.

## Deployment

Any free-tier host works (Render, Railway, Vercel for frontend + Render for backend). For SQLite
on ephemeral hosts, mount a persistent disk or switch `datasource db` in `schema.prisma` to
`postgresql` and point `DATABASE_URL` at a managed Postgres instance (e.g. Neon, Supabase, Render
Postgres free tier).

## What's Intentionally Minimal

Per assignment submission guidelines, dependencies are kept to the minimum required set (no
UI component libraries, no state-management libraries — plain React state + context is
sufficient at this scope). No `node_modules`, `.env`, or build artifacts are included in the
submission; run `npm install` in both `backend/` and `frontend/`.
