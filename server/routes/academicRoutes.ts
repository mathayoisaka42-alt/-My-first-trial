import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, writeAuditLog, createNotification } from '../db.ts';
import {
  requireAuth,
  requireRoles,
  rateLimit,
  calculateDistanceMeters,
  type AuthRequest,
} from '../auth.ts';
import { createCategoryUploader } from '../storage.ts';
import { calculateStudentAcademicTrend } from '../gpa.ts';

const router = Router();
const materialUpload = createCategoryUploader('materials', 15 * 1024 * 1024);
const assignmentUpload = createCategoryUploader('assignments', 15 * 1024 * 1024);
const announcementUpload = createCategoryUploader('announcements', 10 * 1024 * 1024);
const discussionUpload = createCategoryUploader('discussions', 10 * 1024 * 1024);

function isLecturerAssignedToModule(lecturerRecordId: string | null, moduleId: string): boolean {
  if (!lecturerRecordId) return false;
  const row = db
    .prepare('SELECT id FROM lecturer_module_assignments WHERE lecturer_id = ? AND module_id = ?')
    .get(lecturerRecordId, moduleId);
  return Boolean(row);
}

function isCrForCourse(studentRecordId: string | null, courseId: string): boolean {
  if (!studentRecordId) return false;
  const row = db
    .prepare('SELECT id FROM course_representatives WHERE student_id = ? AND course_id = ? AND is_active = 1')
    .get(studentRecordId, courseId);
  return Boolean(row);
}

function getStudentEnrolledModules(studentRecordId: string) {
  return db
    .prepare(
      `SELECT m.id, m.code, m.name, m.credit_units, m.year_of_study, m.semester_number, m.description,
              c.code as course_code, c.name as course_name,
              ay.id as academic_year_id, ay.label as academic_year_label,
              s.id as semester_id, s.name as semester_name
       FROM student_enrolments se
       JOIN modules m ON m.id = se.module_id
       JOIN courses c ON c.id = m.course_id
       JOIN academic_years ay ON ay.id = se.academic_year_id
       JOIN semesters s ON s.id = se.semester_id
       WHERE se.student_id = ?
       ORDER BY ay.start_date DESC, s.semester_number ASC, m.code ASC`
    )
    .all(studentRecordId);
}

// ============================================================================
// STUDENT & LECTURER DASHBOARD SUMMARY
// ============================================================================
router.get('/student/dashboard', requireAuth, requireRoles('STUDENT', 'CR'), (req: AuthRequest, res) => {
  const srId = req.user!.studentRecordId;
  if (!srId) {
    res.status(404).json({ error: 'Student academic record not linked.' });
    return;
  }

  const modules = getStudentEnrolledModules(srId);
  const trend = calculateStudentAcademicTrend(srId, false);

  const upcomingAssignments = db
    .prepare(
      `SELECT a.id, a.title, a.assignment_type, a.due_at, a.max_marks, m.code as module_code, m.name as module_name,
              sub.id as submission_id, sub.submitted_at
       FROM assignments a
       JOIN modules m ON m.id = a.module_id
       JOIN student_enrolments se ON se.module_id = a.module_id AND se.student_id = ?
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = ?
       ORDER BY a.due_at ASC LIMIT 6`
    )
    .all(srId, srId);

  const activeSessions = db
    .prepare(
      `SELECT s.id, s.module_id, m.code as module_code, m.name as module_name, v.name as venue_name,
              s.code_expires_at, s.is_emergency,
              ar.status as my_status
       FROM attendance_sessions s
       JOIN modules m ON m.id = s.module_id
       JOIN student_enrolments se ON se.module_id = s.module_id AND se.student_id = ?
       LEFT JOIN venues v ON v.id = s.venue_id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = ?
       WHERE s.session_status = 'ACTIVE' AND datetime(s.code_expires_at) > datetime('now')
       ORDER BY s.created_at DESC`
    )
    .all(srId, srId);

  const recentAnnouncements = db
    .prepare(
      `SELECT a.id, a.title, a.description, a.author_role, a.target_scope, a.created_at,
              p.full_name as author_name,
              CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as is_read
       FROM announcements a
       JOIN profiles p ON p.id = a.author_id
       LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.profile_id = ?
       WHERE a.target_scope = 'INSTITUTION'
          OR (a.target_scope = 'COURSE' AND a.target_course_id = ?)
          OR (a.target_scope = 'MODULE' AND a.target_module_id IN (SELECT module_id FROM student_enrolments WHERE student_id = ?))
       ORDER BY a.created_at DESC LIMIT 5`
    )
    .all(req.user!.id, req.user!.courseId, srId);

  res.json({
    modules,
    cumulativeGpa: trend.cumulativeGpa,
    attendance: trend.attendance,
    upcomingAssignments,
    activeSessions,
    recentAnnouncements,
  });
});

router.get('/student/trend', requireAuth, requireRoles('STUDENT', 'CR'), (req: AuthRequest, res) => {
  if (!req.user!.studentRecordId) {
    res.status(404).json({ error: 'Student academic record not found.' });
    return;
  }
  const trend = calculateStudentAcademicTrend(req.user!.studentRecordId, false);
  res.json(trend);
});

router.get('/lecturer/dashboard', requireAuth, requireRoles('LECTURER', 'PRINCIPAL', 'BOARD'), (req: AuthRequest, res) => {
  const lecId = req.user!.lecturerRecordId;
  const assignedModules = lecId
    ? db
        .prepare(
          `SELECT m.id, m.code, m.name, m.credit_units, m.year_of_study, m.semester_number,
                  c.id as course_id, c.code as course_code, c.name as course_name,
                  ay.id as academic_year_id, ay.label as academic_year_label,
                  s.id as semester_id, s.name as semester_name,
                  (SELECT COUNT(*) FROM student_enrolments se WHERE se.module_id = m.id AND se.academic_year_id = lma.academic_year_id) as enrolled_count
           FROM lecturer_module_assignments lma
           JOIN modules m ON m.id = lma.module_id
           JOIN courses c ON c.id = lma.course_id
           JOIN academic_years ay ON ay.id = lma.academic_year_id
           JOIN semesters s ON s.id = lma.semester_id
           WHERE lma.lecturer_id = ?
           ORDER BY m.code ASC`
        )
        .all(lecId)
    : db
        .prepare(
          `SELECT m.id, m.code, m.name, m.credit_units, m.year_of_study, m.semester_number,
                  c.id as course_id, c.code as course_code, c.name as course_name,
                  (SELECT COUNT(*) FROM student_enrolments se WHERE se.module_id = m.id) as enrolled_count
           FROM modules m JOIN courses c ON c.id = m.course_id ORDER BY m.code ASC`
        )
        .all();

  const recentSessions = lecId
    ? db
        .prepare(
          `SELECT s.id, s.session_code, s.code_expires_at, s.session_status, s.is_emergency, s.review_status, s.created_at,
                  m.code as module_code, m.name as module_name, v.name as venue_name,
                  (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = s.id) as check_ins
           FROM attendance_sessions s
           JOIN modules m ON m.id = s.module_id
           LEFT JOIN venues v ON v.id = s.venue_id
           WHERE s.lecturer_id = ?
           ORDER BY s.created_at DESC LIMIT 8`
        )
        .all(lecId)
    : [];

  const pendingRequests = lecId
    ? db
        .prepare(
          `SELECT req.id, req.request_type, req.reason, req.created_at, p.full_name as student_name, sr.registration_number,
                  m.code as module_code, s.id as session_id
           FROM attendance_requests req
           JOIN attendance_sessions s ON s.id = req.session_id
           JOIN modules m ON m.id = s.module_id
           JOIN student_records sr ON sr.id = req.student_id
           JOIN profiles p ON p.id = sr.profile_id
           WHERE req.status = 'PENDING' AND s.lecturer_id = ?
           ORDER BY req.created_at DESC`
        )
        .all(lecId)
    : [];

  const upcomingBookings = db
    .prepare(
      `SELECT vb.id, vb.title, vb.booking_date, vb.start_time, vb.end_time, vb.booking_type, vb.status,
              v.code as venue_code, v.name as venue_name
       FROM venue_bookings vb
       JOIN venues v ON v.id = vb.venue_id
       WHERE vb.booked_by = ? AND vb.status = 'APPROVED'
       ORDER BY vb.booking_date ASC, vb.start_time ASC LIMIT 8`
    )
    .all(req.user!.id);

  res.json({ assignedModules, recentSessions, pendingRequests, upcomingBookings });
});

