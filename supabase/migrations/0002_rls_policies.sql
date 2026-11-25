-- MUSTISO — Row Level Security (RLS) Policies & Server-Side Conflict Guards
-- Enforces strict role isolation on PostgreSQL / Supabase backend.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecturer_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecturer_module_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpa_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Security-definer helper functions
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(required_role user_role_type)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.profile_id
    WHERE p.auth_user_id = auth.uid()
      AND p.account_status = 'APPROVED'
      AND ur.role = required_role
  );
$$;

-- Profiles: Users read own profile; Principal/Board/Admin manage approved accounts
CREATE POLICY profiles_self_select ON profiles
  FOR SELECT USING (auth_user_id = auth.uid() OR public.has_role('PRINCIPAL') OR public.has_role('BOARD') OR public.has_role('ADMIN'));

CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid() AND account_status = (SELECT account_status FROM profiles WHERE auth_user_id = auth.uid()));

-- Student marks: Students ONLY see their own released marks; Lecturers only for assigned modules; Principal/Board institutional oversight
CREATE POLICY student_marks_strict_select ON student_marks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM student_records sr
      JOIN assessments a ON a.id = student_marks.assessment_id
      WHERE sr.id = student_marks.student_id
        AND sr.profile_id = public.current_profile_id()
        AND a.marks_released = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM lecturer_module_assignments lma
      JOIN lecturer_records lr ON lr.id = lma.lecturer_id
      JOIN assessments a ON a.module_id = lma.module_id
      WHERE a.id = student_marks.assessment_id
        AND lr.profile_id = public.current_profile_id()
    )
    OR public.has_role('PRINCIPAL')
    OR public.has_role('BOARD')
  );

-- Note: System Administrators do NOT get automatic write access to student_marks unless explicitly authorized
CREATE POLICY student_marks_authorized_write ON student_marks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM lecturer_module_assignments lma
      JOIN lecturer_records lr ON lr.id = lma.lecturer_id
      JOIN assessments a ON a.module_id = lma.module_id
      WHERE a.id = student_marks.assessment_id
        AND lr.profile_id = public.current_profile_id()
    )
    OR public.has_role('PRINCIPAL')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = public.current_profile_id()
        AND p.can_edit_academic_results = TRUE
    )
  );

-- Attendance records: Students only view own records; CRs view assigned course; Lecturers assigned module; Principal/Board all
CREATE POLICY attendance_records_select ON attendance_records
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM student_records sr WHERE sr.id = attendance_records.student_id AND sr.profile_id = public.current_profile_id())
    OR EXISTS (
      SELECT 1 FROM attendance_sessions s
      JOIN course_representatives cr ON cr.course_id = s.course_id AND cr.is_active = TRUE
      JOIN student_records sr ON sr.id = cr.student_id
      WHERE s.id = attendance_records.session_id AND sr.profile_id = public.current_profile_id()
    )
    OR EXISTS (
      SELECT 1 FROM attendance_sessions s
      JOIN lecturer_module_assignments lma ON lma.module_id = s.module_id
      JOIN lecturer_records lr ON lr.id = lma.lecturer_id
      WHERE s.id = attendance_records.session_id AND lr.profile_id = public.current_profile_id()
    )
    OR public.has_role('PRINCIPAL')
    OR public.has_role('BOARD')
  );

-- Database-level Double-Booking Prevention Trigger for venue_bookings
CREATE OR REPLACE FUNCTION public.prevent_venue_double_booking()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'APPROVED' THEN
    IF EXISTS (
      SELECT 1 FROM venue_bookings vb
      WHERE vb.venue_id = NEW.venue_id
        AND vb.booking_date = NEW.booking_date
        AND vb.status = 'APPROVED'
        AND vb.id <> NEW.id
        AND NOT (vb.end_time <= NEW.start_time OR vb.start_time >= NEW.end_time)
    ) THEN
      RAISE EXCEPTION 'Venue booking conflict: overlapping approved booking or scheduled class exists.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_venue_double_booking ON venue_bookings;
CREATE TRIGGER trg_prevent_venue_double_booking
  BEFORE INSERT OR UPDATE ON venue_bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_venue_double_booking();

-- Audit logs: Append-only for backend; readable by Principal, Board, Admin
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (public.has_role('PRINCIPAL') OR public.has_role('BOARD') OR public.has_role('ADMIN'));
