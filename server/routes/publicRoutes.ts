import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, writeAuditLog, createNotification } from '../db.ts';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  loadUserContext,
  requireAuth,
  rateLimit,
  type AuthRequest,
} from '../auth.ts';
import { createCategoryUploader } from '../storage.ts';

const router = Router();
const avatarUpload = createCategoryUploader('avatars', 3 * 1024 * 1024);

function isSystemBootstrapped(): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM user_roles ur
       JOIN profiles p ON p.id = ur.profile_id
       WHERE ur.role IN ('PRINCIPAL', 'ADMIN') AND p.account_status = 'APPROVED'`
    )
    .get() as { count: number };
  return row.count > 0 || Boolean(process.env.MUSTISO_BOOTSTRAP_PASSCODE?.trim());
}

// Public institutional overview (no confidential PII exposed)
router.get('/public/overview', (_req, res) => {
  const departments = db.prepare('SELECT id, code, name, description, is_sample_data FROM departments ORDER BY code').all();
  const programmes = db.prepare('SELECT id, department_id, code, name, level, duration_years, is_sample_data FROM programmes ORDER BY code').all();
  const courses = db.prepare('SELECT id, programme_id, department_id, code, name, is_sample_data FROM courses ORDER BY code').all();
  const academicYears = db.prepare('SELECT id, label, start_date, end_date, is_current FROM academic_years ORDER BY start_date DESC').all();
  const venueStats = db.prepare('SELECT COUNT(*) as total_venues, SUM(capacity) as total_capacity FROM venues').get() as {
    total_venues: number;
    total_capacity: number | null;
  };
  const bootstrapped = isSystemBootstrapped();

  res.json({
    institution: 'Mbeya University of Science and Technology (MUST)',
    systemName: 'MUSTISO',
    timezone: 'Africa/Dar_es_Salaam',
    bootstrapped,
    counts: {
      departments: departments.length,
      programmes: programmes.length,
      courses: courses.length,
      venues: venueStats.total_venues,
      totalVenueCapacity: venueStats.total_capacity ?? 0,
    },
    departments,
    programmes,
    courses,
    academicYears,
  });
});

// Check bootstrap status
router.get('/public/bootstrap-status', (_req, res) => {
  res.json({ bootstrapped: isSystemBootstrapped() });
});

// One-time institutional setup (creates Principal + System Admin + optional clearly labelled sample testing accounts)
const bootstrapSchema = z.object({
  principalName: z.string().min(3).max(120),
  principalPhone: z.string().min(9).max(20),
  principalEmail: z.string().email().optional().or(z.literal('')),
  password: z.string().min(8).max(100),
  seedSampleAccounts: z.boolean().default(true),
});

router.post('/public/bootstrap', rateLimit(10, 60_000), (req, res) => {
  if (isSystemBootstrapped()) {
    res.status(409).json({ error: 'Institutional administrator account is already configured.' });
    return;
  }
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid setup input.' });
    return;
  }

  const data = parsed.data;
  const passHash = hashPassword(data.password);

  db.exec('BEGIN');
  try {
    const principalId = 'prof-principal-1';
    const adminId = 'prof-admin-1';

    db.prepare(
      `INSERT INTO profiles (id, staff_id, full_name, phone_number, email, account_status, approved_at, password_hash, can_edit_academic_results)
       VALUES (?, 'MUST-PRIN-001', ?, ?, ?, 'APPROVED', datetime('now'), ?, 1)`
    ).run(principalId, data.principalName.trim(), data.principalPhone.trim(), data.principalEmail || 'principal@mustiso.example.ac.tz', passHash);

    db.prepare(`INSERT INTO user_roles (id, profile_id, role, assigned_by) VALUES (?, ?, 'PRINCIPAL', ?)`).run(
      crypto.randomUUID(),
      principalId,
      principalId
    );

    db.prepare(
      `INSERT INTO profiles (id, staff_id, full_name, phone_number, email, account_status, approved_by, approved_at, password_hash, can_edit_academic_results)
       VALUES (?, 'MUST-ADM-001', 'MUSTISO System Administrator', '+255700000002', 'sysadmin@mustiso.example.ac.tz', 'APPROVED', ?, datetime('now'), ?, 0)`
    ).run(adminId, principalId, passHash);

    db.prepare(`INSERT INTO user_roles (id, profile_id, role, assigned_by) VALUES (?, ?, 'ADMIN', ?)`).run(
      crypto.randomUUID(),
      adminId,
      principalId
    );

    if (data.seedSampleAccounts) {
      seedSampleAcademicActivity(principalId, passHash);
    }

    writeAuditLog({
      actorId: principalId,
      actorRole: 'PRINCIPAL',
      action: 'INSTITUTIONAL_BOOTSTRAP',
      targetTable: 'profiles',
      targetId: principalId,
      details: { seededSampleAccounts: data.seedSampleAccounts },
      ipAddress: req.ip,
    });

    db.exec('COMMIT');
    const token = signSessionToken(principalId, 1);
    const user = loadUserContext(principalId);
    res.status(201).json({ token, user });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to initialize institutional accounts.' });
  }
});

function seedSampleAcademicActivity(principalId: string, passHash: string): void {
  const ayId = 'ay-2026-2027';
  const ayPrevId = 'ay-2025-2026';
  const semCurrId = 'sem-2627-1';
  const semPrev1Id = 'sem-2526-1';
  const semPrev2Id = 'sem-2526-2';

  // Sample Board Member
  const boardProfileId = 'prof-board-1';
  db.prepare(
    `INSERT INTO profiles (id, staff_id, full_name, phone_number, email, account_status, approved_by, approved_at, password_hash, is_sample_account)
     VALUES (?, 'MUST-BRD-001', 'Dr.Grace Mwakalukwa (Sample Board)', '+255700000003', 'board.sample@mustiso.example.ac.tz', 'APPROVED', ?, datetime('now'), ?, 1)`
  ).run(boardProfileId, principalId, passHash);
  db.prepare(`INSERT INTO user_roles (id, profile_id, role, assigned_by) VALUES (?, ?, 'BOARD', ?)`).run(crypto.randomUUID(), boardProfileId, principalId);
  db.prepare(`INSERT INTO board_members (id, profile_id, board_title, committee) VALUES (?, ?, 'University Academic Board Member (Sample)', 'Senate & Quality Assurance')`).run(crypto.randomUUID(), boardProfileId);

  // Sample Lecturer
  const lecProfileId = 'prof-lec-1';
  const lecRecordId = 'lec-rec-1';
  db.prepare(
    `INSERT INTO profiles (id, staff_id, full_name, phone_number, email, account_status, approved_by, approved_at, password_hash, is_sample_account)
     VALUES (?, 'MUST-LEC-001', 'Eng. Kelvin Mgaya (Sample Lecturer)', '+255700000004', 'k.mgaya.sample@mustiso.example.ac.tz', 'APPROVED', ?, datetime('now'), ?, 1)`
  ).run(lecProfileId, principalId, passHash);
  db.prepare(`INSERT INTO user_roles (id, profile_id, role, assigned_by) VALUES (?, ?, 'LECTURER', ?)`).run(crypto.randomUUID(), lecProfileId, principalId);
  db.prepare(
    `INSERT INTO lecturer_records (id, profile_id, staff_id, department_id, qualifications, office_location, specialization)
     VALUES (?, ?, 'MUST-LEC-001', 'dept-cse', 'MSc. Computer Science (Sample)', 'Block A, Office 208 (Sample)', 'Database Systems & Distributed Computing')`
  ).run(lecRecordId, lecProfileId);

  // Sample Student + CR (Student 2 is CR for BCS-SE)
  const stu1Prof = 'prof-stu-1';
  const stu1Rec = 'stu-rec-1';
  db.prepare(
    `INSERT INTO profiles (id, registration_number, full_name, phone_number, email, account_status, approved_by, approved_at, password_hash, is_sample_account)
     VALUES (?, 'MUST/BCS/25/001', 'Amina Juma Mwakyusa (Sample Student)', '+255700000005', 'amina.sample@mustiso.example.ac.tz', 'APPROVED', ?, datetime('now'), ?, 1)`
  ).run(stu1Prof, principalId, passHash);
  db.prepare(`INSERT INTO user_roles (id, profile_id, role, assigned_by) VALUES (?, ?, 'STUDENT', ?)`).run(crypto.randomUUID(), stu1Prof, principalId);
  db.prepare(
    `INSERT INTO student_records (id, profile_id, registration_number, programme_id, course_id, department_id, year_of_study, academic_year_id, verified_against_registry)
     VALUES (?, ?, 'MUST/BCS/25/001', 'prog-bcs', 'crs-bcs-se', 'dept-cse', 2, ?, 1)`
  ).run(stu1Rec, stu1Prof, ayId);

  const crProf = 'prof-cr-1';
  const crRec = 'stu-rec-2';
  db.prepare(
    `INSERT INTO profiles (id, registration_number, full_name, phone_number, email, account_status, approved_by, approved_at, password_hash, is_sample_account)
     VALUES (?, 'MUST/BCS/25/002', 'Baraka Paulo Mwakipesile (Sample CR)', '+255700000006', 'baraka.sample@mustiso.example.ac.tz', 'APPROVED', ?, datetime('now'), ?, 1)`
  ).run(crProf, principalId, passHash);
  db.prepare(`INSERT INTO user_roles (id, profile_id, role, assigned_by) VALUES (?, ?, 'STUDENT', ?)`).run(crypto.randomUUID(), crProf, principalId);
  db.prepare(`INSERT INTO user_roles (id, profile_id, role, assigned_by) VALUES (?, ?, 'CR', ?)`).run(crypto.randomUUID(), crProf, principalId);
  db.prepare(
    `INSERT INTO student_records (id, profile_id, registration_number, programme_id, course_id, department_id, year_of_study, academic_year_id, verified_against_registry)
     VALUES (?, ?, 'MUST/BCS/25/002', 'prog-bcs', 'crs-bcs-se', 'dept-cse', 2, ?, 1)`
  ).run(crRec, crProf, ayId);
  db.prepare(
    `INSERT INTO course_representatives (id, student_id, course_id, academic_year_id, year_of_study, appointed_by, is_active)
     VALUES (?, ?, 'crs-bcs-se', ?, 2, ?, 1)`
  ).run(crypto.randomUUID(), crRec, ayId, principalId);

  // Sample Pending Student for Approval Queue demonstration
  const pendProf = 'prof-stu-pending';
  const pendRec = 'stu-rec-pending';
  db.prepare(
    `INSERT INTO profiles (id, registration_number, full_name, phone_number, email, account_status, password_hash, is_sample_account)
     VALUES (?, 'MUST/BCS/25/003', 'Neema Daniel Mbeya (Pending Sample)', '+255700000007', 'neema.sample@mustiso.example.ac.tz', 'PENDING', ?, 1)`
  ).run(pendProf, passHash);
  db.prepare(`INSERT INTO user_roles (id, profile_id, role) VALUES (?, ?, 'STUDENT')`).run(crypto.randomUUID(), pendProf);
  db.prepare(
    `INSERT INTO student_records (id, profile_id, registration_number, programme_id, course_id, department_id, year_of_study, academic_year_id, verified_against_registry)
     VALUES (?, ?, 'MUST/BCS/25/003', 'prog-bcs', 'crs-bcs-se', 'dept-cse', 2, ?, 0)`
  ).run(pendRec, pendProf, ayId);

  // Lecturer Module Assignments
  for (const modId of ['mod-cs201', 'mod-cs204', 'mod-cs207']) {
    db.prepare(
      `INSERT INTO lecturer_module_assignments (id, lecturer_id, module_id, course_id, academic_year_id, semester_id, assigned_by)
       VALUES (?, ?, ?, 'crs-bcs-se', ?, ?, ?)`
    ).run(crypto.randomUUID(), lecRecordId, modId, ayId, semCurrId, principalId);
  }

  // Student Enrolments (current + previous year for progression charts)
  for (const stuId of [stu1Rec, crRec]) {
    for (const modId of ['mod-cs201', 'mod-cs204', 'mod-cs207']) {
      db.prepare(
        `INSERT INTO student_enrolments (id, student_id, module_id, academic_year_id, semester_id, status)
         VALUES (?, ?, ?, ?, ?, 'ENROLLED')`
      ).run(crypto.randomUUID(), stuId, modId, ayId, semCurrId);
    }
    // Historical 2025/2026 enrolments
    db.prepare(`INSERT INTO student_enrolments (id, student_id, module_id, academic_year_id, semester_id, status) VALUES (?, ?, 'mod-cs201', ?, ?, 'COMPLETED')`).run(crypto.randomUUID(), stuId, ayPrevId, semPrev1Id);
    db.prepare(`INSERT INTO student_enrolments (id, student_id, module_id, academic_year_id, semester_id, status) VALUES (?, ?, 'mod-cs204', ?, ?, 'COMPLETED')`).run(crypto.randomUUID(), stuId, ayPrevId, semPrev2Id);
  }

  // Sample Assessments & Marks for Personal Trend
  const asmt1 = 'asmt-cs201-t1';
  const asmt2 = 'asmt-cs201-a1';
  const asmt3 = 'asmt-cs204-t1';
  const asmtPrev1 = 'asmt-prev-1';
  const asmtPrev2 = 'asmt-prev-2';

  db.prepare(`INSERT INTO assessments (id, module_id, academic_year_id, semester_id, title, assessment_type, max_marks, weight_percentage, marks_released, created_by) VALUES (?, 'mod-cs201', ?, ?, 'Test 1: Relational Algebra & Normalization', 'TEST', 100, 20, 1, ?)`).run(asmt1, ayId, semCurrId, lecProfileId);
  db.prepare(`INSERT INTO assessments (id, module_id, academic_year_id, semester_id, title, assessment_type, max_marks, weight_percentage, marks_released, created_by) VALUES (?, 'mod-cs201', ?, ?, 'Assignment 1: PostgreSQL Schema Lab', 'ASSIGNMENT', 100, 20, 1, ?)`).run(asmt2, ayId, semCurrId, lecProfileId);
  db.prepare(`INSERT INTO assessments (id, module_id, academic_year_id, semester_id, title, assessment_type, max_marks, weight_percentage, marks_released, created_by) VALUES (?, 'mod-cs204', ?, ?, 'Presentation: SRS Architecture Review', 'PRESENTATION', 100, 30, 1, ?)`).run(asmt3, ayId, semCurrId, lecProfileId);
  db.prepare(`INSERT INTO assessments (id, module_id, academic_year_id, semester_id, title, assessment_type, max_marks, weight_percentage, marks_released, created_by) VALUES (?, 'mod-cs201', ?, ?, 'Final Examination (2025/2026 Sem I)', 'EXAMINATION', 100, 100, 1, ?)`).run(asmtPrev1, ayPrevId, semPrev1Id, lecProfileId);
  db.prepare(`INSERT INTO assessments (id, module_id, academic_year_id, semester_id, title, assessment_type, max_marks, weight_percentage, marks_released, created_by) VALUES (?, 'mod-cs204', ?, ?, 'Final Examination (2025/2026 Sem II)', 'EXAMINATION', 100, 100, 1, ?)`).run(asmtPrev2, ayPrevId, semPrev2Id, lecProfileId);

  db.prepare(`INSERT INTO student_marks (id, assessment_id, student_id, score, entered_by, remarks) VALUES (?, ?, ?, 78, ?, 'Strong normalization proof')`).run(crypto.randomUUID(), asmt1, stu1Rec, lecProfileId);
  db.prepare(`INSERT INTO student_marks (id, assessment_id, student_id, score, entered_by, remarks) VALUES (?, ?, ?, 84, ?, 'Complete schema & constraints')`).run(crypto.randomUUID(), asmt2, stu1Rec, lecProfileId);
  db.prepare(`INSERT INTO student_marks (id, assessment_id, student_id, score, entered_by, remarks) VALUES (?, ?, ?, 73, ?, 'Clear architectural walkthrough')`).run(crypto.randomUUID(), asmt3, stu1Rec, lecProfileId);
  db.prepare(`INSERT INTO student_marks (id, assessment_id, student_id, score, entered_by, remarks) VALUES (?, ?, ?, 68, ?, 'Good')`).run(crypto.randomUUID(), asmtPrev1, stu1Rec, lecProfileId);
  db.prepare(`INSERT INTO student_marks (id, assessment_id, student_id, score, entered_by, remarks) VALUES (?, ?, ?, 74, ?, 'Consistent progression')`).run(crypto.randomUUID(), asmtPrev2, stu1Rec, lecProfileId);

  db.prepare(`INSERT INTO student_marks (id, assessment_id, student_id, score, entered_by, remarks) VALUES (?, ?, ?, 71, ?, 'Well structured')`).run(crypto.randomUUID(), asmt1, crRec, lecProfileId);
  db.prepare(`INSERT INTO student_marks (id, assessment_id, student_id, score, entered_by, remarks) VALUES (?, ?, ?, 79, ?, 'Solid SQL queries')`).run(crypto.randomUUID(), asmt2, crRec, lecProfileId);

  // Sample Announcements
  db.prepare(
    `INSERT INTO announcements (id, title, description, author_id, author_role, target_scope)
     VALUES (?, 'Welcome to Semester I Academic Operations (2026/2027)', 'All students and lecturers are reminded to verify module enrolments and observe the 60-second GPS-verified attendance procedure in scheduled venues.', ?, 'PRINCIPAL', 'INSTITUTION')`
  ).run(crypto.randomUUID(), principalId);

  db.prepare(
    `INSERT INTO announcements (id, title, description, author_id, author_role, target_scope, target_module_id)
     VALUES (?, 'CS 201 Practical Lab Schedule Update', 'This week database practicums will take place in Sample Computer Laboratory 1 (CLAB-01). Bring your student ID and ensure device location is active.', ?, 'LECTURER', 'MODULE', 'mod-cs201')`
  ).run(crypto.randomUUID(), lecProfileId);

  // Sample Assignment + Discussion Group
  const assignId = 'assign-cs201-1';
  db.prepare(
    `INSERT INTO assignments (id, module_id, lecturer_id, title, instructions, assignment_type, max_marks, due_at, marks_released)
     VALUES (?, 'mod-cs201', ?, 'Database Normalization & Indexing Case Study (Sample)', 'Design a 3NF schema for an academic timetabling module and submit a written rationale in PDF or text format.', 'INDIVIDUAL', 20, datetime('now', '+7 days'), 0)`
  ).run(assignId, lecRecordId);

  const groupAssignId = 'assign-cs204-grp';
  db.prepare(
    `INSERT INTO assignments (id, module_id, lecturer_id, title, instructions, assignment_type, max_marks, due_at, marks_released)
     VALUES (?, 'mod-cs204', ?, 'Team Software Requirements Specification (Sample)', 'Collaborate in your discussion group to draft the SRS and upload one shared group submission.', 'GROUP', 30, datetime('now', '+10 days'), 0)`
  ).run(groupAssignId, lecRecordId);

  const grpId = 'grp-cs204-alpha';
  db.prepare(`INSERT INTO discussion_groups (id, module_id, assignment_id, name, created_by) VALUES (?, 'mod-cs204', ?, 'Cohort Alpha Study Group (Sample)', ?)`).run(
    grpId,
    groupAssignId,
    crProf
  );
  db.prepare(`INSERT INTO discussion_group_members (id, group_id, student_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), grpId, stu1Rec);
  db.prepare(`INSERT INTO discussion_group_members (id, group_id, student_id) VALUES (?, ?, ?)`).run(crypto.randomUUID(), grpId, crRec);
  db.prepare(`INSERT INTO discussion_messages (id, group_id, author_id, message) VALUES (?, ?, ?, 'Welcome team — let us divide Section 2 (Functional Requirements) and Section 3 (RBAC Security) before Friday.')`).run(
    crypto.randomUUID(),
    grpId,
    crProf
  );

  // Sample Venue Bookings for Today (so FIND FREE VENUE dynamically shows OCCUPIED vs FREE!)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dar_es_Salaam' }).format(new Date());
  db.prepare(
    `INSERT INTO venue_bookings (id, venue_id, booked_by, module_id, course_id, title, booking_type, booking_date, start_time, end_time, status, notes)
     VALUES (?, 'ven-nkrumah', ?, 'mod-cs201', 'crs-bcs-se', 'CS 201 Lecture: Transaction Isolation', 'SCHEDULED_CLASS', ?, '08:00', '10:00', 'APPROVED', 'Regular timetable slot')`
  ).run(crypto.randomUUID(), lecProfileId, today);
  db.prepare(
    `INSERT INTO venue_bookings (id, venue_id, booked_by, module_id, course_id, title, booking_type, booking_date, start_time, end_time, status, notes)
     VALUES (?, 'ven-cs-lab1', ?, 'mod-cs204', 'crs-bcs-se', 'CS 204 Software Architecture Lab', 'LECTURER_BOOKING', ?, '14:00', '16:00', 'APPROVED', 'Hands-on UML & API design')`
  ).run(crypto.randomUUID(), lecProfileId, today);

  // Sample Past Attendance Session & Records
  const pastSessId = 'sess-sample-1';
  db.prepare(
    `INSERT INTO attendance_sessions (id, module_id, course_id, venue_id, created_by, lecturer_id, session_code, code_expires_at, session_status)
     VALUES (?, 'mod-cs201', 'crs-bcs-se', 'ven-nkrumah', ?, ?, '842910', datetime('now', '-1 day'), 'CLOSED')`
  ).run(pastSessId, lecProfileId, lecRecordId);
  db.prepare(
    `INSERT INTO attendance_records (id, session_id, student_id, status, verification_method, distance_from_venue_meters, checked_in_at)
     VALUES (?, ?, ?, 'PRESENT', 'CODE_GPS', 24, datetime('now', '-1 day'))`
  ).run(crypto.randomUUID(), pastSessId, stu1Rec);
  db.prepare(
    `INSERT INTO attendance_records (id, session_id, student_id, status, verification_method, distance_from_venue_meters, checked_in_at)
     VALUES (?, ?, ?, 'PRESENT', 'CODE_GPS', 18, datetime('now', '-1 day'))`
  ).run(crypto.randomUUID(), pastSessId, crRec);

  // Sample Notifications
  createNotification({
    recipientId: stu1Prof,
    category: 'ANNOUNCEMENT',
    title: 'Welcome to MUSTISO (2026/2027)',
    body: 'Your student dashboard, attendance check-in, and Personal Trend are active.',
    actionUrl: '/student/announcements',
  });
  createNotification({
    recipientId: principalId,
    category: 'REGISTRATION',
    title: 'Pending Student Registration Review',
    body: '1 sample student registration (MUST/BCS/25/003) is awaiting verification.',
    actionUrl: '/principal/users',
  });
}