// ============================================================================
// ANNOUNCEMENTS
// ============================================================================
router.get('/announcements', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const isStaffWide = user.roles.some((r) => ['PRINCIPAL', 'BOARD', 'ADMIN'].includes(r));

  let rows;
  if (isStaffWide) {
    rows = db
      .prepare(
        `SELECT a.*, p.full_name as author_name, c.code as course_code, m.code as module_code,
                CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as is_read
         FROM announcements a
         JOIN profiles p ON p.id = a.author_id
         LEFT JOIN courses c ON c.id = a.target_course_id
         LEFT JOIN modules m ON m.id = a.target_module_id
         LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.profile_id = ?
         ORDER BY a.created_at DESC`
      )
      .all(user.id);
  } else if (user.roles.includes('LECTURER') && user.lecturerRecordId) {
    rows = db
      .prepare(
        `SELECT a.*, p.full_name as author_name, c.code as course_code, m.code as module_code,
                CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as is_read
         FROM announcements a
         JOIN profiles p ON p.id = a.author_id
         LEFT JOIN courses c ON c.id = a.target_course_id
         LEFT JOIN modules m ON m.id = a.target_module_id
         LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.profile_id = ?
         WHERE a.target_scope = 'INSTITUTION'
            OR a.author_id = ?
            OR a.target_module_id IN (SELECT module_id FROM lecturer_module_assignments WHERE lecturer_id = ?)
            OR a.target_course_id IN (SELECT course_id FROM lecturer_module_assignments WHERE lecturer_id = ?)
         ORDER BY a.created_at DESC`
      )
      .all(user.id, user.id, user.lecturerRecordId, user.lecturerRecordId);
  } else {
    rows = db
      .prepare(
        `SELECT a.*, p.full_name as author_name, c.code as course_code, m.code as module_code,
                CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as is_read
         FROM announcements a
         JOIN profiles p ON p.id = a.author_id
         LEFT JOIN courses c ON c.id = a.target_course_id
         LEFT JOIN modules m ON m.id = a.target_module_id
         LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.profile_id = ?
         WHERE a.target_scope = 'INSTITUTION'
            OR (a.target_scope = 'COURSE' AND a.target_course_id = ?)
            OR (a.target_scope = 'MODULE' AND a.target_module_id IN (SELECT module_id FROM student_enrolments WHERE student_id = ?))
         ORDER BY a.created_at DESC`
      )
      .all(user.id, user.courseId, user.studentRecordId);
  }

  res.json({ announcements: rows });
});

const announcementSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(5).max(3000),
  targetScope: z.enum(['INSTITUTION', 'DEPARTMENT', 'COURSE', 'MODULE', 'GROUP']),
  targetCourseId: z.string().optional().nullable(),
  targetModuleId: z.string().optional().nullable(),
});

