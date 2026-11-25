# MUSTISO Verification & Testing Matrix

## Security & Role Isolation Test Cases
1. **Student Registration & Duplicate Prevention**:
   - Submit `/api/auth/register` with all 12 fields. Verify account enters `PENDING` status and login is blocked (`403`) until approved.
   - Submit duplicate Registration Number or Phone Number -> verify `409 Conflict`.
2. **Account Approval & Login**:
   - Principal approves pending student via `/principal/users` (`/api/admin/users/:id/decision`).
   - Verify login succeeds with either `Registration Number + Password` or `Phone Number + Password`.
3. **Unauthorized Access & Role Restrictions**:
   - Student attempting `GET /api/analytics/institutional` or `POST /api/marks/enter` -> `403 Forbidden`.
   - Student A attempting to read Student B's private marks -> impossible (`student_record_id` derived solely from verified Bearer token).
   - Lecturer attempting `POST /api/attendance/sessions` for an unassigned module -> `403 Forbidden`.
   - System Admin attempting `POST /api/marks/enter` without explicit `can_edit_academic_results` authorization -> `403 Forbidden`.
4. **Attendance Code Expiration, Duplication & GPS Validation**:
   - Submit `/api/attendance/check-in` after 60 seconds -> `410 Gone` (`codeExpired: true`).
   - Submit duplicate check-in for same session -> `409 Conflict`.
   - Submit coordinates outside configured venue radius -> `403 Forbidden` (`gpsRejected: true`).
   - Submit manual/late attendance request -> verified by CR (assigned course only) or Lecturer.
5. **Assignment Submission Locking & Marks Release**:
   - Student submits assignment -> `is_locked = 1` prevents duplicate/overwrite edits; unreleased marks stay hidden until `marks_released = 1`.
6. **GPA Engine**:
   - Principal updates `grading_scales` in `/principal/results`; Personal Trend recalculates module grades and Semester/Annual/Cumulative GPA dynamically.
7. **Venue Availability & Double-Booking Prevention**:
   - Book venue for `10:00–12:00`; query `/api/venues?startTime=10:30&endTime=11:30` -> venue shows `OCCUPIED`.
   - Attempt overlapping booking for `11:00–13:00` -> `409 Conflict` from transactional overlap check.
