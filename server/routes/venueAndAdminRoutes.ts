import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, writeAuditLog, createNotification } from '../db.ts';
import { requireAuth, requireRoles, hashPassword, darEsSalaamToday, type AuthRequest } from '../auth.ts';
import { createCategoryUploader, getStorageStats } from '../storage.ts';
import { getActiveGradingScale } from '../gpa.ts';

const router = Router();
const venuePhotoUpload = createCategoryUploader('venues', 8 * 1024 * 1024);

// ============================================================================
// FIND VENUE & FIND FREE VENUE (REAL AVAILABILITY ENGINE)
// ============================================================================
router.get('/venues', requireAuth, (req: AuthRequest, res) => {
  const date = String(req.query.date || darEsSalaamToday());
  const startTime = req.query.startTime ? String(req.query.startTime) : null;
  const endTime = req.query.endTime ? String(req.query.endTime) : null;
  const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
  const building = req.query.building ? String(req.query.building).trim().toLowerCase() : '';
  const venueType = req.query.venueType ? String(req.query.venueType) : '';
  const minCapacity = req.query.minCapacity ? parseInt(String(req.query.minCapacity), 10) || 0 : 0;

  const venues = db.prepare('SELECT * FROM venues ORDER BY name ASC').all() as {
    id: string;
    code: string;
    name: string;
    description: string;
    building_name: string;
    campus_location: string;
    capacity: number;
    venue_type: string;
    facilities: string;
    accessibility_info: string | null;
    photo_url: string | null;
    is_official_photo: number;
    latitude: number | null;
    longitude: number | null;
    is_sample_data: number;
  }[];

  const bookingsOnDate = db
    .prepare(
      `SELECT vb.*, m.code as module_code, p.full_name as booked_by_name
       FROM venue_bookings vb
       LEFT JOIN modules m ON m.id = vb.module_id
       LEFT JOIN profiles p ON p.id = vb.booked_by
       WHERE vb.booking_date = ? AND vb.status = 'APPROVED'
       ORDER BY vb.start_time ASC`
    )
    .all(date) as {
    id: string;
    venue_id: string;
    title: string;
    booking_type: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    module_code: string | null;
    booked_by_name: string | null;
  }[];

  // Current Dar es Salaam HH:MM if no time window specified
  const currentTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  const enriched = venues
    .filter((v) => {
      if (minCapacity > 0 && v.capacity < minCapacity) return false;
      if (venueType && v.venue_type !== venueType) return false;
      if (building && !v.building_name.toLowerCase().includes(building)) return false;
      if (search && !v.name.toLowerCase().includes(search) && !v.code.toLowerCase().includes(search) && !v.building_name.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    })
    .map((v) => {
      const dayBookings = bookingsOnDate.filter((b) => b.venue_id === v.id);
      let isOccupied = false;
      let activeConflict = null;

      if (startTime && endTime) {
        activeConflict = dayBookings.find((b) => !(b.end_time <= startTime || b.start_time >= endTime)) ?? null;
        isOccupied = Boolean(activeConflict);
      } else {
        activeConflict = dayBookings.find((b) => b.start_time <= currentTime && b.end_time > currentTime) ?? null;
        isOccupied = Boolean(activeConflict);
      }

      return {
        ...v,
        facilities: JSON.parse(v.facilities || '[]'),
        availabilityStatus: isOccupied ? 'OCCUPIED' : 'FREE',
        activeConflict,
        daySchedule: dayBookings,
        checkedDate: date,
      };
    });

  res.json({ venues: enriched, checkedDate: date, currentTime });
});

router.get('/venues/:id/schedule', requireAuth, (req: AuthRequest, res) => {
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(req.params.id);
  if (!venue) {
    res.status(404).json({ error: 'Venue not found.' });
    return;
  }

  const bookings = db
    .prepare(
      `SELECT vb.*, m.code as module_code, p.full_name as booked_by_name
       FROM venue_bookings vb
       LEFT JOIN modules m ON m.id = vb.module_id
       LEFT JOIN profiles p ON p.id = vb.booked_by
       WHERE vb.venue_id = ? AND vb.status = 'APPROVED'
       ORDER BY vb.booking_date DESC, vb.start_time ASC LIMIT 50`
    )
    .all(req.params.id);

  res.json({ venue, bookings });
});

// Book Venue with Transactional Double-Booking Guard
router.post('/venues/book', requireAuth, requireRoles('LECTURER', 'PRINCIPAL', 'ADMIN', 'BOARD'), (req: AuthRequest, res) => {
  const schema = z.object({
    venueId: z.string().min(1),
    moduleId: z.string().optional().nullable(),
    title: z.string().min(3).max(160),
    bookingType: z.enum(['SCHEDULED_CLASS', 'LECTURER_BOOKING', 'EVENT', 'MAINTENANCE']).default('LECTURER_BOOKING'),
    bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    notes: z.string().max(400).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid venue booking data.' });
    return;
  }

  const d = parsed.data;
  if (d.endTime <= d.startTime) {
    res.status(400).json({ error: 'End time must be strictly after start time.' });
    return;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const conflict = db
      .prepare(
        `SELECT id, title, start_time, end_time FROM venue_bookings
         WHERE venue_id = ? AND booking_date = ? AND status = 'APPROVED'
           AND NOT (end_time <= ? OR start_time >= ?)`
      )
      .get(d.venueId, d.bookingDate, d.startTime, d.endTime) as
      | { id: string; title: string; start_time: string; end_time: string }
      | undefined;

    if (conflict) {
      db.exec('ROLLBACK');
      res.status(409).json({
        error: `Double-booking prevented: venue is already reserved for "${conflict.title}" (${conflict.start_time}–${conflict.end_time}).`,
      });
      return;
    }

    const bookingId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO venue_bookings (id, venue_id, booked_by, module_id, title, booking_type, booking_date, start_time, end_time, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)`
    ).run(bookingId, d.venueId, req.user!.id, d.moduleId ?? null, d.title.trim(), d.bookingType, d.bookingDate, d.startTime, d.endTime, d.notes ?? null);

    writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(','),
      action: 'VENUE_BOOKED',
      targetTable: 'venue_bookings',
      targetId: bookingId,
      details: { venueId: d.venueId, bookingDate: d.bookingDate, startTime: d.startTime, endTime: d.endTime },
      ipAddress: req.ip,
    });

    db.exec('COMMIT');
    res.status(201).json({ id: bookingId, message: 'Venue reserved and confirmed on timetable.' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Venue booking failed.' });
  }
});

// Create / Update Venue & Official Photo Upload (Principal / Admin)
router.post('/venues', requireAuth, requireRoles('PRINCIPAL', 'ADMIN'), venuePhotoUpload.single('photo'), (req: AuthRequest, res) => {
  const schema = z.object({
    code: z.string().min(2).max(20),
    name: z.string().min(3).max(120),
    description: z.string().min(5).max(500),
    buildingName: z.string().min(2).max(100),
    campusLocation: z.string().min(2).max(100),
    capacity: z.coerce.number().int().positive(),
    venueType: z.enum([
      'LECTURE_HALL',
      'CLASSROOM',
      'COMPUTER_LAB',
      'SCIENCE_LAB',
      'SEMINAR_ROOM',
      'CONFERENCE_ROOM',
      'LIBRARY',
      'SPORTS_FACILITY',
      'OTHER',
    ]),
    facilities: z.string().optional(),
    accessibilityInfo: z.string().optional(),
    latitude: z.coerce.number().optional().nullable(),
    longitude: z.coerce.number().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid venue payload.' });
    return;
  }

  const d = parsed.data;
  const id = crypto.randomUUID();
  const facilitiesArr = d.facilities ? d.facilities.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const photoUrl = req.file ? `/api/files/venues/${req.file.filename}` : null;

  db.prepare(
    `INSERT INTO venues (id, code, name, description, building_name, campus_location, capacity, venue_type, facilities, accessibility_info, photo_url, is_official_photo, latitude, longitude, is_sample_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    id,
    d.code.trim().toUpperCase(),
    d.name.trim(),
    d.description.trim(),
    d.buildingName.trim(),
    d.campusLocation.trim(),
    d.capacity,
    d.venueType,
    JSON.stringify(facilitiesArr),
    d.accessibilityInfo ?? null,
    photoUrl,
    photoUrl ? 1 : 0,
    d.latitude ?? null,
    d.longitude ?? null
  );

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: 'VENUE_CREATED',
    targetTable: 'venues',
    targetId: id,
    ipAddress: req.ip,
  });

  res.status(201).json({ id, message: 'Campus venue created.' });
});

router.post('/venues/:id/photo', requireAuth, requireRoles('PRINCIPAL', 'ADMIN'), venuePhotoUpload.single('photo'), (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Select an image file (JPEG, PNG, or WEBP).' });
    return;
  }
  const photoUrl = `/api/files/venues/${req.file.filename}`;
  db.prepare('UPDATE venues SET photo_url = ?, is_official_photo = 1, is_sample_data = 0 WHERE id = ?').run(photoUrl, req.params.id);
  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: 'VENUE_OFFICIAL_PHOTO_UPLOADED',
    targetTable: 'venues',
    targetId: String(req.params.id),
    ipAddress: req.ip,
  });
  res.json({ photoUrl, message: 'Official venue photograph updated.' });
});