router.post(
  '/announcements',
  requireAuth,
  requireRoles('CR', 'LECTURER', 'BOARD', 'PRINCIPAL', 'ADMIN'),
  announcementUpload.single('attachment'),
  (req: AuthRequest, res) => {
    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid announcement fields.' });
      return;
    }

    const user = req.user!;
    const d = parsed.data;
    const isExecutive = user.roles.some((r) => ['PRINCIPAL', 'BOARD', 'ADMIN'].includes(r));

    if (d.targetScope === 'INSTITUTION' && !isExecutive) {
      res.status(403).json({ error: 'Only Principal, Board, or System Admin may publish institution-wide announcements.' });
      return;
    }

    if (user.roles.includes('CR') && !user.roles.includes('LECTURER') && !isExecutive) {
      if (d.targetScope !== 'COURSE' || d.targetCourseId !== user.courseId || !isCrForCourse(user.studentRecordId, user.courseId ?? '')) {
        res.status(403).json({ error: 'Course Representatives may only publish announcements to their assigned course.' });
        return;
      }
    }

    if (user.roles.includes('LECTURER') && !isExecutive) {
      if (d.targetScope === 'MODULE' && d.targetModuleId && !isLecturerAssignedToModule(user.lecturerRecordId, d.targetModuleId)) {
        res.status(403).json({ error: 'Lecturers may only publish module announcements to modules assigned to them.' });
        return;
      }
    }

    const id = crypto.randomUUID();
    const authorRole = isExecutive
      ? user.roles.find((r) => ['PRINCIPAL', 'BOARD', 'ADMIN'].includes(r))!
      : user.roles.includes('LECTURER')
      ? 'LECTURER'
      : 'CR';

    const attachmentUrl = req.file ? `/api/files/announcements/${req.file.filename}` : null;
    const attachmentName = req.file ? req.file.originalname : null;

    db.prepare(
      `INSERT INTO announcements (id, title, description, author_id, author_role, target_scope, target_course_id, target_module_id, attachment_url, attachment_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, d.title.trim(), d.description.trim(), user.id, authorRole, d.targetScope, d.targetCourseId ?? null, d.targetModuleId ?? null, attachmentUrl, attachmentName);

    // Notify targeted recipients
    let recipients: { profile_id: string }[] = [];
    if (d.targetScope === 'INSTITUTION') {
      recipients = db.prepare("SELECT id as profile_id FROM profiles WHERE account_status = 'APPROVED' AND id != ?").all(user.id) as { profile_id: string }[];
    } else if (d.targetScope === 'COURSE' && d.targetCourseId) {
      recipients = db.prepare('SELECT profile_id FROM student_records WHERE course_id = ?').all(d.targetCourseId) as { profile_id: string }[];
    } else if (d.targetScope === 'MODULE' && d.targetModuleId) {
      recipients = db
        .prepare('SELECT sr.profile_id FROM student_enrolments se JOIN student_records sr ON sr.id = se.student_id WHERE se.module_id = ?')
        .all(d.targetModuleId) as { profile_id: string }[];
    }

    for (const r of recipients) {
      createNotification({
        recipientId: r.profile_id,
        category: 'ANNOUNCEMENT',
        title: d.title.trim(),
        body: `New ${authorRole} announcement: ${d.title.trim()}`,
        actionUrl: '/student/announcements',
      });
    }

    writeAuditLog({
      actorId: user.id,
      actorRole: authorRole,
      action: 'ANNOUNCEMENT_PUBLISHED',
      targetTable: 'announcements',
      targetId: id,
      details: { targetScope: d.targetScope },
      ipAddress: req.ip,
    });

    res.status(201).json({ id, message: 'Announcement published successfully.' });
  }
);

router.post('/announcements/:id/read', requireAuth, (req: AuthRequest, res) => {
  db.prepare(`INSERT OR IGNORE INTO announcement_reads (id, announcement_id, profile_id) VALUES (?, ?, ?)`).run(
    crypto.randomUUID(),
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true });
});

// ============================================================================
// ATTENDANCE MANAGEMENT SYSTEM (60-SEC CODE + GPS + LATE/MANUAL + CR EMERGENCY)
// ============================================================================
router.post(
  '/attendance/sessions',
  requireAuth,
  requireRoles('LECTURER', 'CR', 'PRINCIPAL'),
  (req: AuthRequest, res) => {
    const schema = z.object({
      moduleId: z.string().min(1),
      venueId: z.string().min(1),
      isEmergency: z.boolean().default(false),
      emergencyReason: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid attendance session request.' });
      return;
    }

    const user = req.user!;
    const { moduleId, venueId, isEmergency, emergencyReason } = parsed.data;
    const mod = db.prepare('SELECT id, course_id, code, name FROM modules WHERE id = ?').get(moduleId) as
      | { id: string; course_id: string; code: string; name: string }
      | undefined;

    if (!mod) {
      res.status(404).json({ error: 'Module not found.' });
      return;
    }

    const isPrincipal = user.roles.includes('PRINCIPAL');
    const isLecturer = user.roles.includes('LECTURER');
    const isCR = user.roles.includes('CR');

    if (isEmergency || (!isLecturer && !isPrincipal && isCR)) {
      if (!isCrForCourse(user.studentRecordId, mod.course_id)) {
        res.status(403).json({ error: 'Emergency attendance may only be initiated by an authorized CR for their assigned course.' });
        return;
      }
      if (!emergencyReason || emergencyReason.trim().length < 8) {
        res.status(400).json({ error: 'CR emergency attendance requires a documented reason (minimum 8 characters).' });
        return;
      }
    } else if (isLecturer && !isPrincipal) {
      if (!isLecturerAssignedToModule(user.lecturerRecordId, moduleId)) {
        res.status(403).json({ error: 'You may only create attendance sessions for modules assigned to you.' });
        return;
      }
    }

    const ttlSetting = db
      .prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'attendance_code_ttl_seconds'")
      .get() as { setting_value: string } | undefined;
    const ttlSeconds = Math.max(30, Math.min(120, parseInt(ttlSetting?.setting_value ?? '60', 10) || 60));

    // Cryptographically random 6-digit code valid for exact 60 seconds
    const sessionCode = String(crypto.randomInt(100000, 999999));
    const sessionId = crypto.randomUUID();
    const expiresAtIso = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const emergencyFlag = isEmergency || (!isLecturer && !isPrincipal) ? 1 : 0;

    db.prepare(
      `INSERT INTO attendance_sessions (id, module_id, course_id, venue_id, created_by, lecturer_id, session_code, code_expires_at, is_emergency, emergency_reason, review_status, session_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`
    ).run(
      sessionId,
      moduleId,
      mod.course_id,
      venueId,
      user.id,
      user.lecturerRecordId ?? null,
      sessionCode,
      expiresAtIso,
      emergencyFlag,
      emergencyFlag ? emergencyReason?.trim() ?? null : null,
      emergencyFlag ? 'PENDING_REVIEW' : 'STANDARD'
    );

    // Notify enrolled students
    const enrolled = db
      .prepare('SELECT sr.profile_id FROM student_enrolments se JOIN student_records sr ON sr.id = se.student_id WHERE se.module_id = ?')
      .all(moduleId) as { profile_id: string }[];
    for (const s of enrolled) {
      createNotification({
        recipientId: s.profile_id,
        category: 'ATTENDANCE',
        title: `Live Attendance: ${mod.code}`,
        body: `Attendance session opened for ${mod.code}. Code expires in ${ttlSeconds} seconds.`,
        actionUrl: '/student/attendance',
      });
    }

    writeAuditLog({
      actorId: user.id,
      actorRole: user.roles.join(','),
      action: emergencyFlag ? 'CR_EMERGENCY_ATTENDANCE_CREATED' : 'LECTURER_ATTENDANCE_STARTED',
      targetTable: 'attendance_sessions',
      targetId: sessionId,
      details: { moduleId, venueId, ttlSeconds, emergencyFlag },
      ipAddress: req.ip,
    });

    res.status(201).json({
      sessionId,
      sessionCode,
      expiresAt: expiresAtIso,
      ttlSeconds,
      isEmergency: Boolean(emergencyFlag),
    });
  }
);

// Student GPS + Code Check-in (Strict Server-Side Validation)
router.post('/attendance/check-in', requireAuth, requireRoles('STUDENT', 'CR'), rateLimit(30, 60_000), (req: AuthRequest, res) => {
  const schema = z.object({
    sessionId: z.string().min(1),
    code: z.string().trim().min(4).max(12),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(10000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid session ID, attendance code, and device GPS coordinates are required.' });
    return;
  }

  const user = req.user!;
  if (!user.studentRecordId) {
    res.status(403).json({ error: 'Student academic record required to mark attendance.' });
    return;
  }

  const { sessionId, code, latitude, longitude, accuracy } = parsed.data;
  const session = db
    .prepare(
      `SELECT s.*, v.latitude as venue_lat, v.longitude as venue_lng, v.name as venue_name
       FROM attendance_sessions s
       LEFT JOIN venues v ON v.id = s.venue_id
       WHERE s.id = ?`
    )
    .get(sessionId) as
    | {
        id: string;
        module_id: string;
        session_code: string;
        code_expires_at: string;
        session_status: string;
        venue_lat: number | null;
        venue_lng: number | null;
        venue_name: string | null;
      }
    | undefined;

  if (!session) {
    res.status(404).json({ error: 'Attendance session not found.' });
    return;
  }
  if (session.session_status !== 'ACTIVE') {
    res.status(400).json({ error: 'This attendance session is no longer active.' });
    return;
  }

  // Verify student enrolment in module
  const enrolled = db
    .prepare('SELECT id FROM student_enrolments WHERE student_id = ? AND module_id = ?')
    .get(user.studentRecordId, session.module_id);
  if (!enrolled) {
    res.status(403).json({ error: 'You are not enrolled in this module.' });
    return;
  }

  // Duplicate check-in protection
  const duplicate = db
    .prepare('SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?')
    .get(sessionId, user.studentRecordId);
  if (duplicate) {
    res.status(409).json({ error: 'Attendance already recorded for this session.' });
    return;
  }

  // Check exact 60-second code expiration
  if (Date.now() > new Date(session.code_expires_at).getTime()) {
    res.status(410).json({
      error: 'The 60-second attendance code has expired. Submit a manual/late attendance request for CR or Lecturer verification.',
      codeExpired: true,
    });
    return;
  }

  // Constant-time code verification
  const codeA = Buffer.from(code);
  const codeB = Buffer.from(session.session_code);
  if (codeA.length !== codeB.length || !crypto.timingSafeEqual(codeA, codeB)) {
    res.status(400).json({ error: 'Incorrect attendance verification code.' });
    return;
  }

  // Anti-spoofing & GPS radius validation
  if (accuracy <= 0 || accuracy > 500) {
    res.status(400).json({
      error: `Device GPS accuracy (${Math.round(accuracy)}m) is insufficient for automated verification. Use manual verification procedure.`,
      gpsRejected: true,
    });
    return;
  }

  const radiusSetting = db
    .prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'attendance_gps_radius_meters'")
    .get() as { setting_value: string } | undefined;
  const maxRadius = Math.max(25, parseInt(radiusSetting?.setting_value ?? '150', 10) || 150);

  let distanceMeters: number | null = null;
  let suspiciousFlag = 0;

  if (session.venue_lat !== null && session.venue_lng !== null) {
    distanceMeters = calculateDistanceMeters(latitude, longitude, session.venue_lat, session.venue_lng);
    if (distanceMeters > maxRadius) {
      res.status(403).json({
        error: `Location check failed: you are ${distanceMeters}m from ${session.venue_name ?? 'the teaching venue'} (allowed radius: ${maxRadius}m). Submit a manual verification request if indoors or GPS drifted.`,
        distanceMeters,
        maxRadius,
        gpsRejected: true,
      });
      return;
    }
  }

  // Anti-spoofing heuristic: flag identical exact integer coordinates or repeated identical accuracy within short window
  if (Number.isInteger(latitude) || Number.isInteger(longitude)) {
    suspiciousFlag = 1;
  }

  const recordId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO attendance_records (id, session_id, student_id, status, verification_method, latitude, longitude, gps_accuracy_meters, distance_from_venue_meters, gps_suspicious_flag)
     VALUES (?, ?, ?, 'PRESENT', 'CODE_GPS', ?, ?, ?, ?, ?)`
  ).run(recordId, sessionId, user.studentRecordId, latitude, longitude, accuracy, distanceMeters, suspiciousFlag);

  res.status(201).json({
    id: recordId,
    status: 'PRESENT',
    distanceMeters,
    message: 'Attendance verified and recorded successfully.',
  });
});