// Login via Registration Number + Password OR Phone Number + Password OR Staff ID + Password
const loginSchema = z.object({
  identifier: z.string().min(3, 'Enter your Registration Number, Phone Number, or Staff ID'),
  password: z.string().min(1, 'Password is required'),
});

router.post('/auth/login', rateLimit(20, 60_000), (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid login credentials.' });
    return;
  }

  const identifier = parsed.data.identifier.trim();
  const profile = db
    .prepare(
      `SELECT id, password_hash, account_status, rejection_reason, token_version
       FROM profiles
       WHERE UPPER(registration_number) = UPPER(?)
          OR phone_number = ?
          OR UPPER(staff_id) = UPPER(?)
       LIMIT 1`
    )
    .get(identifier, identifier, identifier) as
    | {
        id: string;
        password_hash: string;
        account_status: string;
        rejection_reason: string | null;
        token_version: number;
      }
    | undefined;

  if (!profile || !verifyPassword(parsed.data.password, profile.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials. Check your Registration/Phone Number and password.' });
    return;
  }

  if (profile.account_status === 'PENDING') {
    res.status(403).json({
      error: 'Account status: PENDING. Your registration is awaiting administrator verification.',
      accountStatus: 'PENDING',
    });
    return;
  }

  if (profile.account_status === 'REJECTED' || profile.account_status === 'SUSPENDED') {
    res.status(403).json({
      error: `Account status: ${profile.account_status}. ${profile.rejection_reason ?? 'Contact MUST Administration.'}`,
      accountStatus: profile.account_status,
    });
    return;
  }

  const timeoutSetting = db
    .prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'session_timeout_minutes'")
    .get() as { setting_value: string } | undefined;
  const ttlMinutes = Math.max(30, parseInt(timeoutSetting?.setting_value ?? '480', 10) || 480);

  const token = signSessionToken(profile.id, profile.token_version, ttlMinutes);
  const user = loadUserContext(profile.id);

  writeAuditLog({
    actorId: profile.id,
    actorRole: user?.roles.join(',') ?? null,
    action: 'USER_LOGIN',
    targetTable: 'profiles',
    targetId: profile.id,
    ipAddress: req.ip,
  });

  res.json({ token, user });
});

