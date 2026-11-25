import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'mustiso.db');
export const db = new DatabaseSync(DB_PATH);

// Enable foreign keys and WAL concurrency mode
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initializeDatabase(): void {
  db.exec(`
    -- 1. profiles
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      registration_number TEXT UNIQUE,
      staff_id TEXT UNIQUE,
      full_name TEXT NOT NULL,
      phone_number TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      profile_photo_url TEXT,
      account_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (account_status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
      rejection_reason TEXT,
      approved_by TEXT,
      approved_at TEXT,
      password_hash TEXT NOT NULL,
      token_version INTEGER NOT NULL DEFAULT 1,
      can_edit_academic_results INTEGER NOT NULL DEFAULT 0,
      is_sample_account INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. user_roles
    CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('STUDENT', 'CR', 'LECTURER', 'BOARD', 'PRINCIPAL', 'ADMIN')),
      assigned_by TEXT,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (profile_id, role)
    );

    -- 6. departments
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_sample_data INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 7. programmes
    CREATE TABLE IF NOT EXISTS programmes (
      id TEXT PRIMARY KEY,
      department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('CERTIFICATE', 'DIPLOMA', 'BACHELOR', 'MASTER', 'PHD')),
      duration_years INTEGER NOT NULL,
      is_sample_data INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. courses
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE RESTRICT,
      department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_sample_data INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. academic_years
    CREATE TABLE IF NOT EXISTS academic_years (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 11. semesters
    CREATE TABLE IF NOT EXISTS semesters (
      id TEXT PRIMARY KEY,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      semester_number INTEGER NOT NULL CHECK (semester_number IN (1, 2, 3)),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      UNIQUE (academic_year_id, semester_number)
    );

    -- 9. modules
    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      credit_units REAL NOT NULL DEFAULT 3.0,
      year_of_study INTEGER NOT NULL,
      semester_number INTEGER NOT NULL,
      description TEXT,
      is_sample_data INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Authorized MUST student registry (used by Admin/Principal to verify student registration numbers)
    CREATE TABLE IF NOT EXISTS authorized_student_registry (
      id TEXT PRIMARY KEY,
      registration_number TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      programme_code TEXT NOT NULL,
      course_code TEXT NOT NULL,
      year_of_study INTEGER NOT NULL,
      academic_year_label TEXT NOT NULL,
      is_sample_data INTEGER NOT NULL DEFAULT 1,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. student_records
    CREATE TABLE IF NOT EXISTS student_records (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      registration_number TEXT NOT NULL UNIQUE,
      programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE RESTRICT,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      year_of_study INTEGER NOT NULL,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      admission_status TEXT NOT NULL DEFAULT 'ACTIVE',
      verified_against_registry INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. lecturer_records
    CREATE TABLE IF NOT EXISTS lecturer_records (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      staff_id TEXT NOT NULL UNIQUE,
      department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      qualifications TEXT,
      office_location TEXT,
      specialization TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 5. board_members
    CREATE TABLE IF NOT EXISTS board_members (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      board_title TEXT NOT NULL,
      committee TEXT,
      appointed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 12. student_enrolments
    CREATE TABLE IF NOT EXISTS student_enrolments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'ENROLLED',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, module_id, academic_year_id, semester_id)
    );

    -- 13. lecturer_module_assignments
    CREATE TABLE IF NOT EXISTS lecturer_module_assignments (
      id TEXT PRIMARY KEY,
      lecturer_id TEXT NOT NULL REFERENCES lecturer_records(id) ON DELETE CASCADE,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
      assigned_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (lecturer_id, module_id, academic_year_id, semester_id)
    );

    -- 14. course_representatives
    CREATE TABLE IF NOT EXISTS course_representatives (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      year_of_study INTEGER NOT NULL,
      appointed_by TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, course_id, academic_year_id)
    );

    -- 29. venues
    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      building_name TEXT NOT NULL,
      campus_location TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      venue_type TEXT NOT NULL CHECK (venue_type IN (
        'LECTURE_HALL', 'CLASSROOM', 'COMPUTER_LAB', 'SCIENCE_LAB',
        'SEMINAR_ROOM', 'CONFERENCE_ROOM', 'LIBRARY', 'SPORTS_FACILITY', 'OTHER'
      )),
      facilities TEXT NOT NULL DEFAULT '[]',
      accessibility_info TEXT,
      photo_url TEXT,
      is_official_photo INTEGER NOT NULL DEFAULT 0,
      latitude REAL,
      longitude REAL,
      is_sample_data INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 30. venue_bookings
    CREATE TABLE IF NOT EXISTS venue_bookings (
      id TEXT PRIMARY KEY,
      venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      booked_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      booking_type TEXT NOT NULL CHECK (booking_type IN ('SCHEDULED_CLASS', 'LECTURER_BOOKING', 'EVENT', 'MAINTENANCE')),
      booking_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (end_time > start_time)
    );

    -- 15. announcements
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      author_role TEXT NOT NULL,
      target_scope TEXT NOT NULL CHECK (target_scope IN ('INSTITUTION', 'DEPARTMENT', 'COURSE', 'MODULE', 'GROUP')),
      target_course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
      target_module_id TEXT REFERENCES modules(id) ON DELETE CASCADE,
      attachment_url TEXT,
      attachment_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 16. announcement_reads
    CREATE TABLE IF NOT EXISTS announcement_reads (
      id TEXT PRIMARY KEY,
      announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (announcement_id, profile_id)
    );

    -- 17. attendance_sessions
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL,
      created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      lecturer_id TEXT REFERENCES lecturer_records(id) ON DELETE SET NULL,
      session_code TEXT NOT NULL,
      code_expires_at TEXT NOT NULL,
      is_emergency INTEGER NOT NULL DEFAULT 0,
      emergency_reason TEXT,
      review_status TEXT NOT NULL DEFAULT 'STANDARD' CHECK (review_status IN ('STANDARD', 'PENDING_REVIEW', 'VERIFIED', 'FLAGGED')),
      session_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (session_status IN ('ACTIVE', 'CLOSED', 'CANCELLED', 'MISSED')),
      scheduled_start TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 18. attendance_records
    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED')),
      verification_method TEXT NOT NULL CHECK (verification_method IN ('CODE_GPS', 'MANUAL_CR', 'MANUAL_LECTURER', 'ADMIN_OVERRIDE')),
      latitude REAL,
      longitude REAL,
      gps_accuracy_meters REAL,
      distance_from_venue_meters REAL,
      gps_suspicious_flag INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      approved_by TEXT REFERENCES profiles(id),
      checked_in_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (session_id, student_id)
    );

    -- 19. attendance_requests
    CREATE TABLE IF NOT EXISTS attendance_requests (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
      request_type TEXT NOT NULL CHECK (request_type IN ('LATE_CODE', 'GPS_UNAVAILABLE', 'EXCUSED_ABSENCE')),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reviewed_by TEXT REFERENCES profiles(id),
      review_note TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (session_id, student_id)
    );

    -- 20. learning_materials
    CREATE TABLE IF NOT EXISTS learning_materials (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
      uploader_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      category TEXT NOT NULL CHECK (category IN (
        'LECTURER_SLIDES', 'LECTURE_NOTES', 'GENERAL_NOTES',
        'STUDENT_SHARED_NOTES', 'PAST_PAPERS', 'REFERENCE_MATERIALS'
      )),
      title TEXT NOT NULL,
      description TEXT,
      file_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      copyright_attested INTEGER NOT NULL DEFAULT 0,
      moderation_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (moderation_status IN ('PENDING', 'APPROVED', 'REMOVED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 21. assignments
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      lecturer_id TEXT NOT NULL REFERENCES lecturer_records(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      assignment_type TEXT NOT NULL CHECK (assignment_type IN ('INDIVIDUAL', 'GROUP')),
      attachment_url TEXT,
      attachment_name TEXT,
      max_marks REAL NOT NULL CHECK (max_marks > 0),
      due_at TEXT NOT NULL,
      marks_released INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 23. discussion_groups
    CREATE TABLE IF NOT EXISTS discussion_groups (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      group_mark REAL,
      lecturer_feedback TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS discussion_group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES discussion_groups(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (group_id, student_id)
    );

    -- 22. assignment_submissions
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES student_records(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES discussion_groups(id) ON DELETE CASCADE,
      submitted_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      submission_text TEXT,
      file_url TEXT,
      file_name TEXT,
      marks_awarded REAL,
      lecturer_feedback TEXT,
      is_locked INTEGER NOT NULL DEFAULT 1,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 24. discussion_messages
    CREATE TABLE IF NOT EXISTS discussion_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES discussion_groups(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      message TEXT NOT NULL,
      attachment_url TEXT,
      attachment_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 25. assessments
    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      semester_id TEXT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      assessment_type TEXT NOT NULL CHECK (assessment_type IN ('TEST', 'ASSIGNMENT', 'PRESENTATION', 'EXAMINATION')),
      max_marks REAL NOT NULL CHECK (max_marks > 0),
      weight_percentage REAL NOT NULL CHECK (weight_percentage > 0 AND weight_percentage <= 100),
      marks_released INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 26. student_marks
    CREATE TABLE IF NOT EXISTS student_marks (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
      score REAL NOT NULL CHECK (score >= 0),
      entered_by TEXT NOT NULL REFERENCES profiles(id),
      remarks TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (assessment_id, student_id)
    );

    -- 27. grading_scales
    CREATE TABLE IF NOT EXISTS grading_scales (
      id TEXT PRIMARY KEY,
      scale_name TEXT NOT NULL,
      grade_letter TEXT NOT NULL,
      min_score REAL NOT NULL,
      max_score REAL NOT NULL,
      grade_point REAL NOT NULL,
      remark TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      configured_by TEXT REFERENCES profiles(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 28. gpa_records
    CREATE TABLE IF NOT EXISTS gpa_records (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      semester_id TEXT REFERENCES semesters(id) ON DELETE RESTRICT,
      record_scope TEXT NOT NULL CHECK (record_scope IN ('SEMESTER', 'ANNUAL', 'CUMULATIVE')),
      gpa_value REAL NOT NULL,
      total_credits REAL NOT NULL,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, academic_year_id, semester_id, record_scope)
    );

    -- 31. feedback
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      sender_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      recipient_type TEXT NOT NULL CHECK (recipient_type IN ('LECTURER', 'CR', 'ADMINISTRATION')),
      recipient_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      privacy_mode TEXT NOT NULL CHECK (privacy_mode IN ('IDENTIFIED', 'CONFIDENTIAL', 'ANONYMOUS')),
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESPONDED', 'MODERATED_HIDDEN')),
      response_text TEXT,
      responded_by TEXT REFERENCES profiles(id),
      responded_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 32. notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      action_url TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 33. audit_logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      actor_role TEXT,
      action TEXT NOT NULL,
      target_table TEXT NOT NULL,
      target_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 34. system_settings
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      description TEXT,
      updated_by TEXT REFERENCES profiles(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(account_status);
    CREATE INDEX IF NOT EXISTS idx_user_roles_profile ON user_roles(profile_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_sessions_module ON attendance_sessions(module_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_venue_bookings_lookup ON venue_bookings(venue_id, booking_date, status);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
  `);

  seedInstitutionalStructure();
}