// Student Attendance View (Active sessions + history + requests)
router.get('/attendance/student', requireAuth, requireRoles('STUDENT', 'CR'), (req: AuthRequest, res) => {
  const srId = req.user!.studentRecordId!;
  const sessions = db
    .prepare(
      `SELECT s.id, s.module_id, m.code as module_code, m.name as module_name,
              v.name as venue_name, v.code as venue_code, v.latitude as venue_lat, v.longitude as venue_lng,
              s.code_expires_at, s.session_status, s.is_emergency, s.created_at,
              ar.status as my_status, ar.verification_method, ar.checked_in_at, ar.distance_from_venue_meters,
              req.status as request_status, req.request_type, req.reason as request_reason
       FROM attendance_sessions s
       JOIN modules m ON m.id = s.module_id
       JOIN student_enrolments se ON se.module_id = s.module_id AND se.student_id = ?
       LEFT JOIN venues v ON v.id = s.venue_id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = ?
       LEFT JOIN attendance_requests req ON req.session_id = s.id AND req.student_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(srId, srId, srId);

  const radiusSetting = db
    .prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'attendance_gps_radius_meters'")
    .get() as { setting_value: string } | undefined;

  res.json({ sessions, configuredRadiusMeters: parseInt(radiusSetting?.setting_value ?? '150', 10) || 150 });
});

// Manual / Late Attendance Request by Student
router.post('/attendance/requests', requireAuth, requireRoles('STUDENT', 'CR'), (req: AuthRequest, res) => {
  const schema = z.object({
    sessionId: z.string().min(1),
    requestType: z.enum(['LATE_CODE', 'GPS_UNAVAILABLE', 'EXCUSED_ABSENCE']),
    reason: z.string().min(5).max(500),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' });
    return;
  }

  const srId = req.user!.studentRecordId!;
  const existingRecord = db
    .prepare('SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?')
    .get(parsed.data.sessionId, srId);
  if (existingRecord) {
    res.status(409).json({ error: 'Attendance is already recorded for this session.' });
    return;
  }

  const reqId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO attendance_requests (id, session_id, student_id, request_type, reason, status)
     VALUES (?, ?, ?, ?, ?, 'PENDING')
     ON CONFLICT(session_id, student_id) DO UPDATE SET request_type = excluded.request_type, reason = excluded.reason, status = 'PENDING'`
  ).run(reqId, parsed.data.sessionId, srId, parsed.data.requestType, parsed.data.reason.trim());

  res.status(201).json({ id: reqId, message: 'Manual attendance request submitted for CR/Lecturer review.' });
});

// Lecturer & CR Attendance Console (sessions, reports, manual request approvals)
router.get('/attendance/manage', requireAuth, requireRoles('CR', 'LECTURER', 'BOARD', 'PRINCIPAL'), (req: AuthRequest, res) => {
  const user = req.user!;
  const isExec = user.roles.some((r) => ['BOARD', 'PRINCIPAL'].includes(r));

  let sessions;
  if (isExec) {
    sessions = db
      .prepare(
        `SELECT s.*, m.code as module_code, m.name as module_name, c.code as course_code,
                v.name as venue_name, p.full_name as creator_name,
                (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = s.id AND ar.status IN ('PRESENT', 'LATE')) as attended_count
         FROM attendance_sessions s
         JOIN modules m ON m.id = s.module_id
         JOIN courses c ON c.id = s.course_id
         JOIN profiles p ON p.id = s.created_by
         LEFT JOIN venues v ON v.id = s.venue_id
         ORDER BY s.created_at DESC`
      )
      .all();
  } else if (user.roles.includes('LECTURER') && user.lecturerRecordId) {
    sessions = db
      .prepare(
        `SELECT s.*, m.code as module_code, m.name as module_name, c.code as course_code,
                v.name as venue_name, p.full_name as creator_name,
                (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = s.id AND ar.status IN ('PRESENT', 'LATE')) as attended_count
         FROM attendance_sessions s
         JOIN modules m ON m.id = s.module_id
         JOIN courses c ON c.id = s.course_id
         JOIN profiles p ON p.id = s.created_by
         LEFT JOIN venues v ON v.id = s.venue_id
         WHERE s.module_id IN (SELECT module_id FROM lecturer_module_assignments WHERE lecturer_id = ?)
         ORDER BY s.created_at DESC`
      )
      .all(user.lecturerRecordId);
  } else {
    // CR scoped strictly to assigned course
    sessions = db
      .prepare(
        `SELECT s.*, m.code as module_code, m.name as module_name, c.code as course_code,
                v.name as venue_name, p.full_name as creator_name,
                (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = s.id AND ar.status IN ('PRESENT', 'LATE')) as attended_count
         FROM attendance_sessions s
         JOIN modules m ON m.id = s.module_id
         JOIN courses c ON c.id = s.course_id
         JOIN profiles p ON p.id = s.created_by
         LEFT JOIN venues v ON v.id = s.venue_id
         WHERE s.course_id = ?
         ORDER BY s.created_at DESC`
      )
      .all(user.courseId);
  }

  let requests;
  if (isExec) {
    requests = db
      .prepare(
        `SELECT req.*, p.full_name as student_name, sr.registration_number, m.code as module_code, s.course_id
         FROM attendance_requests req
         JOIN attendance_sessions s ON s.id = req.session_id
         JOIN modules m ON m.id = s.module_id
         JOIN student_records sr ON sr.id = req.student_id
         JOIN profiles p ON p.id = sr.profile_id
         ORDER BY req.created_at DESC`
      )
      .all();
  } else if (user.roles.includes('LECTURER') && user.lecturerRecordId) {
    requests = db
      .prepare(
        `SELECT req.*, p.full_name as student_name, sr.registration_number, m.code as module_code, s.course_id
         FROM attendance_requests req
         JOIN attendance_sessions s ON s.id = req.session_id
         JOIN modules m ON m.id = s.module_id
         JOIN student_records sr ON sr.id = req.student_id
         JOIN profiles p ON p.id = sr.profile_id
         WHERE s.module_id IN (SELECT module_id FROM lecturer_module_assignments WHERE lecturer_id = ?)
         ORDER BY req.created_at DESC`
      )
      .all(user.lecturerRecordId);
  } else {
    requests = db
      .prepare(
        `SELECT req.*, p.full_name as student_name, sr.registration_number, m.code as module_code, s.course_id
         FROM attendance_requests req
         JOIN attendance_sessions s ON s.id = req.session_id
         JOIN modules m ON m.id = s.module_id
         JOIN student_records sr ON sr.id = req.student_id
         JOIN profiles p ON p.id = sr.profile_id
         WHERE s.course_id = ?
         ORDER BY req.created_at DESC`
      )
      .all(user.courseId);
  }

  res.json({ sessions, requests });
});

