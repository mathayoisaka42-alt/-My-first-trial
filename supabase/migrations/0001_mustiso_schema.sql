-- MUSTISO — Mbeya University of Science and Technology Information System
-- Normalized PostgreSQL / Supabase Database Schema (34 Core Tables)
-- Timezone standard: Africa/Dar_es_Salaam

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

DO $$ BEGIN
  CREATE TYPE user_role_type AS ENUM ('STUDENT', 'CR', 'LECTURER', 'BOARD', 'PRINCIPAL', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE account_status_type AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status_type AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  registration_number TEXT UNIQUE,
  staff_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  profile_photo_url TEXT,
  account_status account_status_type NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  password_hash TEXT,
  token_version INTEGER NOT NULL DEFAULT 1,
  can_edit_academic_results BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. user_roles
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role user_role_type NOT NULL,
  assigned_by UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, role)
);

-- 6. departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_sample_data BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. programmes
CREATE TABLE IF NOT EXISTS programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('CERTIFICATE', 'DIPLOMA', 'BACHELOR', 'MASTER', 'PHD')),
  duration_years INTEGER NOT NULL CHECK (duration_years BETWEEN 1 AND 6),
  is_sample_data BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. courses
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE RESTRICT,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_sample_data BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. academic_years
CREATE TABLE IF NOT EXISTS academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. semesters
CREATE TABLE IF NOT EXISTS semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  semester_number INTEGER NOT NULL CHECK (semester_number IN (1, 2, 3)),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (academic_year_id, semester_number)
);

-- 9. modules
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  credit_units NUMERIC(4, 1) NOT NULL DEFAULT 3.0 CHECK (credit_units > 0),
  year_of_study INTEGER NOT NULL CHECK (year_of_study BETWEEN 1 AND 6),
  semester_number INTEGER NOT NULL CHECK (semester_number IN (1, 2, 3)),
  description TEXT,
  is_sample_data BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. student_records
CREATE TABLE IF NOT EXISTS student_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL UNIQUE,
  programme_id UUID NOT NULL REFERENCES programmes(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  year_of_study INTEGER NOT NULL CHECK (year_of_study BETWEEN 1 AND 6),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  admission_status TEXT NOT NULL DEFAULT 'ACTIVE',
  verified_against_registry BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. lecturer_records
CREATE TABLE IF NOT EXISTS lecturer_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL UNIQUE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  qualifications TEXT,
  office_location TEXT,
  specialization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. board_members
CREATE TABLE IF NOT EXISTS board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  board_title TEXT NOT NULL,
  committee TEXT,
  appointed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. student_enrolments
CREATE TABLE IF NOT EXISTS student_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ENROLLED' CHECK (status IN ('ENROLLED', 'COMPLETED', 'DROPPED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, module_id, academic_year_id, semester_id)
);

-- 13. lecturer_module_assignments
CREATE TABLE IF NOT EXISTS lecturer_module_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecturer_id UUID NOT NULL REFERENCES lecturer_records(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lecturer_id, module_id, academic_year_id, semester_id)
);

-- 14. course_representatives
CREATE TABLE IF NOT EXISTS course_representatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  year_of_study INTEGER NOT NULL,
  appointed_by UUID REFERENCES profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, course_id, academic_year_id)
);

-- 29. venues
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  is_official_photo BOOLEAN NOT NULL DEFAULT FALSE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_sample_data BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 30. venue_bookings
CREATE TABLE IF NOT EXISTS venue_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booked_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  booking_type TEXT NOT NULL CHECK (booking_type IN ('SCHEDULED_CLASS', 'LECTURER_BOOKING', 'EVENT', 'MAINTENANCE')),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

-- 15. announcements
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  author_role user_role_type NOT NULL,
  target_scope TEXT NOT NULL CHECK (target_scope IN ('INSTITUTION', 'DEPARTMENT', 'COURSE', 'MODULE', 'GROUP')),
  target_course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  target_module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. announcement_reads
CREATE TABLE IF NOT EXISTS announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, profile_id)
);