function seedInstitutionalStructure(): void {
  const existingDepts = db.prepare('SELECT COUNT(*) as count FROM departments').get() as { count: number };
  if (existingDepts.count > 0) return;

  const insertSettings = db.prepare(`
    INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description)
    VALUES (?, ?, ?)
  `);
  insertSettings.run('timezone', 'Africa/Dar_es_Salaam', 'Official institutional timezone');
  insertSettings.run('attendance_code_ttl_seconds', '60', 'Validity window for live attendance session codes in seconds');
  insertSettings.run('attendance_gps_radius_meters', '150', 'Acceptable GPS check-in radius around a venue in meters');
  insertSettings.run('session_timeout_minutes', '480', 'Session token lifetime in minutes');
  insertSettings.run('student_note_moderation_required', 'false', 'Require moderator approval before student shared notes appear');
  insertSettings.run('sample_data_notice', 'Clearly labelled sample institutional data active until verified MUST records are imported.', 'Governance notice');

  // Academic years & semesters
  const ayPrevId = 'ay-2025-2026';
  const ayCurrId = 'ay-2026-2027';
  db.prepare(`INSERT INTO academic_years (id, label, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?)`).run(ayPrevId, '2025/2026', '2025-10-15', '2026-07-31', 0);
  db.prepare(`INSERT INTO academic_years (id, label, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?)`).run(ayCurrId, '2026/2027', '2026-10-12', '2027-07-30', 1);

  db.prepare(`INSERT INTO semesters (id, academic_year_id, name, semester_number, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('sem-2526-1', ayPrevId, 'Semester I (2025/2026)', 1, '2025-10-15', '2026-02-20', 0);
  db.prepare(`INSERT INTO semesters (id, academic_year_id, name, semester_number, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('sem-2526-2', ayPrevId, 'Semester II (2025/2026)', 2, '2026-03-09', '2026-07-31', 0);
  db.prepare(`INSERT INTO semesters (id, academic_year_id, name, semester_number, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('sem-2627-1', ayCurrId, 'Semester I (2026/2027)', 1, '2026-10-12', '2027-02-26', 1);
  db.prepare(`INSERT INTO semesters (id, academic_year_id, name, semester_number, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('sem-2627-2', ayCurrId, 'Semester II (2026/2027)', 2, '2027-03-15', '2027-07-30', 0);

  // Sample Departments (Clearly labelled as sample structure configurable by Principal)
  const depts = [
    ['dept-cse', 'CSE', 'Department of Computer Science and Engineering (Sample)', 'Sample academic department covering computing, software systems, and data science.'],
    ['dept-eee', 'EEE', 'Department of Electrical and Electronics Engineering (Sample)', 'Sample academic department covering power systems, telecom, and control engineering.'],
    ['dept-civ', 'CIV', 'Department of Civil Engineering (Sample)', 'Sample academic department covering structural, water resources, and transportation engineering.'],
    ['dept-mst', 'MST', 'Department of Applied Sciences (Sample)', 'Sample academic department covering mathematics, physics, and laboratory sciences.'],
  ];
  for (const [id, code, name, desc] of depts) {
    db.prepare(`INSERT INTO departments (id, code, name, description, is_sample_data) VALUES (?, ?, ?, ?, 1)`).run(id, code, name, desc);
  }

  // Sample Programmes
  const progs = [
    ['prog-bcs', 'dept-cse', 'BCS', 'Bachelor of Computer Science (Sample)', 'BACHELOR', 3],
    ['prog-beee', 'dept-eee', 'BEEE', 'Bachelor of Engineering in Electrical & Electronics (Sample)', 'BACHELOR', 4],
    ['prog-dce', 'dept-civ', 'DCE', 'Diploma in Civil Engineering (Sample)', 'DIPLOMA', 3],
  ];
  for (const [id, deptId, code, name, level, dur] of progs) {
    db.prepare(`INSERT INTO programmes (id, department_id, code, name, level, duration_years, is_sample_data) VALUES (?, ?, ?, ?, ?, ?, 1)`).run(id, deptId, code, name, level, dur);
  }

  // Sample Courses
  const courses = [
    ['crs-bcs-se', 'prog-bcs', 'dept-cse', 'BCS-SE', 'BSc. Computer Science — Software Engineering Cohort (Sample)'],
    ['crs-bcs-is', 'prog-bcs', 'dept-cse', 'BCS-IS', 'BSc. Computer Science — Information Systems Cohort (Sample)'],
    ['crs-beee-ps', 'prog-beee', 'dept-eee', 'BEEE-PS', 'BEng. Electrical Power Systems Cohort (Sample)'],
    ['crs-dce-st', 'prog-dce', 'dept-civ', 'DCE-ST', 'Diploma in Civil & Structural Engineering (Sample)'],
  ];
  for (const [id, progId, deptId, code, name] of courses) {
    db.prepare(`INSERT INTO courses (id, programme_id, department_id, code, name, is_sample_data) VALUES (?, ?, ?, ?, ?, 1)`).run(id, progId, deptId, code, name);
  }

  // Sample Modules
  const modules = [
    ['mod-cs201', 'crs-bcs-se', 'dept-cse', 'CS 201', 'Database Management Systems (Sample)', 4.0, 2, 1, 'Relational schema design, SQL, transactions, and security.'],
    ['mod-cs204', 'crs-bcs-se', 'dept-cse', 'CS 204', 'Software Engineering Principles (Sample)', 3.0, 2, 1, 'Requirements engineering, architecture, and verification.'],
    ['mod-cs207', 'crs-bcs-se', 'dept-cse', 'CS 207', 'Computer Networks & Security (Sample)', 3.0, 2, 1, 'TCP/IP architecture, routing, and network security controls.'],
    ['mod-ee201', 'crs-beee-ps', 'dept-eee', 'EE 201', 'Circuit Analysis & Instrumentation (Sample)', 4.0, 2, 1, 'AC/DC network theorems and laboratory instrumentation.'],
    ['mod-ce105', 'crs-dce-st', 'dept-civ', 'CE 105', 'Engineering Mechanics & Surveying (Sample)', 3.0, 1, 1, 'Statics, leveling, and structural load fundamentals.'],
  ];
  for (const [id, crsId, deptId, code, name, cr, yos, sem, desc] of modules) {
    db.prepare(`INSERT INTO modules (id, course_id, department_id, code, name, credit_units, year_of_study, semester_number, description, is_sample_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(id, crsId, deptId, code, name, cr, yos, sem, desc);
  }

  // Sample Grading Scale (Explicitly labelled configurable — not official MUST regulation until verified by Administration)
  const scale = [
    ['gs-a', 'Configurable Sample Scale (Verify with MUST Academic Regulations)', 'A', 70, 100, 5.0, 'Excellent'],
    ['gs-bp', 'Configurable Sample Scale (Verify with MUST Academic Regulations)', 'B+', 60, 69.99, 4.0, 'Very Good'],
    ['gs-b', 'Configurable Sample Scale (Verify with MUST Academic Regulations)', 'B', 50, 59.99, 3.0, 'Good'],
    ['gs-c', 'Configurable Sample Scale (Verify with MUST Academic Regulations)', 'C', 40, 49.99, 2.0, 'Satisfactory'],
    ['gs-d', 'Configurable Sample Scale (Verify with MUST Academic Regulations)', 'D', 35, 39.99, 1.0, 'Marginal Pass'],
    ['gs-f', 'Configurable Sample Scale (Verify with MUST Academic Regulations)', 'F', 0, 34.99, 0.0, 'Fail'],
  ];
  for (const [id, sname, letter, minS, maxS, gp, rem] of scale) {
    db.prepare(`INSERT INTO grading_scales (id, scale_name, grade_letter, min_score, max_score, grade_point, remark, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(id, sname, letter, minS, maxS, gp, rem);
  }

  // Sample Venues across categories with illustrative generated previews (marked is_official_photo = 0)
  const venues = [
    ['ven-nkrumah', 'LH-01', 'Sample Lecture Hall A (LH-01)', 'Tiered instructional hall equipped with dual projection and acoustic paneling. Illustrative preview — official campus photo pending upload.', 'Academic Block A', 'Main Campus Zone (Sample)', 240, 'LECTURE_HALL', JSON.stringify(['Dual Projectors', 'PA System', 'Air Conditioning', 'Campus Wi-Fi']), 'Step-free ramp access at Ground North entrance', '/src/assets/images/venue_lecture_hall_1795634539692.jpg', 0, -8.9421, 33.4162],
    ['ven-cs-lab1', 'CLAB-01', 'Sample Computer Laboratory 1', 'Workstation laboratory for software engineering, database practicums, and systems labs. Illustrative preview.', 'ICT & Computing Wing', 'Engineering Complex (Sample)', 65, 'COMPUTER_LAB', JSON.stringify(['65 Workstations', 'Smart Display', 'UPS Backup', 'Gigabit LAN']), 'Elevator access to 2nd Floor', '/src/assets/images/venue_computer_lab_1795634540589.jpg', 0, -8.9425, 33.4168],
    ['ven-lib-main', 'LIB-01', 'Sample Central Library Reading Hall', 'Quiet academic reading hall and reference archive with individual study desks. Illustrative preview.', 'Central Library Building', 'Academic Core (Sample)', 320, 'LIBRARY', JSON.stringify(['Study Carrels', 'Power Outlets', 'Quiet Zone', 'Research Terminals']), 'Wheelchair accessible ground floor & lift', '/src/assets/images/venue_library_hall_1795634540118.jpg', 0, -8.9418, 33.4155],
    ['ven-sem-b2', 'SR-204', 'Sample Seminar Room 204', 'Mid-sized seminar room suited for project presentations and tutorials.', 'Academic Block B', 'Main Campus Zone (Sample)', 45, 'SEMINAR_ROOM', JSON.stringify(['Whiteboard', 'Projector', 'Movable Seating']), 'Accessible via Block B lift', null, 0, -8.9429, 33.4159],
    ['ven-sci-lab', 'SLAB-02', 'Sample Applied Science Lab 2', 'Laboratory space equipped for physics and instrumentation practicals.', 'Science Annex', 'East Academic Wing (Sample)', 50, 'SCIENCE_LAB', JSON.stringify(['Lab Benches', 'Fume Hoods', 'Safety Shower']), 'Ground floor double-door access', null, 0, -8.9432, 33.4172],
    ['ven-cr-102', 'CR-102', 'Sample Classroom 102', 'Standard teaching classroom for core undergraduate lectures.', 'Academic Block A', 'Main Campus Zone (Sample)', 85, 'CLASSROOM', JSON.stringify(['Chalkboard', 'Whiteboard', 'Projector Mount']), 'Ground floor access', null, 0, -8.9422, 33.4160],
    ['ven-conf-1', 'CONF-01', 'Sample Senate Conference Hall', 'Executive conference room for academic board reviews and departmental meetings.', 'Administration Block', 'Central Quad (Sample)', 40, 'CONFERENCE_ROOM', JSON.stringify(['Video Conferencing', 'Audio Mics', 'Air Conditioning']), 'Ground floor VIP & ramp entry', null, 0, -8.9415, 33.4164],
    ['ven-sports', 'SPT-01', 'Sample University Sports Complex', 'Outdoor multi-purpose athletics and sports ground.', 'West Sports Grounds', 'West Campus (Sample)', 800, 'SPORTS_FACILITY', JSON.stringify(['Track Field', 'Pavilion Seating', 'Floodlights']), 'Paved perimeter pathway', null, 0, -8.9440, 33.4140],
  ];
  for (const [id, code, name, desc, bldg, loc, cap, vtype, fac, acc, photo, off, lat, lng] of venues) {
    db.prepare(`INSERT INTO venues (id, code, name, description, building_name, campus_location, capacity, venue_type, facilities, accessibility_info, photo_url, is_official_photo, latitude, longitude, is_sample_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(id, code, name, desc, bldg, loc, cap, vtype, fac, acc, photo, off, lat, lng);
  }

  // Sample Authorized Student Registry entries for verification demo
  const regEntries = [
    ['reg-1', 'MUST/BCS/25/001', 'Amina Juma Mwakyusa (Sample)', 'BCS', 'BCS-SE', 2, '2026/2027'],
    ['reg-2', 'MUST/BCS/25/002', 'Baraka Paulo Mwakipesile (Sample)', 'BCS', 'BCS-SE', 2, '2026/2027'],
    ['reg-3', 'MUST/BCS/25/003', 'Neema Daniel Mbeya (Sample)', 'BCS', 'BCS-SE', 2, '2026/2027'],
    ['reg-4', 'MUST/BEEE/25/014', 'Emanuel Josephat Ngalo (Sample)', 'BEEE', 'BEEE-PS', 2, '2026/2027'],
  ];
  for (const [id, regNo, fullName, progCode, crsCode, yos, ay] of regEntries) {
    db.prepare(`INSERT INTO authorized_student_registry (id, registration_number, full_name, programme_code, course_code, year_of_study, academic_year_label, is_sample_data) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(id, regNo, fullName, progCode, crsCode, yos, ay);
  }
}

export function writeAuditLog(params: {
  actorId: string | null;
  actorRole: string | null;
  action: string;
  targetTable: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}): void {
  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_role, action, target_table, target_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    params.actorId,
    params.actorRole,
    params.action,
    params.targetTable,
    params.targetId ?? null,
    JSON.stringify(params.details ?? {}),
    params.ipAddress ?? null
  );
}

export function createNotification(params: {
  recipientId: string;
  category: string;
  title: string;
  body: string;
  actionUrl?: string;
}): void {
  db.prepare(`
    INSERT INTO notifications (id, recipient_id, category, title, body, action_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    params.recipientId,
    params.category,
    params.title,
    params.body,
    params.actionUrl ?? null
  );
}