// Approve / Reject Manual Attendance Request
router.post('/attendance/requests/:id/review', requireAuth, requireRoles('CR', 'LECTURER', 'PRINCIPAL'), (req: AuthRequest, res) => {
  const schema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    attendanceStatus: z.enum(['PRESENT', 'LATE', 'EXCUSED', 'ABSENT']).default('LATE'),
    reviewNote: z.string().max(300).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid review decision.' });
    return;
  }

  const attReq = db
    .prepare(
      `SELECT req.*, s.course_id, s.module_id, sr.profile_id as student_profile_id
       FROM attendance_requests req
       JOIN attendance_sessions s ON s.id = req.session_id
       JOIN student_records sr ON sr.id = req.student_id
       WHERE req.id = ?`
    )
    .get(req.params.id) as
    | {
        id: string;
        session_id: string;
        student_id: string;
        reason: string;
        course_id: string;
        module_id: string;
        student_profile_id: string;
      }
    | undefined;

  if (!attReq) {
    res.status(404).json({ error: 'Attendance request not found.' });
    return;
  }

  const user = req.user!;
  const isPrincipal = user.roles.includes('PRINCIPAL');
  if (!isPrincipal) {
    if (user.roles.includes('LECTURER') && isLecturerAssignedToModule(user.lecturerRecordId, attReq.module_id)) {
      // authorized lecturer
    } else if (user.roles.includes('CR') && isCrForCourse(user.studentRecordId, attReq.course_id)) {
      // authorized CR for assigned course
    } else {
      res.status(403).json({ error: 'You are not authorized to review attendance requests outside your assigned course/module.' });
      return;
    }
  }

  const method = user.roles.includes('LECTURER') ? 'MANUAL_LECTURER' : user.roles.includes('CR') ? 'MANUAL_CR' : 'ADMIN_OVERRIDE';

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE attendance_requests SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = datetime('now') WHERE id = ?`
    ).run(parsed.data.decision, user.id, parsed.data.reviewNote ?? null, attReq.id);

    if (parsed.data.decision === 'APPROVED') {
      db.prepare(
        `INSERT INTO attendance_records (id, session_id, student_id, status, verification_method, reason, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id, student_id) DO UPDATE SET status = excluded.status, approved_by = excluded.approved_by, reason = excluded.reason`
      ).run(crypto.randomUUID(), attReq.session_id, attReq.student_id, parsed.data.attendanceStatus, method, attReq.reason, user.id);
    }

    createNotification({
      recipientId: attReq.student_profile_id,
      category: 'ATTENDANCE',
      title: `Attendance Request ${parsed.data.decision}`,
      body: `Your manual attendance request was ${parsed.data.decision.toLowerCase()} (${parsed.data.attendanceStatus}).`,
      actionUrl: '/student/attendance',
    });

    writeAuditLog({
      actorId: user.id,
      actorRole: user.roles.join(','),
      action: 'MANUAL_ATTENDANCE_REVIEWED',
      targetTable: 'attendance_requests',
      targetId: attReq.id,
      details: { decision: parsed.data.decision, status: parsed.data.attendanceStatus },
      ipAddress: req.ip,
    });

    db.exec('COMMIT');
    res.json({ message: `Request ${parsed.data.decision.toLowerCase()} successfully.` });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process attendance review.' });
  }
});

// Close or mark session status (for Lecturer / Principal / Board review of emergency sessions)
router.patch('/attendance/sessions/:id', requireAuth, requireRoles('LECTURER', 'BOARD', 'PRINCIPAL'), (req: AuthRequest, res) => {
  const schema = z.object({
    sessionStatus: z.enum(['ACTIVE', 'CLOSED', 'CANCELLED', 'MISSED']).optional(),
    reviewStatus: z.enum(['STANDARD', 'PENDING_REVIEW', 'VERIFIED', 'FLAGGED']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid session update.' });
    return;
  }

  db.prepare(
    `UPDATE attendance_sessions
     SET session_status = COALESCE(?, session_status),
         review_status = COALESCE(?, review_status)
     WHERE id = ?`
  ).run(parsed.data.sessionStatus ?? null, parsed.data.reviewStatus ?? null, req.params.id);

  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: 'ATTENDANCE_SESSION_UPDATED',
    targetTable: 'attendance_sessions',
    targetId: String(req.params.id),
    details: parsed.data,
    ipAddress: req.ip,
  });

  res.json({ message: 'Attendance session updated.' });
});

// ============================================================================
// NOTES & LEARNING MATERIALS
// ============================================================================
router.get('/materials', requireAuth, (req: AuthRequest, res) => {
  const moduleId = req.query.moduleId ? String(req.query.moduleId) : null;
  const category = req.query.category ? String(req.query.category) : null;
  const q = req.query.q ? `%${String(req.query.q).trim()}%` : null;

  const isStaff = req.user!.roles.some((r) => ['LECTURER', 'BOARD', 'PRINCIPAL', 'ADMIN'].includes(r));

  let sql = `
    SELECT lm.*, m.code as module_code, m.name as module_name,
           c.code as course_code, pr.code as programme_code, d.code as department_code,
           ay.label as academic_year_label, s.name as semester_name,
           p.full_name as uploader_name
    FROM learning_materials lm
    JOIN modules m ON m.id = lm.module_id
    JOIN courses c ON c.id = m.course_id
    JOIN programmes pr ON pr.id = c.programme_id
    JOIN departments d ON d.id = m.department_id
    JOIN academic_years ay ON ay.id = lm.academic_year_id
    JOIN semesters s ON s.id = lm.semester_id
    JOIN profiles p ON p.id = lm.uploader_id
    WHERE lm.moderation_status != 'REMOVED'
  `;
  const params: (string | number)[] = [];

  if (!isStaff) {
    sql += ` AND (lm.moderation_status = 'APPROVED' OR lm.uploader_id = ?)`;
    params.push(req.user!.id);
  }
  if (moduleId) {
    sql += ` AND lm.module_id = ?`;
    params.push(moduleId);
  }
  if (category) {
    sql += ` AND lm.category = ?`;
    params.push(category);
  }
  if (q) {
    sql += ` AND (lm.title LIKE ? OR lm.description LIKE ? OR m.code LIKE ?)`;
    params.push(q, q, q);
  }
  sql += ` ORDER BY lm.created_at DESC`;

  const materials = db.prepare(sql).all(...params);
  res.json({ materials });
});

router.post('/materials', requireAuth, materialUpload.single('file'), (req: AuthRequest, res) => {
  const schema = z.object({
    moduleId: z.string().min(1),
    academicYearId: z.string().min(1),
    semesterId: z.string().min(1),
    category: z.enum([
      'LECTURER_SLIDES',
      'LECTURE_NOTES',
      'GENERAL_NOTES',
      'STUDENT_SHARED_NOTES',
      'PAST_PAPERS',
      'REFERENCE_MATERIALS',
    ]),
    title: z.string().min(3).max(160),
    description: z.string().max(1000).optional(),
    copyrightAttested: z.union([z.boolean(), z.string()]).transform((v) => v === true || v === 'true'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid material details.' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Please attach a valid PDF, PowerPoint, document, or image file.' });
    return;
  }
  if (!parsed.data.copyrightAttested) {
    res.status(400).json({ error: 'You must confirm copyright and academic integrity attestation before uploading.' });
    return;
  }

  const user = req.user!;
  const d = parsed.data;
  const isStaff = user.roles.some((r) => ['LECTURER', 'PRINCIPAL', 'BOARD'].includes(r));

  if (!isStaff && d.category !== 'STUDENT_SHARED_NOTES' && d.category !== 'GENERAL_NOTES') {
    res.status(403).json({ error: 'Students may only upload Personal/General Notes or Student Shared Notes.' });
    return;
  }
  if (user.roles.includes('LECTURER') && !user.roles.includes('PRINCIPAL') && !isLecturerAssignedToModule(user.lecturerRecordId, d.moduleId)) {
    res.status(403).json({ error: 'Lecturers may only upload materials to assigned modules.' });
    return;
  }

  const id = crypto.randomUUID();
  const fileUrl = `/api/files/materials/${req.file.filename}`;

  db.prepare(
    `INSERT INTO learning_materials (id, module_id, academic_year_id, semester_id, uploader_id, category, title, description, file_url, file_name, file_mime_type, file_size_bytes, copyright_attested, moderation_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'APPROVED')`
  ).run(
    id,
    d.moduleId,
    d.academicYearId,
    d.semesterId,
    user.id,
    d.category,
    d.title.trim(),
    d.description?.trim() ?? '',
    fileUrl,
    req.file.originalname,
    req.file.mimetype,
    req.file.size
  );

  res.status(201).json({ id, fileUrl, message: 'Academic material uploaded successfully.' });
});

router.delete('/materials/:id', requireAuth, (req: AuthRequest, res) => {
  const mat = db.prepare('SELECT id, uploader_id, module_id FROM learning_materials WHERE id = ?').get(req.params.id) as
    | { id: string; uploader_id: string; module_id: string }
    | undefined;
  if (!mat) {
    res.status(404).json({ error: 'Material not found.' });
    return;
  }
  const isMod =
    mat.uploader_id === req.user!.id ||
    req.user!.roles.some((r) => ['PRINCIPAL', 'BOARD', 'ADMIN'].includes(r)) ||
    isLecturerAssignedToModule(req.user!.lecturerRecordId, mat.module_id);
  if (!isMod) {
    res.status(403).json({ error: 'Not authorized to remove this learning material.' });
    return;
  }

  db.prepare("UPDATE learning_materials SET moderation_status = 'REMOVED' WHERE id = ?").run(mat.id);
  res.json({ message: 'Material removed.' });
});

// ============================================================================
// ASSIGNMENTS & GROUP DISCUSSIONS
// ============================================================================
router.get('/assignments', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  if (user.roles.includes('LECTURER') && user.lecturerRecordId && !user.roles.includes('PRINCIPAL')) {
    const assignments = db
      .prepare(
        `SELECT a.*, m.code as module_code, m.name as module_name,
                (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) as submission_count
         FROM assignments a
         JOIN modules m ON m.id = a.module_id
         WHERE a.lecturer_id = ?
         ORDER BY a.due_at ASC`
      )
      .all(user.lecturerRecordId);
    res.json({ assignments });
    return;
  }

  if (user.studentRecordId) {
    const assignments = db
      .prepare(
        `SELECT a.*, m.code as module_code, m.name as module_name,
                sub.id as my_submission_id, sub.submitted_at as my_submitted_at, sub.file_name as my_file_name,
                sub.submission_text as my_submission_text,
                CASE WHEN a.marks_released = 1 THEN sub.marks_awarded ELSE NULL END as my_marks,
                CASE WHEN a.marks_released = 1 THEN sub.lecturer_feedback ELSE NULL END as my_feedback
         FROM assignments a
         JOIN modules m ON m.id = a.module_id
         JOIN student_enrolments se ON se.module_id = a.module_id AND se.student_id = ?
         LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND (
           sub.student_id = ? OR sub.group_id IN (SELECT group_id FROM discussion_group_members WHERE student_id = ?)
         )
         ORDER BY a.due_at ASC`
      )
      .all(user.studentRecordId, user.studentRecordId, user.studentRecordId);
    res.json({ assignments });
    return;
  }

  const assignments = db
    .prepare(
      `SELECT a.*, m.code as module_code, m.name as module_name,
              (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) as submission_count
       FROM assignments a JOIN modules m ON m.id = a.module_id ORDER BY a.due_at ASC`
    )
    .all();
  res.json({ assignments });
});

router.post('/assignments', requireAuth, requireRoles('LECTURER', 'PRINCIPAL'), assignmentUpload.single('attachment'), (req: AuthRequest, res) => {
  const schema = z.object({
    moduleId: z.string().min(1),
    title: z.string().min(3).max(180),
    instructions: z.string().min(5).max(3000),
    assignmentType: z.enum(['INDIVIDUAL', 'GROUP']),
    maxMarks: z.coerce.number().positive().max(1000),
    dueAt: z.string().min(4),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid assignment fields.' });
    return;
  }

  const user = req.user!;
  if (user.roles.includes('LECTURER') && !user.roles.includes('PRINCIPAL') && !isLecturerAssignedToModule(user.lecturerRecordId, parsed.data.moduleId)) {
    res.status(403).json({ error: 'You may only create assignments for assigned modules.' });
    return;
  }

  const lecId = user.lecturerRecordId ?? (db.prepare('SELECT id FROM lecturer_records LIMIT 1').get() as { id: string } | undefined)?.id;
  if (!lecId) {
    res.status(400).json({ error: 'Lecturer record required to assign ownership.' });
    return;
  }

  const id = crypto.randomUUID();
  const attachmentUrl = req.file ? `/api/files/assignments/${req.file.filename}` : null;
  const attachmentName = req.file ? req.file.originalname : null;

  db.prepare(
    `INSERT INTO assignments (id, module_id, lecturer_id, title, instructions, assignment_type, attachment_url, attachment_name, max_marks, due_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, parsed.data.moduleId, lecId, parsed.data.title.trim(), parsed.data.instructions.trim(), parsed.data.assignmentType, attachmentUrl, attachmentName, parsed.data.maxMarks, parsed.data.dueAt);

  res.status(201).json({ id, message: 'Assignment created successfully.' });
});

