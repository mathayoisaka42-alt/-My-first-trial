import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { CheckCircle2, XCircle, Download, Printer, Shield, UserPlus, Award } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface InstitutionalAnalytics {
  counts: {
    approved_students: number;
    pending_registrations: number;
    total_lecturers: number;
    total_courses: number;
    total_modules: number;
    emergency_sessions_pending: number;
  };
  studentsByProg: { code: string; name: string; student_count: number }[];
  moduleAnalytics: {
    id: string;
    code: string;
    name: string;
    course_code: string;
    enrolled_students: number;
    avg_score_pct: number | null;
    total_sessions: number;
    emergency_sessions: number;
  }[];
  lecturerMonitoring: {
    id: string;
    staff_id: string;
    full_name: string;
    department_code: string;
    assigned_modules: number;
    conducted_sessions: number;
    cancelled_sessions: number;
    missed_sessions: number;
    student_checkins_evidence: number;
  }[];
  gpaDistribution: {
    first_class: number | null;
    upper_second: number | null;
    lower_second: number | null;
    pass_band: number | null;
    fail_band: number | null;
  };
}

export const InstitutionalDashboardPage: React.FC<{ roleLabel: string }> = ({ roleLabel }) => {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<InstitutionalAnalytics | null>(null);

  useEffect(() => {
    apiFetch<InstitutionalAnalytics>('/api/analytics/institutional')
      .then(setData)
      .catch(() => {});
  }, [apiFetch]);

  return (
    <PortalLayout title={`${roleLabel} Institutional Console`} subtitle="University-wide academic performance, attendance oversight, and governance">
      {!data ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading institutional analytics...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Approved Students</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#12304A] tabular-nums">{data.counts.approved_students}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Pending Approvals</p>
              <p className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">{data.counts.pending_registrations}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Academic Staff</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#12304A] tabular-nums">{data.counts.total_lecturers}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Active Courses</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#12304A] tabular-nums">{data.counts.total_courses}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Active Modules</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#12304A] tabular-nums">{data.counts.total_modules}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">CR Emergency Alerts</p>
              <p className="mt-1 font-mono text-2xl font-bold text-red-700 tabular-nums">{data.counts.emergency_sessions_pending}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-semibold text-[#12304A]">Enrolment by Programme</h2>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.studentsByProg}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="code" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip />
                    <Bar dataKey="student_count" name="Students" fill="#12304A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-semibold text-[#12304A]">Module Performance Average (%)</h2>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.moduleAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip />
                    <Bar dataKey="avg_score_pct" name="Avg Score (%)" fill="#1C638A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};

export const PrincipalUsersPage: React.FC = () => {
  const { apiFetch, hasAnyRole, notify } = useAuth();
  const [users, setUsers] = useState<{
    id: string;
    registration_number: string | null;
    staff_id: string | null;
    full_name: string;
    phone_number: string;
    account_status: string;
    roles: string;
    student_record_id: string | null;
    verified_against_registry: number | null;
    course_code: string | null;
    cr_appointment_id: string | null;
  }[]>([]);
  const [statusTab, setStatusTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [showStaffModal, setShowStaffModal] = useState(false);

  // Staff provisioning form
  const [staffName, setStaffName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<'LECTURER' | 'BOARD' | 'ADMIN'>('LECTURER');
  const [staffPass, setStaffPass] = useState('');

  // Registry CSV/JSON import
  const [registryInput, setRegistryInput] = useState('');
  const [showImport, setShowImport] = useState(false);

  const isPrincipal = hasAnyRole(['PRINCIPAL']);

  const loadUsers = useCallback(async () => {
    const data = await apiFetch<{ users: typeof users }>('/api/admin/users');
    setUsers(data.users);
  }, [apiFetch]);

  useEffect(() => {
    loadUsers().catch(() => {});
  }, [loadUsers]);

  const handleDecision = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    const reason = decision === 'REJECTED' ? window.prompt('Enter rejection reason for student notification:') ?? 'Verification failed' : undefined;
    try {
      await apiFetch(`/api/admin/users/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason }),
      });
      notify('success', `Account ${decision.toLowerCase()}.`);
      await loadUsers();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const handleCrToggle = async (studentRecordId: string, appoint: boolean) => {
    if (!window.confirm(appoint ? 'Appoint this student as Course Representative?' : 'Revoke CR permissions for this student?')) return;
    try {
      await apiFetch('/api/admin/cr-appointment', {
        method: 'POST',
        body: JSON.stringify({ studentRecordId, appoint }),
      });
      notify('success', appoint ? 'Course Representative appointed.' : 'CR appointment revoked.');
      await loadUsers();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'CR update failed.');
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: staffName,
          staffId,
          phoneNumber: staffPhone,
          email: staffEmail,
          role: staffRole,
          password: staffPass,
        }),
      });
      notify('success', `${staffRole} account provisioned.`);
      setShowStaffModal(false);
      setStaffName('');
      setStaffId('');
      setStaffPhone('');
      setStaffPass('');
      await loadUsers();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to create staff account.');
    }
  };

  const handleRegistryImport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const lines = registryInput.split('\n').map((l) => l.trim()).filter(Boolean);
      const records = lines.map((line) => {
        const [registrationNumber, fullName, programmeCode, courseCode, yearOfStudy, academicYearLabel] = line.split(',').map((s) => s.trim());
        return {
          registrationNumber,
          fullName,
          programmeCode: programmeCode || 'BCS',
          courseCode: courseCode || 'BCS-SE',
          yearOfStudy: Number(yearOfStudy) || 1,
          academicYearLabel: academicYearLabel || '2026/2027',
        };
      });
      const res = await apiFetch<{ message: string }>('/api/admin/import-registry', {
        method: 'POST',
        body: JSON.stringify({ records }),
      });
      notify('success', res.message);
      setRegistryInput('');
      setShowImport(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Import failed. Use CSV format: RegNo,FullName,ProgCode,CourseCode,Year,AcademicYear');
    }
  };

  const filtered = users.filter((u) => statusTab === 'ALL' || u.account_status === statusTab);

  return (
    <PortalLayout title="User Provisioning, Approvals &amp; CR Appointments" subtitle="Verify student registrations against MUST records and manage institutional accounts">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg bg-slate-200/70 p-1">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setStatusTab(t)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${statusTab === t ? 'bg-white text-[#12304A] shadow-sm' : 'text-slate-600'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setShowImport((v) => !v)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-[#12304A]">
              Import Verified Registry CSV
            </button>
            <button type="button" onClick={() => setShowStaffModal((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#12304A] px-3.5 py-2 text-xs font-medium text-white">
              <UserPlus className="h-3.5 w-3.5" /> Provision Staff
            </button>
          </div>
        </div>

        {showImport && (
          <form onSubmit={handleRegistryImport} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#12304A]">Import Official MUST Student Registry (CSV Lines)</h3>
            <p className="text-xs text-slate-500 font-mono">Format: RegNo, Full Name, ProgrammeCode, CourseCode, YearOfStudy, AcademicYear</p>
            <textarea
              rows={4}
              value={registryInput}
              onChange={(e) => setRegistryInput(e.target.value)}
              placeholder="MUST/BCS/25/099, Asha Mohamed Ally, BCS, BCS-SE, 2, 2026/2027"
              className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
            />
            <button type="submit" className="rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white">Import Records</button>
          </form>
        )}

        {showStaffModal && (
          <form onSubmit={handleCreateStaff} className="rounded-xl border border-slate-200 bg-white p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input required value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Staff Full Name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="Staff ID (e.g. MUST-LEC-002)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            <input required value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} placeholder="Phone (+255...)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={staffRole} onChange={(e) => setStaffRole(e.target.value as 'LECTURER' | 'BOARD' | 'ADMIN')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="LECTURER">Lecturer</option>
              <option value="BOARD">University Board</option>
              <option value="ADMIN">System Administrator</option>
            </select>
            <input type="password" required minLength={8} value={staffPass} onChange={(e) => setStaffPass(e.target.value)} placeholder="Initial Password (min 8)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-[#12304A] py-2 text-sm font-medium text-white">Create Staff Account</button>
          </form>
        )}

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F3F6F9] text-slate-600">
                  <th className="py-3 px-4 font-medium">Identifier</th>
                  <th className="py-3 px-4 font-medium">Name &amp; Phone</th>
                  <th className="py-3 px-4 font-medium">Roles</th>
                  <th className="py-3 px-4 font-medium">Registry Check</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 px-4 font-mono font-semibold text-[#12304A]">{u.registration_number || u.staff_id}</td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#12304A]">{u.full_name}</p>
                      <p className="text-slate-500 font-mono">{u.phone_number}</p>
                    </td>
                    <td className="py-3 px-4 font-medium text-[#1C638A]">{u.roles}</td>
                    <td className="py-3 px-4">
                      {u.student_record_id ? (u.verified_against_registry ? 'Matched MUST Registry' : 'Unverified Entry') : 'Staff Account'}
                    </td>
                    <td className="py-3 px-4 font-semibold">{u.account_status}</td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      {u.account_status === 'PENDING' && (
                        <>
                          <button type="button" onClick={() => handleDecision(u.id, 'APPROVED')} className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1 text-white">
                            <CheckCircle2 className="h-3 w-3" /> Approve
                          </button>
                          <button type="button" onClick={() => handleDecision(u.id, 'REJECTED')} className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1 text-red-700">
                            <XCircle className="h-3 w-3" /> Reject
                          </button>
                        </>
                      )}
                      {isPrincipal && u.student_record_id && u.account_status === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => handleCrToggle(u.student_record_id!, !u.cr_appointment_id)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-[#12304A] hover:bg-slate-50"
                        >
                          <Award className="h-3 w-3" /> {u.cr_appointment_id ? 'Revoke CR' : 'Appoint CR'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
};

export const PrincipalAcademicManagementPage: React.FC = () => {
  const { apiFetch, notify } = useAuth();
  const [structure, setStructure] = useState<{
    departments: { id: string; code: string; name: string }[];
    programmes: { id: string; code: string; name: string; level: string }[];
    courses: { id: string; code: string; name: string; department_id: string }[];
    modules: { id: string; code: string; name: string; credit_units: number; course_code: string }[];
    academicYears: { id: string; label: string }[];
    semesters: { id: string; name: string }[];
    lecturerAssignments: { id: string; lecturer_name: string; module_code: string; module_name: string; course_code: string; academic_year_label: string }[];
  } | null>(null);
  const [lecturers, setLecturers] = useState<{ id: string; full_name: string; staff_id: string }[]>([]);

  const [mCourseId, setMCourseId] = useState('');
  const [mCode, setMCode] = useState('');
  const [mName, setMName] = useState('');
  const [mCredits, setMCredits] = useState('3');

  const [assignLecId, setAssignLecId] = useState('');
  const [assignModId, setAssignModId] = useState('');

  const loadAll = useCallback(async () => {
    const [s, l] = await Promise.all([
      apiFetch<typeof structure>('/api/academic/structure'),
      apiFetch<{ lecturers: typeof lecturers }>('/api/lecturers'),
    ]);
    setStructure(s);
    setLecturers(l.lecturers);
    if (s?.courses[0] && !mCourseId) setMCourseId(s.courses[0].id);
    if (s?.modules[0] && !assignModId) setAssignModId(s.modules[0].id);
    if (l.lecturers[0] && !assignLecId) setAssignLecId(l.lecturers[0].id);
  }, [apiFetch, mCourseId, assignModId, assignLecId]);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const createModule = async (e: React.FormEvent) => {
    e.preventDefault();
    const crs = structure?.courses.find((c) => c.id === mCourseId);
    if (!crs) return;
    try {
      await apiFetch('/api/academic/modules', {
        method: 'POST',
        body: JSON.stringify({
          courseId: crs.id,
          departmentId: crs.department_id,
          code: mCode,
          name: mName,
          creditUnits: Number(mCredits),
          yearOfStudy: 1,
          semesterNumber: 1,
        }),
      });
      notify('success', 'Module created.');
      setMCode('');
      setMName('');
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create module.');
    }
  };

  const assignLecturer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/academic/assign-lecturer', {
        method: 'POST',
        body: JSON.stringify({
          lecturerId: assignLecId,
          moduleId: assignModId,
          academicYearId: structure?.academicYears[0]?.id ?? 'ay-2026-2027',
          semesterId: structure?.semesters[0]?.id ?? 'sem-2627-1',
        }),
      });
      notify('success', 'Lecturer assigned to module.');
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Assignment failed.');
    }
  };

  return (
    <PortalLayout title="Academic Management" subtitle="Programmes, courses, modules, and lecturer module assignments">
      {structure && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={createModule} className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <h2 className="text-base font-semibold text-[#12304A]">Add Academic Module</h2>
              <select value={mCourseId} onChange={(e) => setMCourseId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {structure.courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <input required value={mCode} onChange={(e) => setMCode(e.target.value)} placeholder="Code (CS 301)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
                <input required value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Module Name" className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex items-center gap-3">
                <input type="number" step="0.5" value={mCredits} onChange={(e) => setMCredits(e.target.value)} className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button type="submit" className="rounded-lg bg-[#12304A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1C638A]">Create Module</button>
              </div>
            </form>

            <form onSubmit={assignLecturer} className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <h2 className="text-base font-semibold text-[#12304A]">Assign Lecturer to Module</h2>
              <select value={assignLecId} onChange={(e) => setAssignLecId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {lecturers.map((l) => (
                  <option key={l.id} value={l.id}>{l.full_name} ({l.staff_id})</option>
                ))}
              </select>
              <select value={assignModId} onChange={(e) => setAssignModId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {structure.modules.map((m) => (
                  <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg bg-[#12304A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1C638A]">Assign Lecturer</button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">Current Lecturer Assignments</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Lecturer</th>
                    <th className="py-2 pr-3 font-medium">Module</th>
                    <th className="py-2 pr-3 font-medium">Course</th>
                    <th className="py-2 font-medium">Academic Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {structure.lecturerAssignments.map((la) => (
                    <tr key={la.id}>
                      <td className="py-2.5 pr-3 font-medium text-[#12304A]">{la.lecturer_name}</td>
                      <td className="py-2.5 pr-3 font-mono">{la.module_code} — {la.module_name}</td>
                      <td className="py-2.5 pr-3 font-mono">{la.course_code}</td>
                      <td className="py-2.5 font-mono">{la.academic_year_label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};

export const PrincipalResultsAndScalePage: React.FC = () => {
  const { apiFetch, notify } = useAuth();
  const [scaleName, setScaleName] = useState('');
  const [bands, setBands] = useState<{ gradeLetter: string; minScore: number; maxScore: number; gradePoint: number; remark: string }[]>([]);

  useEffect(() => {
    apiFetch<{ gradingScale: { scale_name: string; grade_letter: string; min_score: number; max_score: number; grade_point: number; remark: string }[] }>('/api/academic/structure')
      .then((d) => {
        setScaleName(d.gradingScale[0]?.scale_name ?? 'Approved MUST Scale');
        setBands(
          d.gradingScale.map((g) => ({
            gradeLetter: g.grade_letter,
            minScore: g.min_score,
            maxScore: g.max_score,
            gradePoint: g.grade_point,
            remark: g.remark,
          }))
        );
      })
      .catch(() => {});
  }, [apiFetch]);

  const handleSaveScale = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/academic/grading-scale', {
        method: 'PUT',
        body: JSON.stringify({ scaleName, bands }),
      });
      notify('success', 'Official grading scale configuration updated.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save grading scale.');
    }
  };

  return (
    <PortalLayout title="Results &amp; Configurable GPA Grading Scale" subtitle="Configure grade boundaries and grade points according to official MUST academic regulations">
      <form onSubmit={handleSaveScale} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#172B3A]">Regulation / Scale Name</label>
          <input value={scaleName} onChange={(e) => setScaleName(e.target.value)} className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">Grade</th>
                <th className="py-2 pr-3">Min Score (%)</th>
                <th className="py-2 pr-3">Max Score (%)</th>
                <th className="py-2 pr-3">Grade Point</th>
                <th className="py-2">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bands.map((b, idx) => (
                <tr key={idx}>
                  <td className="py-2 pr-3">
                    <input value={b.gradeLetter} onChange={(e) => setBands((prev) => prev.map((x, i) => (i === idx ? { ...x, gradeLetter: e.target.value } : x)))} className="w-16 rounded border border-slate-300 px-2 py-1 font-mono" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" step="0.01" value={b.minScore} onChange={(e) => setBands((prev) => prev.map((x, i) => (i === idx ? { ...x, minScore: Number(e.target.value) } : x)))} className="w-24 rounded border border-slate-300 px-2 py-1 font-mono" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" step="0.01" value={b.maxScore} onChange={(e) => setBands((prev) => prev.map((x, i) => (i === idx ? { ...x, maxScore: Number(e.target.value) } : x)))} className="w-24 rounded border border-slate-300 px-2 py-1 font-mono" />
                  </td>
                  <td className="py-2 pr-3">
                    <input type="number" step="0.1" value={b.gradePoint} onChange={(e) => setBands((prev) => prev.map((x, i) => (i === idx ? { ...x, gradePoint: Number(e.target.value) } : x)))} className="w-20 rounded border border-slate-300 px-2 py-1 font-mono" />
                  </td>
                  <td className="py-2">
                    <input value={b.remark} onChange={(e) => setBands((prev) => prev.map((x, i) => (i === idx ? { ...x, remark: e.target.value } : x)))} className="w-40 rounded border border-slate-300 px-2 py-1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="submit" className="rounded-lg bg-[#12304A] px-5 py-2 text-sm font-medium text-white hover:bg-[#1C638A]">
          Save &amp; Activate Grading Scale
        </button>
      </form>
    </PortalLayout>
  );
};

export const InstitutionalAttendancePage: React.FC = () => {
  const { apiFetch, notify } = useAuth();
  const [data, setData] = useState<InstitutionalAnalytics | null>(null);
  const [sessions, setSessions] = useState<{ id: string; module_code: string; creator_name: string; is_emergency: number; emergency_reason: string | null; review_status: string; session_status: string; attended_count: number; created_at: string }[]>([]);

  const load = useCallback(async () => {
    const [an, att] = await Promise.all([
      apiFetch<InstitutionalAnalytics>('/api/analytics/institutional'),
      apiFetch<{ sessions: typeof sessions }>('/api/attendance/manage'),
    ]);
    setData(an);
    setSessions(att.sessions);
  }, [apiFetch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const updateSession = async (id: string, payload: { sessionStatus?: string; reviewStatus?: string }) => {
    await apiFetch(`/api/attendance/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    notify('success', 'Session status updated.');
    await load();
  };

  return (
    <PortalLayout title="Lecturer &amp; Institutional Attendance Monitoring" subtitle="Track scheduled lectures, teaching attendance, and emergency CR sessions">
      <div className="space-y-6">
        {data && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">
              Lecturer Teaching Attendance Overview
            </h2>
            <p className="mt-2 text-xs text-slate-500">
              Student check-ins are listed as supporting attendance evidence alongside official session records.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Staff ID</th>
                    <th className="py-2 pr-3 font-medium">Lecturer</th>
                    <th className="py-2 pr-3 font-medium">Dept</th>
                    <th className="py-2 pr-3 font-medium text-right">Modules</th>
                    <th className="py-2 pr-3 font-medium text-right">Conducted</th>
                    <th className="py-2 pr-3 font-medium text-right">Cancelled</th>
                    <th className="py-2 pr-3 font-medium text-right">Missed</th>
                    <th className="py-2 font-medium text-right">Student Check-ins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.lecturerMonitoring.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 pr-3 font-mono font-semibold text-[#12304A]">{l.staff_id}</td>
                      <td className="py-2.5 pr-3 text-slate-800">{l.full_name}</td>
                      <td className="py-2.5 pr-3 font-mono">{l.department_code}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{l.assigned_modules}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{l.conducted_sessions}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{l.cancelled_sessions}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-red-700">{l.missed_sessions}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{l.student_checkins_evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">All Attendance &amp; Emergency Sessions</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Module</th>
                  <th className="py-2 pr-3">Initiated By</th>
                  <th className="py-2 pr-3">Type / Reason</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Governance Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3 font-mono font-semibold text-[#12304A]">{s.module_code}</td>
                    <td className="py-2.5 pr-3">{s.creator_name}</td>
                    <td className="py-2.5 pr-3">{s.is_emergency ? `CR Emergency: ${s.emergency_reason}` : 'Standard Lecture'}</td>
                    <td className="py-2.5 pr-3 font-mono">{s.session_status} · {s.review_status}</td>
                    <td className="py-2.5 text-right space-x-2">
                      <button type="button" onClick={() => updateSession(s.id, { reviewStatus: 'VERIFIED' })} className="text-emerald-700 hover:underline">Verify</button>
                      <button type="button" onClick={() => updateSession(s.id, { sessionStatus: 'MISSED' })} className="text-red-700 hover:underline">Mark Missed</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
};

export const InstitutionalReportsPage: React.FC<{ title?: string }> = ({ title = 'Institutional Reports & Analytics' }) => {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<InstitutionalAnalytics | null>(null);

  useEffect(() => {
    apiFetch<InstitutionalAnalytics>('/api/analytics/institutional')
      .then(setData)
      .catch(() => {});
  }, [apiFetch]);

  const exportCsv = () => {
    if (!data) return;
    const headers = ['ModuleCode', 'ModuleName', 'CourseCode', 'EnrolledStudents', 'AvgScorePct', 'TotalSessions', 'EmergencySessions'];
    const rows = data.moduleAnalytics.map((m) =>
      [m.code, `"${m.name}"`, m.course_code, m.enrolled_students, m.avg_score_pct ?? 0, m.total_sessions, m.emergency_sessions].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mustiso_institutional_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PortalLayout title={title} subtitle="Exportable academic performance and attendance reports (CSV/Excel & Print PDF)">
      {data && (
        <div className="space-y-6">
          <div className="flex justify-end gap-3 no-print">
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C638A]">
              <Download className="h-3.5 w-3.5" /> Export Excel/CSV
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-[#12304A]">
              <Printer className="h-3.5 w-3.5" /> Export PDF (Print)
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">Module Academic &amp; Attendance Summary</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">Module</th>
                    <th className="py-2 pr-3 font-medium">Course</th>
                    <th className="py-2 pr-3 font-medium text-right">Enrolled</th>
                    <th className="py-2 pr-3 font-medium text-right">Avg Score (%)</th>
                    <th className="py-2 font-medium text-right">Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.moduleAnalytics.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-3 font-mono font-semibold text-[#12304A]">{m.code}</td>
                      <td className="py-2.5 pr-3 text-slate-800">{m.name}</td>
                      <td className="py-2.5 pr-3 font-mono">{m.course_code}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{m.enrolled_students}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{m.avg_score_pct ?? '—'}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{m.total_sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};

export const AuditLogsPage: React.FC = () => {
  const { apiFetch } = useAuth();
  const [logs, setLogs] = useState<{ id: string; actor_name: string | null; actor_role: string | null; action: string; target_table: string; details: string; created_at: string }[]>([]);

  useEffect(() => {
    apiFetch<{ logs: typeof logs }>('/api/admin/audit-logs')
      .then((d) => setLogs(d.logs))
      .catch(() => {});
  }, [apiFetch]);

  return (
    <PortalLayout title="Institutional Audit Logs" subtitle="Immutable trail of authentication, approvals, grading, and governance actions">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
          <Shield className="h-4 w-4 text-[#1C638A]" />
          <h2 className="text-sm font-semibold text-[#12304A]">System Activity Trail</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F3F6F9] text-slate-600">
                <th className="py-2.5 px-4 font-medium">Timestamp</th>
                <th className="py-2.5 px-4 font-medium">Actor</th>
                <th className="py-2.5 px-4 font-medium">Action</th>
                <th className="py-2.5 px-4 font-medium">Target</th>
                <th className="py-2.5 px-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap">{l.created_at}</td>
                  <td className="py-2.5 px-4">{l.actor_name || 'System'} ({l.actor_role || '—'})</td>
                  <td className="py-2.5 px-4 font-mono font-semibold text-[#12304A]">{l.action}</td>
                  <td className="py-2.5 px-4 font-mono">{l.target_table}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-600 max-w-xs truncate">{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
};