// ============================================================================
// PRINCIPAL & BOARD INSTITUTIONAL ANALYTICS
// ============================================================================
router.get('/analytics/institutional', requireAuth, requireRoles('BOARD', 'PRINCIPAL', 'ADMIN'), (req: AuthRequest, res) => {
  const studentsByProg = db
    .prepare(
      `SELECT pr.code, pr.name, COUNT(sr.id) as student_count
       FROM programmes pr
       LEFT JOIN student_records sr ON sr.programme_id = pr.id
       GROUP BY pr.id`
    )
    .all();

  const moduleAnalytics = db
    .prepare(
      `SELECT m.id, m.code, m.name, c.code as course_code,
              COUNT(DISTINCT se.student_id) as enrolled_students,
              ROUND(AVG(CASE WHEN sm.score IS NOT NULL THEN (sm.score / a.max_marks) * 100 END), 1) as avg_score_pct,
              (SELECT COUNT(*) FROM attendance_sessions s WHERE s.module_id = m.id) as total_sessions,
              (SELECT COUNT(*) FROM attendance_sessions s WHERE s.module_id = m.id AND s.is_emergency = 1) as emergency_sessions
       FROM modules m
       JOIN courses c ON c.id = m.course_id
       LEFT JOIN student_enrolments se ON se.module_id = m.id
       LEFT JOIN assessments a ON a.module_id = m.id
       LEFT JOIN student_marks sm ON sm.assessment_id = a.id
       GROUP BY m.id`
    )
    .all();

  const lecturerMonitoring = db
    .prepare(
      `SELECT lr.id, lr.staff_id, p.full_name, d.code as department_code,
              COUNT(DISTINCT lma.module_id) as assigned_modules,
              (SELECT COUNT(*) FROM attendance_sessions s WHERE s.lecturer_id = lr.id) as conducted_sessions,
              (SELECT COUNT(*) FROM attendance_sessions s WHERE s.lecturer_id = lr.id AND s.session_status = 'CANCELLED') as cancelled_sessions,
              (SELECT COUNT(*) FROM attendance_sessions s WHERE s.lecturer_id = lr.id AND s.session_status = 'MISSED') as missed_sessions,
              (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions s2 ON s2.id = ar.session_id WHERE s2.lecturer_id = lr.id) as student_checkins_evidence
       FROM lecturer_records lr
       JOIN profiles p ON p.id = lr.profile_id
       JOIN departments d ON d.id = lr.department_id
       LEFT JOIN lecturer_module_assignments lma ON lma.lecturer_id = lr.id
       GROUP BY lr.id`
    )
    .all();

  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM student_records sr JOIN profiles p ON p.id = sr.profile_id WHERE p.account_status = 'APPROVED') as approved_students,
        (SELECT COUNT(*) FROM profiles WHERE account_status = 'PENDING') as pending_registrations,
        (SELECT COUNT(*) FROM lecturer_records) as total_lecturers,
        (SELECT COUNT(*) FROM courses) as total_courses,
        (SELECT COUNT(*) FROM modules) as total_modules,
        (SELECT COUNT(*) FROM attendance_sessions WHERE is_emergency = 1 AND review_status = 'PENDING_REVIEW') as emergency_sessions_pending`
    )
    .get();

  const gpaDistribution = db
    .prepare(
      `SELECT
         SUM(CASE WHEN gpa_value >= 4.4 THEN 1 ELSE 0 END) as first_class,
         SUM(CASE WHEN gpa_value >= 3.5 AND gpa_value < 4.4 THEN 1 ELSE 0 END) as upper_second,
         SUM(CASE WHEN gpa_value >= 2.7 AND gpa_value < 3.5 THEN 1 ELSE 0 END) as lower_second,
         SUM(CASE WHEN gpa_value >= 2.0 AND gpa_value < 2.7 THEN 1 ELSE 0 END) as pass_band,
         SUM(CASE WHEN gpa_value < 2.0 THEN 1 ELSE 0 END) as fail_band
       FROM gpa_records`
    )
    .get();

  res.json({
    counts,
    studentsByProg,
    moduleAnalytics,
    lecturerMonitoring,
    gpaDistribution,
  });
});

// ============================================================================
// PRINCIPAL & ADMIN USER APPROVALS, CR APPOINTMENTS & ACADEMIC STRUCTURE
// ============================================================================
router.get('/admin/users', requireAuth, requireRoles('PRINCIPAL', 'ADMIN', 'BOARD'), (_req, res) => {
  const users = db
    .prepare(
      `SELECT p.id, p.registration_number, p.staff_id, p.full_name, p.phone_number, p.email,
              p.account_status, p.rejection_reason, p.can_edit_academic_results, p.is_sample_account, p.created_at,
              GROUP_CONCAT(ur.role) as roles,
              sr.id as student_record_id, sr.year_of_study, sr.verified_against_registry,
              c.code as course_code, pr.code as programme_code, d.code as department_code,
              cr.id as cr_appointment_id
       FROM profiles p
       LEFT JOIN user_roles ur ON ur.profile_id = p.id
       LEFT JOIN student_records sr ON sr.profile_id = p.id
       LEFT JOIN courses c ON c.id = sr.course_id
       LEFT JOIN programmes pr ON pr.id = sr.programme_id
       LEFT JOIN departments d ON d.id = sr.department_id
       LEFT JOIN course_representatives cr ON cr.student_id = sr.id AND cr.is_active = 1
       GROUP BY p.id
       ORDER BY CASE p.account_status WHEN 'PENDING' THEN 0 ELSE 1 END, p.created_at DESC`
    )
    .all();

  const registry = db.prepare('SELECT * FROM authorized_student_registry ORDER BY registration_number ASC').all();
  res.json({ users, registry });
});

router.post('/admin/users/:id/decision', requireAuth, requireRoles('PRINCIPAL', 'ADMIN'), (req: AuthRequest, res) => {
  const schema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']),
    reason: z.string().max(300).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid decision payload.' });
    return;
  }

  db.prepare(
    `UPDATE profiles SET account_status = ?, rejection_reason = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ?`
  ).run(parsed.data.decision, parsed.data.reason ?? null, req.user!.id, req.params.id);

  createNotification({
    recipientId: String(req.params.id),
    category: 'REGISTRATION',
    title: `Account ${parsed.data.decision}`,
    body:
      parsed.data.decision === 'APPROVED'
        ? 'Your MUSTISO registration has been verified and approved.'
        : `Your registration status is ${parsed.data.decision}: ${parsed.data.reason ?? 'Contact Administration.'}`,
  });

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: `ACCOUNT_${parsed.data.decision}`,
    targetTable: 'profiles',
    targetId: String(req.params.id),
    details: { reason: parsed.data.reason },
    ipAddress: req.ip,
  });

  res.json({ message: `User account marked ${parsed.data.decision}.` });
});

// Provision Staff / Lecturer / Board Account (Principal / Admin)
router.post('/admin/staff', requireAuth, requireRoles('PRINCIPAL', 'ADMIN'), (req: AuthRequest, res) => {
  const schema = z.object({
    fullName: z.string().min(3).max(120),
    staffId: z.string().min(3).max(40),
    phoneNumber: z.string().min(9).max(20),
    email: z.string().email().optional().or(z.literal('')),
    role: z.enum(['LECTURER', 'BOARD', 'ADMIN']),
    departmentId: z.string().optional(),
    qualifications: z.string().optional(),
    officeLocation: z.string().optional(),
    password: z.string().min(8).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid staff account payload.' });
    return;
  }

  const d = parsed.data;
  const profileId = crypto.randomUUID();
  const passHash = hashPassword(d.password);

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO profiles (id, staff_id, full_name, phone_number, email, account_status, approved_by, approved_at, password_hash)
       VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, datetime('now'), ?)`
    ).run(profileId, d.staffId.trim().toUpperCase(), d.fullName.trim(), d.phoneNumber.trim(), d.email || null, req.user!.id, passHash);

    db.prepare(`INSERT INTO user_roles (id, profile_id, role, assigned_by) VALUES (?, ?, ?, ?)`).run(
      crypto.randomUUID(),
      profileId,
      d.role,
      req.user!.id
    );

    if (d.role === 'LECTURER') {
      const deptId = d.departmentId || 'dept-cse';
      db.prepare(
        `INSERT INTO lecturer_records (id, profile_id, staff_id, department_id, qualifications, office_location)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), profileId, d.staffId.trim().toUpperCase(), deptId, d.qualifications ?? null, d.officeLocation ?? null);
    } else if (d.role === 'BOARD') {
      db.prepare(`INSERT INTO board_members (id, profile_id, board_title) VALUES (?, ?, 'University Board Member')`).run(
        crypto.randomUUID(),
        profileId
      );
    }

    writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(','),
      action: 'STAFF_PROVISIONED',
      targetTable: 'profiles',
      targetId: profileId,
      details: { role: d.role, staffId: d.staffId },
      ipAddress: req.ip,
    });

    db.exec('COMMIT');
    res.status(201).json({ id: profileId, message: `${d.role} account provisioned.` });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to provision staff account.' });
  }
});

// Appoint or Revoke Course Representative (Principal)
router.post('/admin/cr-appointment', requireAuth, requireRoles('PRINCIPAL'), (req: AuthRequest, res) => {
  const schema = z.object({
    studentRecordId: z.string().min(1),
    appoint: z.boolean(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid CR appointment request.' });
    return;
  }

  const student = db
    .prepare('SELECT id, profile_id, course_id, academic_year_id, year_of_study FROM student_records WHERE id = ?')
    .get(parsed.data.studentRecordId) as
    | { id: string; profile_id: string; course_id: string; academic_year_id: string; year_of_study: number }
    | undefined;
  if (!student) {
    res.status(404).json({ error: 'Student record not found.' });
    return;
  }

  db.exec('BEGIN');
  try {
    if (parsed.data.appoint) {
      db.prepare(`INSERT OR IGNORE INTO user_roles (id, profile_id, role, assigned_by) VALUES (?, ?, 'CR', ?)`).run(
        crypto.randomUUID(),
        student.profile_id,
        req.user!.id
      );
      db.prepare(
        `INSERT INTO course_representatives (id, student_id, course_id, academic_year_id, year_of_study, appointed_by, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(student_id, course_id, academic_year_id) DO UPDATE SET is_active = 1`
      ).run(crypto.randomUUID(), student.id, student.course_id, student.academic_year_id, student.year_of_study, req.user!.id);
    } else {
      db.prepare(`DELETE FROM user_roles WHERE profile_id = ? AND role = 'CR'`).run(student.profile_id);
      db.prepare(`UPDATE course_representatives SET is_active = 0 WHERE student_id = ?`).run(student.id);
    }

    writeAuditLog({
      actorId: req.user!.id,
      actorRole: 'PRINCIPAL',
      action: parsed.data.appoint ? 'CR_APPOINTED' : 'CR_REVOKED',
      targetTable: 'course_representatives',
      targetId: student.id,
      ipAddress: req.ip,
    });
    db.exec('COMMIT');
    res.json({ message: parsed.data.appoint ? 'Course Representative appointed.' : 'CR role revoked.' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update CR status.' });
  }
});

// Academic Management CRUD (Departments, Programmes, Courses, Modules, Lecturer Assignments, Grading Scale, Registry Import)
router.get('/academic/structure', requireAuth, (_req, res) => {
  const departments = db.prepare('SELECT * FROM departments ORDER BY code').all();
  const programmes = db
    .prepare('SELECT pr.*, d.code as department_code FROM programmes pr JOIN departments d ON d.id = pr.department_id ORDER BY pr.code')
    .all();
  const courses = db
    .prepare('SELECT c.*, pr.code as programme_code, d.code as department_code FROM courses c JOIN programmes pr ON pr.id = c.programme_id JOIN departments d ON d.id = c.department_id ORDER BY c.code')
    .all();
  const modules = db
    .prepare('SELECT m.*, c.code as course_code, d.code as department_code FROM modules m JOIN courses c ON c.id = m.course_id JOIN departments d ON d.id = m.department_id ORDER BY m.code')
    .all();
  const academicYears = db.prepare('SELECT * FROM academic_years ORDER BY start_date DESC').all();
  const semesters = db.prepare('SELECT s.*, ay.label as academic_year_label FROM semesters s JOIN academic_years ay ON ay.id = s.academic_year_id ORDER BY ay.start_date DESC, s.semester_number ASC').all();
  const lecturerAssignments = db
    .prepare(
      `SELECT lma.*, p.full_name as lecturer_name, m.code as module_code, m.name as module_name, c.code as course_code, ay.label as academic_year_label
       FROM lecturer_module_assignments lma
       JOIN lecturer_records lr ON lr.id = lma.lecturer_id
       JOIN profiles p ON p.id = lr.profile_id
       JOIN modules m ON m.id = lma.module_id
       JOIN courses c ON c.id = lma.course_id
       JOIN academic_years ay ON ay.id = lma.academic_year_id`
    )
    .all();
  const gradingScale = getActiveGradingScale();

  res.json({
    departments,
    programmes,
    courses,
    modules,
    academicYears,
    semesters,
    lecturerAssignments,
    gradingScale,
  });
});

router.post('/academic/modules', requireAuth, requireRoles('PRINCIPAL', 'BOARD'), (req: AuthRequest, res) => {
  const schema = z.object({
    courseId: z.string().min(1),
    departmentId: z.string().min(1),
    code: z.string().min(2).max(20),
    name: z.string().min(3).max(160),
    creditUnits: z.coerce.number().positive().max(20),
    yearOfStudy: z.coerce.number().int().min(1).max(6),
    semesterNumber: z.coerce.number().int().min(1).max(3),
    description: z.string().max(400).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid module data.' });
    return;
  }

  const d = parsed.data;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO modules (id, course_id, department_id, code, name, credit_units, year_of_study, semester_number, description, is_sample_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(id, d.courseId, d.departmentId, d.code.trim().toUpperCase(), d.name.trim(), d.creditUnits, d.yearOfStudy, d.semesterNumber, d.description ?? '');

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: 'MODULE_CREATED',
    targetTable: 'modules',
    targetId: id,
    ipAddress: req.ip,
  });
  res.status(201).json({ id, message: 'Module created.' });
});

router.post('/academic/assign-lecturer', requireAuth, requireRoles('PRINCIPAL', 'BOARD'), (req: AuthRequest, res) => {
  const schema = z.object({
    lecturerId: z.string().min(1),
    moduleId: z.string().min(1),
    academicYearId: z.string().min(1),
    semesterId: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid lecturer assignment.' });
    return;
  }

  const mod = db.prepare('SELECT course_id FROM modules WHERE id = ?').get(parsed.data.moduleId) as { course_id: string } | undefined;
  if (!mod) {
    res.status(404).json({ error: 'Module not found.' });
    return;
  }

  db.prepare(
    `INSERT OR IGNORE INTO lecturer_module_assignments (id, lecturer_id, module_id, course_id, academic_year_id, semester_id, assigned_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), parsed.data.lecturerId, parsed.data.moduleId, mod.course_id, parsed.data.academicYearId, parsed.data.semesterId, req.user!.id);

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: 'LECTURER_ASSIGNED_MODULE',
    targetTable: 'lecturer_module_assignments',
    details: parsed.data,
    ipAddress: req.ip,
  });

  res.status(201).json({ message: 'Lecturer assigned to module.' });
});