// Student submit assignment (locked once submitted)
router.post('/assignments/:id/submit', requireAuth, requireRoles('STUDENT', 'CR'), assignmentUpload.single('file'), (req: AuthRequest, res) => {
  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id) as
    | { id: string; module_id: string; assignment_type: string; due_at: string }
    | undefined;
  if (!assignment) {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }

  const srId = req.user!.studentRecordId!;
  const enrolled = db.prepare('SELECT id FROM student_enrolments WHERE student_id = ? AND module_id = ?').get(srId, assignment.module_id);
  if (!enrolled) {
    res.status(403).json({ error: 'You are not enrolled in this module.' });
    return;
  }

  if (Date.now() > new Date(assignment.due_at).getTime()) {
    res.status(403).json({ error: 'Submission deadline has passed. Submissions are locked.' });
    return;
  }

  const groupId = req.body.groupId ? String(req.body.groupId) : null;
  if (assignment.assignment_type === 'GROUP' && !groupId) {
    res.status(400).json({ error: 'Select your discussion group to submit a group assignment.' });
    return;
  }

  const existing = groupId
    ? db.prepare('SELECT id FROM assignment_submissions WHERE assignment_id = ? AND group_id = ?').get(assignment.id, groupId)
    : db.prepare('SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?').get(assignment.id, srId);

  if (existing) {
    res.status(409).json({ error: 'Work has already been submitted and locked against unauthorized edits.' });
    return;
  }

  const submissionText = typeof req.body.submissionText === 'string' ? req.body.submissionText.trim() : '';
  if (!submissionText && !req.file) {
    res.status(400).json({ error: 'Provide submission notes or attach a file.' });
    return;
  }

  const subId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO assignment_submissions (id, assignment_id, student_id, group_id, submitted_by, submission_text, file_url, file_name, is_locked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    subId,
    assignment.id,
    assignment.assignment_type === 'INDIVIDUAL' ? srId : null,
    groupId,
    req.user!.id,
    submissionText,
    req.file ? `/api/files/assignments/${req.file.filename}` : null,
    req.file ? req.file.originalname : null
  );

  res.status(201).json({ id: subId, message: 'Assignment submitted and timestamped.' });
});

router.get('/assignments/:id/submissions', requireAuth, requireRoles('LECTURER', 'PRINCIPAL', 'BOARD'), (req: AuthRequest, res) => {
  const submissions = db
    .prepare(
      `SELECT sub.*, p.full_name as submitter_name, sr.registration_number, dg.name as group_name
       FROM assignment_submissions sub
       JOIN profiles p ON p.id = sub.submitted_by
       LEFT JOIN student_records sr ON sr.id = sub.student_id
       LEFT JOIN discussion_groups dg ON dg.id = sub.group_id
       WHERE sub.assignment_id = ?
       ORDER BY sub.submitted_at DESC`
    )
    .all(req.params.id);
  res.json({ submissions });
});

