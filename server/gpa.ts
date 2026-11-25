import crypto from 'node:crypto';
import { db } from './db.ts';

export interface GradingScaleRow {
  id: string;
  scale_name: string;
  grade_letter: string;
  min_score: number;
  max_score: number;
  grade_point: number;
  remark: string;
}

export interface ModulePerformanceSummary {
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  creditUnits: number;
  yearOfStudy: number;
  semesterNumber: number;
  academicYearId: string;
  academicYearLabel: string;
  semesterId: string;
  semesterName: string;
  assessments: {
    assessmentId: string;
    title: string;
    assessmentType: string;
    score: number;
    maxMarks: number;
    weightPercentage: number;
    weightedContribution: number;
  }[];
  totalPercentage: number;
  gradeLetter: string;
  gradePoint: number;
  remark: string;
}

export function getActiveGradingScale(): GradingScaleRow[] {
  return db
    .prepare(
      `SELECT id, scale_name, grade_letter, min_score, max_score, grade_point, remark
       FROM grading_scales WHERE is_active = 1 ORDER BY min_score DESC`
    )
    .all() as unknown as GradingScaleRow[];
}

export function resolveGrade(percentage: number, scale: GradingScaleRow[]): {
  gradeLetter: string;
  gradePoint: number;
  remark: string;
} {
  const rounded = Math.round(percentage * 100) / 100;
  for (const row of scale) {
    if (rounded >= row.min_score && rounded <= row.max_score) {
      return {
        gradeLetter: row.grade_letter,
        gradePoint: row.grade_point,
        remark: row.remark,
      };
    }
  }
  // Fallback if score sits between decimal boundary
  const sorted = [...scale].sort((a, b) => b.min_score - a.min_score);
  for (const row of sorted) {
    if (rounded >= row.min_score) {
      return {
        gradeLetter: row.grade_letter,
        gradePoint: row.grade_point,
        remark: row.remark,
      };
    }
  }
  return { gradeLetter: 'F', gradePoint: 0.0, remark: 'Fail' };
}

