# System Design Write-up

*(word count target: ≤ 800)*

## 1. Double-Booking Prevention

An `Appointment` row carries a `status` (`HELD`, `BOOKED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`)
and a `(doctorId, startTime, endTime, status)` composite index. When a patient attempts to book a
slot, `appointmentService.holdSlot()` runs inside a single `prisma.$transaction`:

1. It queries for any existing `BOOKED` appointment, or any `HELD` appointment whose hold hasn't
   expired, that overlaps the requested time range for that doctor.
2. If none exists, it inserts the new row as `HELD` in the *same* transaction.

Because both the conflict check and the insert happen inside one transaction against the same
rows, the database's transaction isolation guarantees the second of two simultaneous requests
sees the first request's row before deciding whether a conflict exists — it cannot both "see no
conflict" and insert an overlapping row. This is enforced at the application layer rather than a
raw unique DB constraint because slot overlap is a range condition, not an equality condition, so
a simple unique index on `(doctorId, startTime)` wouldn't catch partial overlaps from variable-
length slots. The transaction-guarded check-then-insert pattern generalizes to any slot duration.

## 2. Slot-Hold Mechanism

Booking is a two-step flow: **hold** a slot, then **confirm** with symptoms. This exists because
the pre-visit symptom form takes real time to fill in, and we don't want to either (a) let two
patients simultaneously believe they've secured the same slot while one fills out a form, or (b)
permanently lock a slot if a patient abandons the flow.

- `holdSlot()` creates a row with `status = HELD` and `holdExpiresAt = now + 5 minutes`.
- Slot-availability queries (`getAvailableSlots`) exclude any `HELD` row whose `holdExpiresAt` is
  still in the future, so an active hold blocks other patients from seeing that slot as open.
- `confirmAppointment()` re-checks, inside its own transaction, that the hold is still `HELD` and
  unexpired before flipping it to `BOOKED`. If the hold lapsed (patient took too long), the
  transaction throws a `HOLD_EXPIRED` error and the client is told to rebook — this prevents a
  stale confirm from silently reviving an already-released slot.
- A cron job (`releaseExpiredHolds`, run every minute) flips any expired `HELD` row to
  `CANCELLED` in bulk, so abandoned holds don't need to wait for another patient's query to be
  implicitly filtered out — the slot becomes genuinely free and visible again.

## 3. Doctor Leave Conflict Handling

When an admin or doctor records a `DoctorLeave` for a date, `handleLeaveConflicts()` immediately:

1. Finds every `BOOKED` appointment for that doctor within the leave date's 24-hour window.
2. Cancels each one (`status = CANCELLED`).
3. Sends a dedicated `LEAVE_CONFLICT` email to each affected patient explaining the doctor is
   unavailable and inviting them to rebook.
4. Deletes the corresponding Google Calendar events for both patient and doctor, so no stale
   invite remains on either calendar.

This runs synchronously as part of the leave-creation request so the admin/doctor gets an
immediate count of how many patients were affected, rather than a silent background cleanup that
could leave a window where patients are unaware their appointment was cancelled.

## 4. Notification Reliability

Every email attempt — booking confirmation, cancellation, reminder, leave conflict — is written
to a `NotificationLog` row *before* the send is attempted, with `status = PENDING`, and updated to
`SENT` or `FAILED` (with `lastError`) afterward. This gives:

- **Auditability:** every notification, successful or not, is queryable.
- **Retry without duplication:** a cron job (`retryFailedNotifications`, every 10 minutes) re-sends
  any `FAILED` log row with `attempts < 5`, incrementing the attempt counter each time, and gives
  up after 5 tries rather than retrying forever.
- **Non-blocking booking:** `sendNotification()` never throws past its own boundary — a failed
  email cannot roll back or block the appointment transaction itself, so a clinic's SMTP outage
  never prevents a patient from securing a slot.

## 5. Graceful LLM and Calendar Degradation

Both the pre-visit and post-visit LLM calls are wrapped in try/catch with a hard 15-second
timeout and a safe fallback object (`{ ..., failed: true }`) if the call errors, times out, or
returns malformed JSON. The appointment is still booked/completed either way; the doctor or
patient simply sees a generic fallback summary instead of an AI-tailored one. Google Calendar
sync follows the same philosophy: `createEvent`/`updateEvent`/`deleteEvent` catch all errors and
return `null`/`false` rather than throwing, and if a user has never connected their Google account
(no `GoogleToken` row), calendar sync is skipped entirely for that user without affecting the
other side's booking, email, or the appointment record itself.