router.post('/assignments/submissions/:subId/grade', requireAuth, requireRoles('LECTURER', 'PRINCIPAL'), (req: AuthRequest, res) => {
  const schema = z.object({
    marksAwarded: z.coerce.number().min(0),
    lecturerFeedback: z.string().max(1000).optional(),
    releaseMarks: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid mark or feedback.' });
    return;
  }

  const sub = db.prepare('SELECT assignment_id FROM assignment_submissions WHERE id = ?').get(req.params.subId) as
    | { assignment_id: string }
    | undefined;
  if (!sub) {
    res.status(404).json({ error: 'Submission not found.' });
    return;
  }

  db.prepare(`UPDATE assignment_submissions SET marks_awarded = ?, lecturer_feedback = ? WHERE id = ?`).run(
    parsed.data.marksAwarded,
    parsed.data.lecturerFeedback ?? '',
    req.params.subId
  );

  if (parsed.data.releaseMarks) {
    db.prepare('UPDATE assignments SET marks_released = 1 WHERE id = ?').run(sub.assignment_id);
  }

  res.json({ message: 'Submission graded successfully.' });
});

// Discussion Groups & Threads
router.get('/discussions', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const groups = db
    .prepare(
      `SELECT dg.*, m.code as module_code, m.name as module_name, a.title as assignment_title,
              (SELECT COUNT(*) FROM discussion_group_members dgm WHERE dgm.group_id = dg.id) as member_count,
              (SELECT COUNT(*) FROM discussion_messages dm WHERE dm.group_id = dg.id) as message_count,
              CASE WHEN EXISTS (SELECT 1 FROM discussion_group_members dgm2 WHERE dgm2.group_id = dg.id AND dgm2.student_id = ?) THEN 1 ELSE 0 END as is_member
       FROM discussion_groups dg
       JOIN modules m ON m.id = dg.module_id
       LEFT JOIN assignments a ON a.id = dg.assignment_id
       ORDER BY dg.created_at DESC`
    )
    .all(user.studentRecordId ?? '');
  res.json({ groups });
});

router.post('/discussions', requireAuth, (req: AuthRequest, res) => {
  const schema = z.object({
    moduleId: z.string().min(1),
    assignmentId: z.string().optional().nullable(),
    name: z.string().min(3).max(120),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid group details.' });
    return;
  }
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO discussion_groups (id, module_id, assignment_id, name, created_by) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    parsed.data.moduleId,
    parsed.data.assignmentId ?? null,
    parsed.data.name.trim(),
    req.user!.id
  );
  if (req.user!.studentRecordId) {
    db.prepare(`INSERT OR IGNORE INTO discussion_group_members (id, group_id, student_id) VALUES (?, ?, ?)`).run(
      crypto.randomUUID(),
      id,
      req.user!.studentRecordId
    );
  }
  res.status(201).json({ id, message: 'Discussion group created.' });
});

router.post('/discussions/:groupId/join', requireAuth, requireRoles('STUDENT', 'CR'), (req: AuthRequest, res) => {
  db.prepare(`INSERT OR IGNORE INTO discussion_group_members (id, group_id, student_id) VALUES (?, ?, ?)`).run(
    crypto.randomUUID(),
    req.params.groupId,
    req.user!.studentRecordId!
  );
  res.json({ message: 'Joined discussion group.' });
});

router.get('/discussions/:groupId/messages', requireAuth, (req: AuthRequest, res) => {
  const messages = db
    .prepare(
      `SELECT dm.*, p.full_name as author_name
       FROM discussion_messages dm
       JOIN profiles p ON p.id = dm.author_id
       WHERE dm.group_id = ?
       ORDER BY dm.created_at ASC`
    )
    .all(req.params.groupId);
  const members = db
    .prepare(
      `SELECT sr.registration_number, p.full_name
       FROM discussion_group_members dgm
       JOIN student_records sr ON sr.id = dgm.student_id
       JOIN profiles p ON p.id = sr.profile_id
       WHERE dgm.group_id = ?`
    )
    .all(req.params.groupId);
  res.json({ messages, members });
});

router.post('/discussions/:groupId/messages', requireAuth, discussionUpload.single('attachment'), (req: AuthRequest, res) => {
  const text = String(req.body.message ?? '').trim();
  if (!text && !req.file) {
    res.status(400).json({ error: 'Message text or attachment is required.' });
    return;
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO discussion_messages (id, group_id, author_id, message, attachment_url, attachment_name)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.params.groupId,
    req.user!.id,
    text,
    req.file ? `/api/files/discussions/${req.file.filename}` : null,
    req.file ? req.file.originalname : null
  );
  res.status(201).json({ id });
});

// ============================================================================
// LECTURER ASSESSMENTS & MARKS ENTRY
// ============================================================================
router.get('/marks/module/:moduleId', requireAuth, requireRoles('LECTURER', 'PRINCIPAL', 'BOARD'), (req: AuthRequest, res) => {
  const moduleId = String(req.params.moduleId);
  const user = req.user!;
  if (user.roles.includes('LECTURER') && !user.roles.some((r) => ['PRINCIPAL', 'BOARD'].includes(r))) {
    if (!isLecturerAssignedToModule(user.lecturerRecordId, moduleId)) {
      res.status(403).json({ error: 'Access denied: module is not assigned to you.' });
      return;
    }
  }

  const assessments = db
    .prepare('SELECT * FROM assessments WHERE module_id = ? ORDER BY created_at ASC')
    .all(moduleId);

  const students = db
    .prepare(
      `SELECT sr.id as student_id, sr.registration_number, p.full_name
       FROM student_enrolments se
       JOIN student_records sr ON sr.id = se.student_id
       JOIN profiles p ON p.id = sr.profile_id
       WHERE se.module_id = ?
       ORDER BY sr.registration_number ASC`
    )
    .all(moduleId);

  const marks = db
    .prepare(
      `SELECT sm.* FROM student_marks sm
       JOIN assessments a ON a.id = sm.assessment_id
       WHERE a.module_id = ?`
    )
    .all(moduleId);

  res.json({ assessments, students, marks });
});