// Student Registration (12 required fields + optional profile picture upload)
const registerSchema = z
  .object({
    registrationNumber: z.string().min(5).max(50),
    fullName: z.string().min(3).max(120),
    phoneNumber: z.string().min(9).max(20),
    email: z.string().email().optional().or(z.literal('')),
    programmeId: z.string().min(1),
    courseId: z.string().min(1),
    departmentId: z.string().min(1),
    yearOfStudy: z.coerce.number().int().min(1).max(6),
    academicYearId: z.string().min(1),
    password: z.string().min(8).max(100),
    confirmPassword: z.string().min(8).max(100),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

router.post('/auth/register', rateLimit(15, 60_000), avatarUpload.single('profilePicture'), (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid registration data.' });
    return;
  }

  const d = parsed.data;
  const regNo = d.registrationNumber.trim().toUpperCase();
  const phone = d.phoneNumber.trim();
  const email = d.email ? d.email.trim().toLowerCase() : null;

  const existing = db
    .prepare(
      `SELECT id, registration_number, phone_number, email FROM profiles
       WHERE UPPER(registration_number) = ? OR phone_number = ? OR (? IS NOT NULL AND LOWER(email) = ?)`
    )
    .get(regNo, phone, email, email) as
    | { id: string; registration_number: string | null; phone_number: string; email: string | null }
    | undefined;

  if (existing) {
    if (existing.registration_number?.toUpperCase() === regNo) {
      res.status(409).json({ error: `Registration Number ${regNo} is already registered.` });
      return;
    }
    if (existing.phone_number === phone) {
      res.status(409).json({ error: 'Phone number is already registered to another account.' });
      return;
    }
    res.status(409).json({ error: 'Email address is already registered.' });
    return;
  }

  const photoUrl = req.file ? `/api/files/avatars/${req.file.filename}` : null;
  const profileId = crypto.randomUUID();
  const studentRecordId = crypto.randomUUID();
  const passHash = hashPassword(d.password);

  // Check if registration exists in authorized_student_registry
  const registryMatch = db
    .prepare('SELECT id FROM authorized_student_registry WHERE UPPER(registration_number) = ?')
    .get(regNo) as { id: string } | undefined;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO profiles (id, registration_number, full_name, phone_number, email, profile_photo_url, account_status, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`
    ).run(profileId, regNo, d.fullName.trim(), phone, email, photoUrl, passHash);

    db.prepare(`INSERT INTO user_roles (id, profile_id, role) VALUES (?, ?, 'STUDENT')`).run(
      crypto.randomUUID(),
      profileId
    );

    db.prepare(
      `INSERT INTO student_records (id, profile_id, registration_number, programme_id, course_id, department_id, year_of_study, academic_year_id, verified_against_registry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      studentRecordId,
      profileId,
      regNo,
      d.programmeId,
      d.courseId,
      d.departmentId,
      d.yearOfStudy,
      d.academicYearId,
      registryMatch ? 1 : 0
    );

    // Notify Principal & Admins
    const admins = db
      .prepare("SELECT profile_id FROM user_roles WHERE role IN ('PRINCIPAL', 'ADMIN')")
      .all() as { profile_id: string }[];
    for (const adm of admins) {
      createNotification({
        recipientId: adm.profile_id,
        category: 'REGISTRATION',
        title: 'New Student Registration Request',
        body: `${d.fullName.trim()} (${regNo}) submitted an account request for approval.`,
        actionUrl: '/principal/users',
      });
    }

    writeAuditLog({
      actorId: profileId,
      actorRole: 'STUDENT',
      action: 'STUDENT_REGISTRATION_SUBMITTED',
      targetTable: 'profiles',
      targetId: profileId,
      details: { registrationNumber: regNo, registryMatched: Boolean(registryMatch) },
      ipAddress: req.ip,
    });

    db.exec('COMMIT');
    res.status(201).json({
      message: 'Registration submitted. Your account is PENDING verification by MUST Administration.',
      registrationNumber: regNo,
      status: 'PENDING',
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
  }
});

// Check Registration Approval Status (public minimal check)
router.get('/auth/registration-status', rateLimit(30, 60_000), (req, res) => {
  const reg = String(req.query.registrationNumber ?? '').trim().toUpperCase();
  if (!reg) {
    res.status(400).json({ error: 'Registration Number is required.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT registration_number, full_name, account_status, rejection_reason, created_at, approved_at
       FROM profiles WHERE UPPER(registration_number) = ?`
    )
    .get(reg) as
    | {
        registration_number: string;
        full_name: string;
        account_status: string;
        rejection_reason: string | null;
        created_at: string;
        approved_at: string | null;
      }
    | undefined;

  if (!row) {
    res.status(404).json({ error: 'No registration record found for that Registration Number.' });
    return;
  }

  res.json({
    registrationNumber: row.registration_number,
    fullName: row.full_name,
    status: row.account_status,
    rejectionReason: row.rejection_reason,
    submittedAt: row.created_at,
    reviewedAt: row.approved_at,
  });
});

// Forgot password request (logs recovery ticket for Admin/Principal verification or Supabase email reset when connected)
router.post('/auth/forgot-password', rateLimit(10, 60_000), (req, res) => {
  const identifier = String(req.body?.identifier ?? '').trim();
  if (!identifier) {
    res.status(400).json({ error: 'Registration Number, Phone Number, or Staff ID is required.' });
    return;
  }
  const profile = db
    .prepare(
      `SELECT id, full_name, registration_number, staff_id FROM profiles
       WHERE UPPER(registration_number) = UPPER(?) OR phone_number = ? OR UPPER(staff_id) = UPPER(?)`
    )
    .get(identifier, identifier, identifier) as
    | { id: string; full_name: string; registration_number: string | null; staff_id: string | null }
    | undefined;

  if (profile) {
    const admins = db.prepare("SELECT profile_id FROM user_roles WHERE role IN ('PRINCIPAL', 'ADMIN')").all() as { profile_id: string }[];
    for (const adm of admins) {
      createNotification({
        recipientId: adm.profile_id,
        category: 'SECURITY',
        title: 'Password Recovery Request',
        body: `Account recovery requested for ${profile.full_name} (${profile.registration_number || profile.staff_id}).`,
        actionUrl: '/principal/users',
      });
    }
    writeAuditLog({
      actorId: profile.id,
      actorRole: null,
      action: 'PASSWORD_RECOVERY_REQUESTED',
      targetTable: 'profiles',
      targetId: profile.id,
      ipAddress: req.ip,
    });
  }

  res.json({
    message:
      'If an account matches those details, a recovery request has been logged for institutional verification (or dispatched via Supabase Auth when configured).',
  });
});

router.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
  const profile = db
    .prepare(
      `SELECT p.id, p.registration_number, p.staff_id, p.full_name, p.phone_number, p.email, p.profile_photo_url, p.account_status, p.created_at,
              sr.year_of_study, c.code as course_code, c.name as course_name,
              pr.code as programme_code, pr.name as programme_name,
              d.name as department_name, ay.label as academic_year_label,
              lr.qualifications, lr.office_location, lr.specialization,
              bm.board_title, bm.committee
       FROM profiles p
       LEFT JOIN student_records sr ON sr.profile_id = p.id
       LEFT JOIN courses c ON c.id = sr.course_id
       LEFT JOIN programmes pr ON pr.id = sr.programme_id
       LEFT JOIN lecturer_records lr ON lr.profile_id = p.id
       LEFT JOIN departments d ON d.id = COALESCE(sr.department_id, lr.department_id)
       LEFT JOIN academic_years ay ON ay.id = sr.academic_year_id
       LEFT JOIN board_members bm ON bm.profile_id = p.id
       WHERE p.id = ?`
    )
    .get(req.user!.id);

  res.json({ user: req.user, profile });
});

router.post('/auth/logout', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE profiles SET token_version = token_version + 1 WHERE id = ?').run(req.user!.id);
  writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.roles.join(','),
    action: 'USER_LOGOUT',
    targetTable: 'profiles',
    targetId: req.user!.id,
    ipAddress: req.ip,
  });
  res.json({ message: 'Signed out cleanly.' });
});

// Profile update & profile picture upload
router.put('/auth/profile', requireAuth, avatarUpload.single('profilePicture'), (req: AuthRequest, res) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : undefined;
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : undefined;
  const photoUrl = req.file ? `/api/files/avatars/${req.file.filename}` : undefined;

  if (fullName && fullName.length < 3) {
    res.status(400).json({ error: 'Full name must be at least 3 characters.' });
    return;
  }

  db.prepare(
    `UPDATE profiles
     SET full_name = COALESCE(?, full_name),
         email = COALESCE(?, email),
         profile_photo_url = COALESCE(?, profile_photo_url)
     WHERE id = ?`
  ).run(fullName ?? null, email || null, photoUrl ?? null, req.user!.id);

  res.json({ message: 'Profile updated successfully.', photoUrl });
});

export default router;