-- 17. attendance_sessions
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  lecturer_id UUID REFERENCES lecturer_records(id) ON DELETE SET NULL,
  session_code TEXT NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_reason TEXT,
  review_status TEXT NOT NULL DEFAULT 'STANDARD' CHECK (review_status IN ('STANDARD', 'PENDING_REVIEW', 'VERIFIED', 'FLAGGED')),
  session_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (session_status IN ('ACTIVE', 'CLOSED', 'CANCELLED', 'MISSED')),
  scheduled_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. attendance_records
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  status attendance_status_type NOT NULL DEFAULT 'PRESENT',
  verification_method TEXT NOT NULL CHECK (verification_method IN ('CODE_GPS', 'MANUAL_CR', 'MANUAL_LECTURER', 'ADMIN_OVERRIDE')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  gps_accuracy_meters DOUBLE PRECISION,
  distance_from_venue_meters DOUBLE PRECISION,
  gps_suspicious_flag BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  approved_by UUID REFERENCES profiles(id),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, student_id)
);

-- 19. attendance_requests
CREATE TABLE IF NOT EXISTS attendance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('LATE_CODE', 'GPS_UNAVAILABLE', 'EXCUSED_ABSENCE')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by UUID REFERENCES profiles(id),
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, student_id)
);

-- 20. learning_materials
CREATE TABLE IF NOT EXISTS learning_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  uploader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN (
    'LECTURER_SLIDES', 'LECTURE_NOTES', 'GENERAL_NOTES',
    'STUDENT_SHARED_NOTES', 'PAST_PAPERS', 'REFERENCE_MATERIALS'
  )),
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  copyright_attested BOOLEAN NOT NULL DEFAULT FALSE,
  moderation_status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (moderation_status IN ('PENDING', 'APPROVED', 'REMOVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. assignments
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  lecturer_id UUID NOT NULL REFERENCES lecturer_records(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('INDIVIDUAL', 'GROUP')),
  attachment_url TEXT,
  attachment_name TEXT,
  max_marks NUMERIC(6, 2) NOT NULL CHECK (max_marks > 0),
  due_at TIMESTAMPTZ NOT NULL,
  marks_released BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 23. discussion_groups
CREATE TABLE IF NOT EXISTS discussion_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  group_mark NUMERIC(6, 2),
  lecturer_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. assignment_submissions
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES student_records(id) ON DELETE CASCADE,
  group_id UUID REFERENCES discussion_groups(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  submission_text TEXT,
  file_url TEXT,
  file_name TEXT,
  marks_awarded NUMERIC(6, 2),
  lecturer_feedback TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. discussion_messages
CREATE TABLE IF NOT EXISTS discussion_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES discussion_groups(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  message TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 25. assessments
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('TEST', 'ASSIGNMENT', 'PRESENTATION', 'EXAMINATION')),
  max_marks NUMERIC(6, 2) NOT NULL CHECK (max_marks > 0),
  weight_percentage NUMERIC(5, 2) NOT NULL CHECK (weight_percentage > 0 AND weight_percentage <= 100),
  marks_released BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. student_marks
CREATE TABLE IF NOT EXISTS student_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  score NUMERIC(6, 2) NOT NULL CHECK (score >= 0),
  entered_by UUID NOT NULL REFERENCES profiles(id),
  remarks TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assessment_id, student_id)
);

-- 27. grading_scales
CREATE TABLE IF NOT EXISTS grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_name TEXT NOT NULL DEFAULT 'Configurable Institutional Scale',
  grade_letter TEXT NOT NULL,
  min_score NUMERIC(5, 2) NOT NULL,
  max_score NUMERIC(5, 2) NOT NULL,
  grade_point NUMERIC(3, 2) NOT NULL,
  remark TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  configured_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 28. gpa_records
CREATE TABLE IF NOT EXISTS gpa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  semester_id UUID REFERENCES semesters(id) ON DELETE RESTRICT,
  record_scope TEXT NOT NULL CHECK (record_scope IN ('SEMESTER', 'ANNUAL', 'CUMULATIVE')),
  gpa_value NUMERIC(4, 2) NOT NULL,
  total_credits NUMERIC(6, 1) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, academic_year_id, semester_id, record_scope)
);

-- 31. feedback
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('LECTURER', 'CR', 'ADMINISTRATION')),
  recipient_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  privacy_mode TEXT NOT NULL CHECK (privacy_mode IN ('IDENTIFIED', 'CONFIDENTIAL', 'ANONYMOUS')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESPONDED', 'MODERATED_HIDDEN')),
  response_text TEXT,
  responded_by UUID REFERENCES profiles(id),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 32. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 33. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 34. system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(account_status);
CREATE INDEX IF NOT EXISTS idx_user_roles_profile ON user_roles(profile_id);
CREATE INDEX IF NOT EXISTS idx_student_enrolments_student ON student_enrolments(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_module ON attendance_sessions(module_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_lookup ON venue_bookings(venue_id, booking_date, status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