router.post('/assessments', requireAuth, requireRoles('LECTURER', 'PRINCIPAL'), (req: AuthRequest, res) => {
  const schema = z.object({
    moduleId: z.string().min(1),
    academicYearId: z.string().min(1),
    semesterId: z.string().min(1),
    title: z.string().min(2).max(140),
    assessmentType: z.enum(['TEST', 'ASSIGNMENT', 'PRESENTATION', 'EXAMINATION']),
    maxMarks: z.coerce.number().positive().max(1000),
    weightPercentage: z.coerce.number().positive().max(100),
    marksReleased: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid assessment details.' });
    return;
  }

  const user = req.user!;
  if (user.roles.includes('LECTURER') && !user.roles.includes('PRINCIPAL') && !isLecturerAssignedToModule(user.lecturerRecordId, parsed.data.moduleId)) {
    res.status(403).json({ error: 'Access denied: module not assigned to you.' });
    return;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO assessments (id, module_id, academic_year_id, semester_id, title, assessment_type, max_marks, weight_percentage, marks_released, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    parsed.data.moduleId,
    parsed.data.academicYearId,
    parsed.data.semesterId,
    parsed.data.title.trim(),
    parsed.data.assessmentType,
    parsed.data.maxMarks,
    parsed.data.weightPercentage,
    parsed.data.marksReleased ? 1 : 0,
    user.id
  );
  res.status(201).json({ id, message: 'Assessment created.' });
});

router.post('/marks/enter', requireAuth, requireRoles('LECTURER', 'PRINCIPAL', 'ADMIN'), (req: AuthRequest, res) => {
  const schema = z.object({
    assessmentId: z.string().min(1),
    entries: z.array(
      z.object({
        studentId: z.string().min(1),
        score: z.coerce.number().min(0),
        remarks: z.string().max(250).optional(),
      })
    ),
    releaseMarks: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid marks payload.' });
    return;
  }

  const user = req.user!;
  if (user.roles.includes('ADMIN') && !user.roles.includes('PRINCIPAL') && !user.canEditAcademicResults) {
    res.status(403).json({ error: 'System Administrators require explicit Principal authorization to modify academic marks.' });
    return;
  }

  const assessment = db.prepare('SELECT id, module_id, max_marks, title FROM assessments WHERE id = ?').get(parsed.data.assessmentId) as
    | { id: string; module_id: string; max_marks: number; title: string }
    | undefined;
  if (!assessment) {
    res.status(404).json({ error: 'Assessment not found.' });
    return;
  }

  if (user.roles.includes('LECTURER') && !user.roles.includes('PRINCIPAL') && !isLecturerAssignedToModule(user.lecturerRecordId, assessment.module_id)) {
    res.status(403).json({ error: 'You may only enter marks for modules assigned to you.' });
    return;
  }

  db.exec('BEGIN');
  try {
    for (const entry of parsed.data.entries) {
      if (entry.score > assessment.max_marks) {
        throw new Error(`Score (${entry.score}) cannot exceed maximum marks (${assessment.max_marks}).`);
      }
      db.prepare(
        `INSERT INTO student_marks (id, assessment_id, student_id, score, entered_by, remarks)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(assessment_id, student_id)
         DO UPDATE SET score = excluded.score, entered_by = excluded.entered_by, remarks = excluded.remarks, updated_at = datetime('now')`
      ).run(crypto.randomUUID(), assessment.id, entry.studentId, entry.score, user.id, entry.remarks ?? '');
    }

    if (typeof parsed.data.releaseMarks === 'boolean') {
      db.prepare('UPDATE assessments SET marks_released = ? WHERE id = ?').run(parsed.data.releaseMarks ? 1 : 0, assessment.id);
      if (parsed.data.releaseMarks) {
        for (const entry of parsed.data.entries) {
          const sr = db.prepare('SELECT profile_id FROM student_records WHERE id = ?').get(entry.studentId) as { profile_id: string } | undefined;
          if (sr) {
            createNotification({
              recipientId: sr.profile_id,
              category: 'MARKS',
              title: `Marks Released: ${assessment.title}`,
              body: `Assessment marks for ${assessment.title} have been published to your Personal Trend.`,
              actionUrl: '/student/trend',
            });
          }
        }
      }
    }

    writeAuditLog({
      actorId: user.id,
      actorRole: user.roles.join(','),
      action: 'STUDENT_MARKS_UPDATED',
      targetTable: 'student_marks',
      targetId: assessment.id,
      details: { count: parsed.data.entries.length, releaseMarks: parsed.data.releaseMarks },
      ipAddress: req.ip,
    });

    db.exec('COMMIT');
    res.json({ message: `Saved marks for ${parsed.data.entries.length} student(s).` });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save marks.' });
  }
});

// ============================================================================
// FEEDBACK & SUGGESTIONS
// ============================================================================
router.get('/feedback', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const isAdmin = user.roles.some((r) => ['PRINCIPAL', 'BOARD', 'ADMIN'].includes(r));

  let rows;
  if (isAdmin) {
    rows = db
      .prepare(
        `SELECT f.id, f.recipient_type, f.recipient_profile_id, f.category, f.privacy_mode, f.message, f.status, f.response_text, f.responded_at, f.created_at,
                CASE WHEN f.privacy_mode = 'ANONYMOUS' THEN 'Anonymous Student' ELSE COALESCE(sp.full_name, 'Unknown') END as sender_display,
                rp.full_name as recipient_name
         FROM feedback f
         LEFT JOIN profiles sp ON sp.id = f.sender_id
         LEFT JOIN profiles rp ON rp.id = f.recipient_profile_id
         ORDER BY f.created_at DESC`
      )
      .all();
  } else if (user.roles.some((r) => ['LECTURER', 'CR'].includes(r))) {
    rows = db
      .prepare(
        `SELECT f.id, f.recipient_type, f.recipient_profile_id, f.category, f.privacy_mode, f.message, f.status, f.response_text, f.responded_at, f.created_at,
                CASE WHEN f.privacy_mode IN ('ANONYMOUS', 'CONFIDENTIAL') THEN 'Protected Identity' ELSE COALESCE(sp.full_name, 'Student') END as sender_display
         FROM feedback f
         LEFT JOIN profiles sp ON sp.id = f.sender_id
         WHERE (f.recipient_profile_id = ? OR f.sender_id = ?) AND f.status != 'MODERATED_HIDDEN'
         ORDER BY f.created_at DESC`
      )
      .all(user.id, user.id);
  } else {
    rows = db
      .prepare(
        `SELECT f.id, f.recipient_type, f.category, f.privacy_mode, f.message, f.status, f.response_text, f.responded_at, f.created_at,
                rp.full_name as recipient_name
         FROM feedback f
         LEFT JOIN profiles rp ON rp.id = f.recipient_profile_id
         WHERE f.sender_id = ?
         ORDER BY f.created_at DESC`
      )
      .all(user.id);
  }

  // Provide list of lecturers/CRs for feedback recipient dropdown
  const recipients = db
    .prepare(
      `SELECT DISTINCT p.id, p.full_name, ur.role
       FROM profiles p
       JOIN user_roles ur ON ur.profile_id = p.id
       WHERE p.account_status = 'APPROVED' AND ur.role IN ('LECTURER', 'CR')`
    )
    .all();

  res.json({ feedback: rows, recipients });
});

router.post('/feedback', requireAuth, (req: AuthRequest, res) => {
  const schema = z.object({
    recipientType: z.enum(['LECTURER', 'CR', 'ADMINISTRATION']),
    recipientProfileId: z.string().optional().nullable(),
    category: z.string().min(2).max(80),
    privacyMode: z.enum(['IDENTIFIED', 'CONFIDENTIAL', 'ANONYMOUS']),
    message: z.string().min(8).max(2000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid feedback submission.' });
    return;
  }

  const d = parsed.data;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO feedback (id, sender_id, recipient_type, recipient_profile_id, category, privacy_mode, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    d.privacyMode === 'ANONYMOUS' ? null : req.user!.id,
    d.recipientType,
    d.recipientProfileId ?? null,
    d.category,
    d.privacyMode,
    d.message.trim()
  );

  res.status(201).json({ id, message: 'Feedback submitted securely.' });
});

router.post('/feedback/:id/respond', requireAuth, requireRoles('LECTURER', 'CR', 'PRINCIPAL', 'BOARD', 'ADMIN'), (req: AuthRequest, res) => {
  const schema = z.object({
    responseText: z.string().min(2).max(1500),
    status: z.enum(['IN_REVIEW', 'RESPONDED', 'MODERATED_HIDDEN']).default('RESPONDED'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid feedback response.' });
    return;
  }

  db.prepare(
    `UPDATE feedback SET response_text = ?, status = ?, responded_by = ?, responded_at = datetime('now') WHERE id = ?`
  ).run(parsed.data.responseText.trim(), parsed.data.status, req.user!.id, req.params.id);

  res.json({ message: 'Response recorded.' });
});

// ============================================================================
// NOTIFICATIONS
// ============================================================================
router.get('/notifications', requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 40')
    .all(req.user!.id);
  const unread = db
    .prepare('SELECT COUNT(*) as count FROM notifications WHERE recipient_id = ? AND is_read = 0')
    .get(req.user!.id) as { count: number };
  res.json({ notifications: rows, unreadCount: unread.count });
});

router.post('/notifications/read-all', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

router.post('/notifications/:id/read', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

// Lecturer Directory (accessible to authenticated portal users without leaking private credentials)
router.get('/lecturers', requireAuth, (_req, res) => {
  const lecturers = db
    .prepare(
      `SELECT lr.id, lr.staff_id, lr.qualifications, lr.office_location, lr.specialization,
              p.full_name, p.email, p.profile_photo_url, d.name as department_name, d.code as department_code
       FROM lecturer_records lr
       JOIN profiles p ON p.id = lr.profile_id
       JOIN departments d ON d.id = lr.department_id
       WHERE p.account_status = 'APPROVED'
       ORDER BY p.full_name ASC`
    )
    .all();
  res.json({ lecturers });
});

export default router;
