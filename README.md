# Healthcare Appointment & Follow-up Manager

A clinic platform with three portals — **Patient**, **Doctor**, and **Admin** — that goes beyond a
basic booking form. Patients share symptoms in advance and get reminders, doctors get an AI
pre-visit summary before each appointment, and both sides get timely confirmations by email and
Google Calendar.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Setup — Backend](#setup--backend)
6. [Setup — Frontend](#setup--frontend)
7. [Seeded Test Accounts](#seeded-test-accounts)
8. [Environment Variables Reference](#environment-variables-reference)
9. [Google Calendar Setup](#google-calendar-setup)
10. [Email Setup](#email-setup)
11. [API Reference](#api-reference)
12. [Database Schema](#database-schema)
13. [LLM Prompts](#llm-prompts)
14. [Booking Flow Explained](#booking-flow-explained)
15. [Background Jobs](#background-jobs)
16. [Deployment](#deployment)
17. [Troubleshooting](#troubleshooting)
18. [Design Notes](#design-notes)

---

## Features

**Patient portal**
- Register and log in
- Search doctors by specialisation
- View real-time available slots for a chosen date
- Book a slot, fill in a pre-visit symptom form, and confirm
- View appointment history, urgency flags, and AI-generated post-visit summaries
- Cancel an upcoming appointment

**Doctor portal**
- View upcoming appointments with an AI-generated pre-visit summary (urgency, chief complaint,
  suggested questions)
- Submit post-visit clinical notes and prescription
- Automatic AI conversion of notes into a patient-friendly summary + medication schedule
- Mark personal leave days (auto-cancels and notifies affected patients)

**Admin portal**
- Create doctor accounts with specialisation, slot duration, and weekly working hours
- View all doctors and their schedules
- Mark a doctor on leave on behalf of the clinic (same conflict-handling as above)

**Platform-wide**
- Role-based JWT authentication (PATIENT / DOCTOR / ADMIN)
- Transaction-safe double-booking prevention with a 5-minute slot-hold window
- Email notifications for booking, cancellation, reminders, and leave conflicts, with a
  retryable audit log
- Google Calendar sync (create/update/delete events) for both patient and doctor, per booking
- Medication reminders scheduled automatically from the post-visit prescription
- Every LLM and calendar call degrades gracefully — a failure never blocks a booking

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Node.js, Express |
| ORM / DB | Prisma + SQLite (swap to Postgres for production) |
| Auth | JWT, bcrypt password hashing |
| Frontend | React 18, Vite, React Router, Axios |
| LLM | Anthropic API (Claude) |
| Email | Nodemailer (SendGrid / Mailgun / any SMTP) |
| Calendar | Google Calendar API, OAuth 2.0 |
| Background jobs | node-cron |

---

## Project Structure

```
healthcare-appointment-manager/
├── README.md
├── SYSTEM_DESIGN.md              # architecture write-up (conflict prevention, leave handling, etc.)
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma          # full DB schema
│   │   └── seed.js                # seeds an admin + sample doctor
│   └── src/
│       ├── index.js               # Express app entry point
│       ├── config/db.js           # Prisma client singleton
│       ├── middleware/
│       │   ├── auth.js            # JWT verification
│       │   └── roleCheck.js       # role-based access control
│       ├── routes/
│       │   ├── auth.routes.js
│       │   ├── admin.routes.js
│       │   ├── doctor.routes.js
│       │   ├── patient.routes.js
│       │   └── calendar.routes.js
│       ├── services/
│       │   ├── appointmentService.js  # booking, slot-hold, conflict prevention, leave handling
│       │   ├── llmService.js          # Anthropic API calls for summaries
│       │   ├── emailService.js        # Nodemailer + notification logging
│       │   └── calendarService.js     # Google Calendar OAuth + event CRUD
│       └── jobs/
│           └── reminderJob.js     # cron: expire holds, send reminders, retry failed emails
└── frontend/
    ├── .env.example
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── api/client.js          # Axios instance with JWT header injection
        ├── context/AuthContext.jsx
        ├── components/
        │   ├── NavBar.jsx
        │   └── ProtectedRoute.jsx
        └── pages/
            ├── Home.jsx
            ├── Login.jsx
            ├── Register.jsx
            ├── patient/
            │   ├── PatientDashboard.jsx
            │   └── BookAppointment.jsx
            ├── doctor/
            │   └── DoctorDashboard.jsx
            └── admin/
                └── AdminDashboard.jsx
```

---

## Prerequisites

- Node.js 18 or later, and npm
- No separate database server required — SQLite is a local file (`backend/dev.db`)
- (Optional) An Anthropic API key, SMTP credentials, and a Google Cloud OAuth client, if you want
  AI summaries, real emails, and calendar sync respectively. The app runs and degrades gracefully
  without any of these.

---

## Setup — Backend

```bash
cd backend
npm install
cp .env.example .env
# open .env and set at minimum JWT_SECRET to any random string
npx prisma migrate dev --name init
npm run seed
npm run dev
```

The server starts on **http://localhost:4000**. You should see:

```
Healthcare Appointment Manager API listening on port 4000
```

---

## Setup — Frontend

Open a **second terminal**:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The app starts on **http://localhost:5173** and is already configured to talk to
`http://localhost:4000/api` via `VITE_API_URL` in `frontend/.env`.

---

## Seeded Test Accounts

Running `npm run seed` in `backend/` creates:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@clinic.example.com` | `Admin@123` |
| Doctor | `dr.jane@clinic.example.com` | `Doctor@123` |

Register a new account through the UI to test the **Patient** role.

---

## Environment Variables Reference

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `PORT` | no | Server port (default 4000) |
| `DATABASE_URL` | yes | Prisma connection string (SQLite file path or Postgres URL) |
| `JWT_SECRET` | yes | Secret used to sign auth tokens |
| `JWT_EXPIRES_IN` | no | Token lifetime (default `7d`) |
| `ANTHROPIC_API_KEY` | optional | Enables AI pre-/post-visit summaries |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-4-6` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | optional | Enables real email sending |
| `EMAIL_FROM` | optional | From-address shown on outgoing emails |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | optional | Enables Google Calendar sync |
| `FRONTEND_URL` | yes | Used for CORS and OAuth redirect target |

### `frontend/.env`

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | yes | Base URL of the backend API |

> Anything marked "optional" simply causes that specific feature to fall back gracefully
> (generic summary text, skipped email, skipped calendar sync) rather than breaking the app.

---

## Google Calendar Setup

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the
   **Google Calendar API**.
2. Create an **OAuth 2.0 Client ID** (Web application type).
3. Add `http://localhost:4000/api/calendar/oauth/callback` as an authorized redirect URI.
4. Copy the client ID and secret into `backend/.env` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.
5. A logged-in user connects their calendar by visiting `GET /api/calendar/oauth/start`
   (wire a "Connect Google Calendar" button to this endpoint). Tokens are stored in the
   `GoogleToken` table and refreshed automatically.
6. If a user never connects, calendar sync is skipped silently for that user — booking still
   succeeds on both the patient's and doctor's side.

---

## Email Setup

Any SMTP provider works out of the box:

- **SendGrid:** `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey`, `SMTP_PASS=<your SendGrid API key>`
- **Mailgun:** use your Mailgun SMTP credentials
- **Local testing (no real provider):** use a sandbox like
  [Mailtrap](https://mailtrap.io) or [Ethereal Email](https://ethereal.email)

---

## API Reference

All authenticated routes expect `Authorization: Bearer <token>`.

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | Patient self-registration |
| POST | `/api/auth/login` | public | Login, returns JWT |
| POST | `/api/admin/doctors` | ADMIN | Create doctor account + working hours |
| GET | `/api/admin/doctors` | ADMIN | List doctors |
| PUT | `/api/admin/doctors/:id` | ADMIN | Update doctor profile |
| POST | `/api/admin/doctors/:id/leave` | ADMIN | Mark doctor on leave; cancels + notifies conflicts |
| GET | `/api/patient/doctors?specialisation=` | PATIENT | Search doctors |
| GET | `/api/patient/doctors/:id/slots?date=YYYY-MM-DD` | PATIENT | Get open slots for a date |
| POST | `/api/patient/appointments/hold` | PATIENT | Hold a slot (5 min) |
| POST | `/api/patient/appointments/:id/confirm` | PATIENT | Submit symptoms, confirm booking |
| GET | `/api/patient/appointments` | PATIENT | List own appointments |
| POST | `/api/patient/appointments/:id/cancel` | PATIENT | Cancel an appointment |
| GET | `/api/doctor/appointments` | DOCTOR | Own upcoming/completed appointments |
| POST | `/api/doctor/appointments/:id/complete` | DOCTOR | Submit notes/prescription, triggers post-visit summary |
| POST | `/api/doctor/leave` | DOCTOR | Mark own leave day |
| GET | `/api/calendar/oauth/start` | authenticated | Begin Google Calendar OAuth |
| GET | `/api/calendar/oauth/callback` | authenticated | OAuth redirect target |
| GET | `/health` | public | Health check |

**Example: booking flow**

```bash
# 1. Hold a slot
curl -X POST http://localhost:4000/api/patient/appointments/hold \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"doctorId":"<id>","startTime":"2026-08-25T09:00:00Z","endTime":"2026-08-25T09:30:00Z"}'

# 2. Confirm with symptoms (within 5 minutes)
curl -X POST http://localhost:4000/api/patient/appointments/<appointmentId>/confirm \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"symptomText":"Persistent cough for 3 days, mild fever, fatigue"}'
```

---

## Database Schema

Full definition in `backend/prisma/schema.prisma`. Key models:

- **User** — role-based (`PATIENT` / `DOCTOR` / `ADMIN`)
- **DoctorProfile** — specialisation, slot duration, bio
- **WorkingHour** — recurring weekly availability per doctor
- **DoctorLeave** — one-off leave days
- **Appointment** — `status` of `HELD` / `BOOKED` / `CANCELLED` / `COMPLETED` / `NO_SHOW`, plus
  `holdExpiresAt` for the slot-hold mechanism, pre-visit and post-visit summary fields, and
  Google Calendar event IDs for both parties
- **MedicationReminder** — generated from the post-visit prescription
- **NotificationLog** — audit trail of every email attempt, with retry support
- **GoogleToken** — per-user OAuth tokens for calendar sync

---

## LLM Prompts

**Pre-visit summary** (`services/llmService.js::generatePreVisitSummary`)
> "Analyse these symptoms and return ONLY a JSON object with keys: urgency (Low/Medium/High),
> chiefComplaint, questions (array of 3 suggested questions for the doctor). Symptoms: `<symptoms>`"

**Post-visit summary** (`services/llmService.js::generatePostVisitSummary`)
> "Convert these clinical notes into a patient-friendly summary. Return ONLY a JSON object with
> keys: summary, medicationSchedule (array), followUp. Clinical notes: `<notes>`"

Both prompts force strict JSON so structured fields (urgency, medication list) can be stored and
rendered distinctly from free text. Both calls are wrapped in a 15-second timeout and a try/catch
with a safe fallback object (`failed: true`) — an LLM outage or malformed response never blocks
booking or visit completion.

---

## Booking Flow Explained

1. **Search** — patient searches doctors by specialisation.
2. **View slots** — available slots are computed from the doctor's weekly working hours minus
   any `BOOKED` appointment or unexpired `HELD` hold, and minus any leave day.
3. **Hold** — clicking a slot creates a `HELD` row inside a database transaction that also checks
   for conflicts, so two patients can never both secure the same slot. The hold expires in
   5 minutes.
4. **Symptom form** — the patient describes symptoms while the slot is held.
5. **Confirm** — the hold is re-validated (still `HELD`, not expired) and flipped to `BOOKED`
   inside another transaction. The pre-visit LLM summary, confirmation emails, and calendar
   events are created as a follow-up step.
6. **Visit day** — the doctor sees the pre-visit summary, then submits notes and a prescription
   after the visit, which triggers the post-visit LLM summary and medication reminders.

See `SYSTEM_DESIGN.md` for the full design rationale, including doctor-leave conflict handling
and notification retry logic.

---

## Background Jobs

Run automatically once the backend starts (`src/jobs/reminderJob.js`):

| Schedule | Job |
|---|---|
| Every 1 minute | Release expired slot holds back to available |
| Every 15 minutes | Send due medication reminders |
| Every 10 minutes | Retry failed email notifications (up to 5 attempts each) |

---

## Deployment

- **Frontend:** any static host (Vercel, Netlify) — run `npm run build` in `frontend/` and deploy
  the `dist/` folder.
- **Backend:** any Node host with a free tier (Render, Railway).
- **Database:** SQLite works for quick demos, but free-tier hosts often have ephemeral disks. For
  anything persistent, switch `datasource db` in `schema.prisma` to `provider = "postgresql"` and
  point `DATABASE_URL` at a managed Postgres instance (Neon, Supabase, or Render's free Postgres).
- Remember to set `FRONTEND_URL` on the backend and `VITE_API_URL` on the frontend to your real
  deployed URLs, and update the Google OAuth redirect URI to match.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Failed to fetch sha256 checksum` during `prisma generate` | Network/firewall blocking `binaries.prisma.sh`. Retry with internet access, or set `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` if offline. |
| Frontend shows network errors / CORS errors | Confirm the backend is running on port 4000 and `FRONTEND_URL` in `backend/.env` matches `http://localhost:5173`. |
| "This slot was just taken" | Expected behavior — another patient booked it first. Refresh the slot list. |
| "Your hold on this slot has expired" | You took longer than 5 minutes on the symptom form. Start the booking again. |
| Pre-visit/post-visit summary looks generic | `ANTHROPIC_API_KEY` is missing/invalid, or the LLM call failed — this is the graceful fallback, not a bug. Check backend logs for `[llmService]` errors. |
| No confirmation email received | SMTP credentials missing/invalid — check `NotificationLog` rows in the DB, or backend logs for `[emailService]` errors. |
| Google Calendar event not created | User hasn't completed the OAuth flow at `/api/calendar/oauth/start`, or Google credentials are missing. |

---

## Design Notes

Dependencies are kept minimal by design (plain React state + context instead of a
state-management library; no UI component library). The repository excludes
`node_modules/`, `.env`, and build artifacts — run `npm install` in both `backend/` and
`frontend/` after cloning or extracting. See `SYSTEM_DESIGN.md` for the full write-up on
double-booking prevention, the slot-hold mechanism, doctor-leave conflict handling, and
notification reliability.