// Configurable Grading Scale Update (Principal / Board)
router.put('/academic/grading-scale', requireAuth, requireRoles('PRINCIPAL', 'BOARD'), (req: AuthRequest, res) => {
  const schema = z.object({
    scaleName: z.string().min(3).max(120),
    bands: z.array(
      z.object({
        gradeLetter: z.string().min(1).max(4),
        minScore: z.coerce.number().min(0).max(100),
        maxScore: z.coerce.number().min(0).max(100),
        gradePoint: z.coerce.number().min(0).max(5),
        remark: z.string().min(1).max(60),
      })
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid grading scale configuration.' });
    return;
  }

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE grading_scales SET is_active = 0').run();
    for (const b of parsed.data.bands) {
      db.prepare(
        `INSERT INTO grading_scales (id, scale_name, grade_letter, min_score, max_score, grade_point, remark, is_active, configured_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(crypto.randomUUID(), parsed.data.scaleName.trim(), b.gradeLetter, b.minScore, b.maxScore, b.gradePoint, b.remark, req.user!.id);
    }
    writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.roles.join(','),
      action: 'GRADING_SCALE_CONFIGURED',
      targetTable: 'grading_scales',
      details: { scaleName: parsed.data.scaleName, bandsCount: parsed.data.bands.length },
      ipAddress: req.ip,
    });
    db.exec('COMMIT');
    res.json({ message: 'Grading scale updated and activated.' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update grading scale.' });
  }
});

// Import Verified Student Registry Records (JSON array)
router.post('/admin/import-registry', requireAuth, requireRoles('PRINCIPAL', 'ADMIN'), (req: AuthRequest, res) => {
  const schema = z.object({
    records: z.array(
      z.object({
        registrationNumber: z.string().min(4),
        fullName: z.string().min(3),
        programmeCode: z.string().min(2),
        courseCode: z.string().min(2),
        yearOfStudy: z.coerce.number().int().min(1).max(6),
        academicYearLabel: z.string().min(4),
      })
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid registry import format.' });
    return;
  }

  let imported = 0;
  for (const r of parsed.data.records) {
    db.prepare(
      `INSERT INTO authorized_student_registry (id, registration_number, full_name, programme_code, course_code, year_of_study, academic_year_label, is_sample_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(registration_number) DO UPDATE SET full_name = excluded.full_name, is_sample_data = 0`
    ).run(crypto.randomUUID(), r.registrationNumber.trim().toUpperCase(), r.fullName.trim(), r.programmeCode.trim(), r.courseCode.trim(), r.yearOfStudy, r.academicYearLabel.trim());
    imported += 1;
  }

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: 'AUTHORIZED_REGISTRY_IMPORTED',
    targetTable: 'authorized_student_registry',
    details: { count: imported },
    ipAddress: req.ip,
  });

  res.json({ message: `Imported ${imported} verified student registry record(s).` });
});

// ============================================================================
// AUDIT LOGS & SYSTEM ADMIN (SETTINGS, SECURITY, STORAGE, BACKUP)
// ============================================================================
router.get('/admin/audit-logs', requireAuth, requireRoles('PRINCIPAL', 'BOARD', 'ADMIN'), (_req, res) => {
  const logs = db
    .prepare(
      `SELECT al.*, p.full_name as actor_name
       FROM audit_logs al
       LEFT JOIN profiles p ON p.id = al.actor_id
       ORDER BY al.created_at DESC LIMIT 120`
    )
    .all();
  res.json({ logs });
});

router.get('/admin/settings', requireAuth, requireRoles('PRINCIPAL', 'ADMIN', 'BOARD'), (_req, res) => {
  const settings = db.prepare('SELECT * FROM system_settings ORDER BY setting_key ASC').all();
  const storage = getStorageStats();
  res.json({ settings, storage });
});

router.put('/admin/settings', requireAuth, requireRoles('PRINCIPAL', 'ADMIN'), (req: AuthRequest, res) => {
  const schema = z.object({
    settingKey: z.string().min(2),
    settingValue: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid setting payload.' });
    return;
  }

  db.prepare(
    `UPDATE system_settings SET setting_value = ?, updated_by = ?, updated_at = datetime('now') WHERE setting_key = ?`
  ).run(parsed.data.settingValue, req.user!.id, parsed.data.settingKey);

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: 'SYSTEM_SETTING_UPDATED',
    targetTable: 'system_settings',
    targetId: parsed.data.settingKey,
    details: { value: parsed.data.settingValue },
    ipAddress: req.ip,
  });

  res.json({ message: 'System setting saved.' });
});

// Export structured institutional JSON snapshot backup (Admin / Principal)
router.get('/admin/backup', requireAuth, requireRoles('PRINCIPAL', 'ADMIN'), (req: AuthRequest, res) => {
  const snapshot = {
    exportedAt: new Date().toISOString(),
    timezone: 'Africa/Dar_es_Salaam',
    departments: db.prepare('SELECT * FROM departments').all(),
    programmes: db.prepare('SELECT * FROM programmes').all(),
    courses: db.prepare('SELECT * FROM courses').all(),
    modules: db.prepare('SELECT * FROM modules').all(),
    academicYears: db.prepare('SELECT * FROM academic_years').all(),
    semesters: db.prepare('SELECT * FROM semesters').all(),
    venues: db.prepare('SELECT * FROM venues').all(),
    gradingScales: db.prepare('SELECT * FROM grading_scales').all(),
    systemSettings: db.prepare('SELECT * FROM system_settings').all(),
  };

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: 'INSTITUTIONAL_BACKUP_EXPORTED',
    targetTable: 'system',
    ipAddress: req.ip,
  });

  res.json(snapshot);
});

export default router;