export function calculateStudentAcademicTrend(studentRecordId: string, includeUnreleased = false) {
  const scale = getActiveGradingScale();

  const enrolments = db
    .prepare(
      `SELECT se.module_id, se.academic_year_id, se.semester_id,
              m.code as module_code, m.name as module_name, m.credit_units, m.year_of_study, m.semester_number,
              ay.label as academic_year_label, s.name as semester_name
       FROM student_enrolments se
       JOIN modules m ON m.id = se.module_id
       JOIN academic_years ay ON ay.id = se.academic_year_id
       JOIN semesters s ON s.id = se.semester_id
       WHERE se.student_id = ?
       ORDER BY ay.start_date ASC, s.semester_number ASC, m.code ASC`
    )
    .all(studentRecordId) as {
    module_id: string;
    academic_year_id: string;
    semester_id: string;
    module_code: string;
    module_name: string;
    credit_units: number;
    year_of_study: number;
    semester_number: number;
    academic_year_label: string;
    semester_name: string;
  }[];

  const moduleSummaries: ModulePerformanceSummary[] = [];

  for (const enr of enrolments) {
    const releaseClause = includeUnreleased ? '' : 'AND a.marks_released = 1';
    const marksRows = db
      .prepare(
        `SELECT a.id as assessment_id, a.title, a.assessment_type, a.max_marks, a.weight_percentage,
                sm.score
         FROM assessments a
         JOIN student_marks sm ON sm.assessment_id = a.id AND sm.student_id = ?
         WHERE a.module_id = ? AND a.academic_year_id = ? AND a.semester_id = ? ${releaseClause}
         ORDER BY a.created_at ASC`
      )
      .all(studentRecordId, enr.module_id, enr.academic_year_id, enr.semester_id) as {
      assessment_id: string;
      title: string;
      assessment_type: string;
      max_marks: number;
      weight_percentage: number;
      score: number;
    }[];

    let totalWeightEvaluated = 0;
    let weightedScoreSum = 0;

    const assessments = marksRows.map((row) => {
      const contribution = (row.score / row.max_marks) * row.weight_percentage;
      totalWeightEvaluated += row.weight_percentage;
      weightedScoreSum += contribution;
      return {
        assessmentId: row.assessment_id,
        title: row.title,
        assessmentType: row.assessment_type,
        score: row.score,
        maxMarks: row.max_marks,
        weightPercentage: row.weight_percentage,
        weightedContribution: Math.round(contribution * 100) / 100,
      };
    });

    // Normalize percentage against evaluated weights if partial assessments exist, or full 100%
    const effectivePct =
      totalWeightEvaluated > 0
        ? Math.round((weightedScoreSum / totalWeightEvaluated) * 100 * 100) / 100
        : 0;

    const grade = assessments.length > 0 ? resolveGrade(effectivePct, scale) : { gradeLetter: 'N/A', gradePoint: 0, remark: 'Pending' };

    moduleSummaries.push({
      moduleId: enr.module_id,
      moduleCode: enr.module_code,
      moduleName: enr.module_name,
      creditUnits: enr.credit_units,
      yearOfStudy: enr.year_of_study,
      semesterNumber: enr.semester_number,
      academicYearId: enr.academic_year_id,
      academicYearLabel: enr.academic_year_label,
      semesterId: enr.semester_id,
      semesterName: enr.semester_name,
      assessments,
      totalPercentage: effectivePct,
      gradeLetter: grade.gradeLetter,
      gradePoint: grade.gradePoint,
      remark: grade.remark,
    });
  }

  // Group into Semester GPAs, Annual GPAs, Cumulative GPA
  const gradedModules = moduleSummaries.filter((m) => m.assessments.length > 0);
  const semesterMap = new Map<string, { label: string; academicYearId: string; semesterId: string; credits: number; points: number }>();
  const annualMap = new Map<string, { label: string; academicYearId: string; credits: number; points: number }>();

  let cumCredits = 0;
  let cumPoints = 0;

  for (const mod of gradedModules) {
    cumCredits += mod.creditUnits;
    cumPoints += mod.gradePoint * mod.creditUnits;

    const semKey = `${mod.academicYearId}:${mod.semesterId}`;
    const semAcc = semesterMap.get(semKey) ?? {
      label: mod.semesterName,
      academicYearId: mod.academicYearId,
      semesterId: mod.semesterId,
      credits: 0,
      points: 0,
    };
    semAcc.credits += mod.creditUnits;
    semAcc.points += mod.gradePoint * mod.creditUnits;
    semesterMap.set(semKey, semAcc);

    const annAcc = annualMap.get(mod.academicYearId) ?? {
      label: mod.academicYearLabel,
      academicYearId: mod.academicYearId,
      credits: 0,
      points: 0,
    };
    annAcc.credits += mod.creditUnits;
    annAcc.points += mod.gradePoint * mod.creditUnits;
    annualMap.set(mod.academicYearId, annAcc);
  }

  const semesterGpas = Array.from(semesterMap.values()).map((s) => ({
    academicYearId: s.academicYearId,
    semesterId: s.semesterId,
    label: s.label,
    totalCredits: s.credits,
    gpa: s.credits > 0 ? Math.round((s.points / s.credits) * 100) / 100 : 0,
  }));

  const annualGpas = Array.from(annualMap.values()).map((a) => ({
    academicYearId: a.academicYearId,
    label: a.label,
    totalCredits: a.credits,
    gpa: a.credits > 0 ? Math.round((a.points / a.credits) * 100) / 100 : 0,
  }));

  const cumulativeGpa = cumCredits > 0 ? Math.round((cumPoints / cumCredits) * 100) / 100 : 0;

  // Persist GPA records snapshot
  for (const s of semesterGpas) {
    db.prepare(
      `INSERT INTO gpa_records (id, student_id, academic_year_id, semester_id, record_scope, gpa_value, total_credits)
       VALUES (?, ?, ?, ?, 'SEMESTER', ?, ?)
       ON CONFLICT(student_id, academic_year_id, semester_id, record_scope)
       DO UPDATE SET gpa_value = excluded.gpa_value, total_credits = excluded.total_credits, computed_at = datetime('now')`
    ).run(crypto.randomUUID(), studentRecordId, s.academicYearId, s.semesterId, s.gpa, s.totalCredits);
  }

  // Attendance summary for this student
  const attSummary = db
    .prepare(
      `SELECT
         COUNT(*) as total_sessions,
         SUM(CASE WHEN ar.status = 'PRESENT' THEN 1 ELSE 0 END) as present_count,
         SUM(CASE WHEN ar.status = 'LATE' THEN 1 ELSE 0 END) as late_count,
         SUM(CASE WHEN ar.status = 'EXCUSED' THEN 1 ELSE 0 END) as excused_count,
         SUM(CASE WHEN ar.status = 'ABSENT' THEN 1 ELSE 0 END) as absent_count
       FROM attendance_sessions s
       JOIN student_enrolments se ON se.module_id = s.module_id AND se.student_id = ?
       LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = ?
       WHERE s.session_status IN ('ACTIVE', 'CLOSED')`
    )
    .get(studentRecordId, studentRecordId) as {
    total_sessions: number;
    present_count: number | null;
    late_count: number | null;
    excused_count: number | null;
    absent_count: number | null;
  };

  const totalSessions = attSummary.total_sessions || 0;
  const attendedCount = (attSummary.present_count || 0) + (attSummary.late_count || 0);
  const attendancePercentage = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 1000) / 10 : 0;

  return {
    scaleName: scale[0]?.scale_name ?? 'Configurable Scale',
    gradingScale: scale,
    modules: moduleSummaries,
    semesterGpas,
    annualGpas,
    cumulativeGpa,
    totalCredits: cumCredits,
    attendance: {
      totalSessions,
      present: attSummary.present_count || 0,
      late: attSummary.late_count || 0,
      excused: attSummary.excused_count || 0,
      absent: Math.max(0, totalSessions - attendedCount - (attSummary.excused_count || 0)),
      attendancePercentage,
    },
  };
}
