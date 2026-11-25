import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle2, XCircle, Plus, Save } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface AssignedModule {
  id: string;
  code: string;
  name: string;
  credit_units: number;
  course_code: string;
  course_name: string;
  academic_year_id: string;
  academic_year_label: string;
  semester_id: string;
  semester_name: string;
  enrolled_count: number;
}

export const LecturerDashboardPage: React.FC = () => {
  const { apiFetch, user } = useAuth();
  const [data, setData] = useState<{
    assignedModules: AssignedModule[];
    recentSessions: { id: string; module_code: string; venue_name: string; check_ins: number; created_at: string; is_emergency: number }[];
    pendingRequests: { id: string }[];
    upcomingBookings: { id: string; title: string; venue_code: string; booking_date: string; start_time: string; end_time: string }[];
  } | null>(null);

  useEffect(() => {
    apiFetch<typeof data>('/api/lecturer/dashboard')
      .then(setData)
      .catch(() => {});
  }, [apiFetch]);

  return (
    <PortalLayout title="Lecturer Teaching Console" subtitle={`Academic Staff Portal · ${user?.staffId ?? user?.fullName ?? ''}`}>
      {!data ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading teaching overview...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Assigned Modules</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#12304A] tabular-nums">{data.assignedModules.length}</p>
              <Link to="/lecturer/modules" className="mt-2 inline-block text-xs font-medium text-[#1C638A] hover:underline">Manage Modules →</Link>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Pending Attendance Requests</p>
              <p className="mt-1 font-mono text-3xl font-bold text-amber-700 tabular-nums">{data.pendingRequests.length}</p>
              <Link to="/lecturer/attendance" className="mt-2 inline-block text-xs font-medium text-[#1C638A] hover:underline">Open Attendance →</Link>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Confirmed Venue Bookings</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#12304A] tabular-nums">{data.upcomingBookings.length}</p>
              <Link to="/lecturer/venues" className="mt-2 inline-block text-xs font-medium text-[#1C638A] hover:underline">Book Teaching Venue →</Link>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Assessment Marks</p>
              <p className="mt-1 text-sm font-semibold text-[#12304A]">Grading &amp; Release</p>
              <Link to="/lecturer/marks" className="mt-2 inline-block text-xs font-medium text-[#1C638A] hover:underline">Enter Marks →</Link>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">Assigned Teaching Modules</h2>
              <div className="mt-3 divide-y divide-slate-100">
                {data.assignedModules.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-semibold text-[#1C638A]">{m.code} · {m.course_code}</p>
                      <p className="text-sm font-medium text-[#12304A]">{m.name}</p>
                    </div>
                    <span className="font-mono text-xs text-slate-600 tabular-nums">{m.enrolled_count} students</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">Teaching Schedule &amp; Venues</h2>
              <div className="mt-3 divide-y divide-slate-100">
                {data.upcomingBookings.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">No upcoming venue bookings.</p>
                ) : (
                  data.upcomingBookings.map((b) => (
                    <div key={b.id} className="py-3">
                      <p className="text-sm font-medium text-[#12304A]">{b.title}</p>
                      <p className="text-xs font-mono text-slate-500 tabular-nums">
                        {b.venue_code} · {b.booking_date} · {b.start_time}–{b.end_time}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};

export const LecturerModulesPage: React.FC = () => {
  const { apiFetch } = useAuth();
  const [modules, setModules] = useState<AssignedModule[]>([]);

  useEffect(() => {
    apiFetch<{ assignedModules: AssignedModule[] }>('/api/lecturer/dashboard')
      .then((d) => setModules(d.assignedModules))
      .catch(() => {});
  }, [apiFetch]);

  return (
    <PortalLayout title="Assigned Modules &amp; Courses" subtitle="Modules authorized for your lecturer profile">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((m) => (
          <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-semibold text-[#1C638A]">{m.code}</span>
              <span className="font-mono text-slate-500 tabular-nums">{m.credit_units} Credits · {m.enrolled_count} Enrolled</span>
            </div>
            <h2 className="text-base font-semibold text-[#12304A]">{m.name}</h2>
            <p className="text-xs text-slate-600">{m.course_name} ({m.course_code})</p>
            <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-3 text-xs font-medium">
              <Link to="/lecturer/attendance" className="text-[#12304A] hover:underline">Start Attendance</Link>
              <Link to="/lecturer/materials" className="text-[#1C638A] hover:underline">Upload Slides</Link>
              <Link to="/lecturer/marks" className="text-[#1C638A] hover:underline">Enter Marks</Link>
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );
};

export const LecturerAttendancePage: React.FC = () => {
  const { apiFetch, notify } = useAuth();
  const [modules, setModules] = useState<AssignedModule[]>([]);
  const [venues, setVenues] = useState<{ id: string; code: string; name: string }[]>([]);
  const [sessions, setSessions] = useState<{ id: string; module_code: string; venue_name: string; session_code: string; code_expires_at: string; is_emergency: number; review_status: string; attended_count: number; created_at: string }[]>([]);
  const [requests, setRequests] = useState<{ id: string; student_name: string; registration_number: string; module_code: string; request_type: string; reason: string; status: string }[]>([]);

  const [moduleId, setModuleId] = useState('');
  const [venueId, setVenueId] = useState('');
  const [liveSession, setLiveSession] = useState<{ sessionCode: string; expiresAt: string } | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const loadAll = useCallback(async () => {
    try {
      const [dash, ven, att] = await Promise.all([
        apiFetch<{ assignedModules: AssignedModule[] }>('/api/lecturer/dashboard'),
        apiFetch<{ venues: { id: string; code: string; name: string }[] }>('/api/venues'),
        apiFetch<{ sessions: typeof sessions; requests: typeof requests }>('/api/attendance/manage'),
      ]);
      setModules(dash.assignedModules);
      setVenues(ven.venues);
      setSessions(att.sessions);
      setRequests(att.requests);
      if (!moduleId && dash.assignedModules[0]) setModuleId(dash.assignedModules[0].id);
      if (!venueId && ven.venues[0]) setVenueId(ven.venues[0].id);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load attendance console.');
    }
  }, [apiFetch, notify, moduleId, venueId]);

  useEffect(() => {
    loadAll();
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loadAll]);

  const startSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ sessionCode: string; expiresAt: string }>('/api/attendance/sessions', {
        method: 'POST',
        body: JSON.stringify({ moduleId, venueId, isEmergency: false }),
      });
      setLiveSession(res);
      notify('success', '60-second attendance session started.');
      await loadAll();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to start session.');
    }
  };

  const reviewRequest = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    await apiFetch(`/api/attendance/requests/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, attendanceStatus: 'LATE' }),
    });
    notify('success', `Manual request ${decision.toLowerCase()}.`);
    await loadAll();
  };

  const verifyEmergency = async (id: string, reviewStatus: 'VERIFIED' | 'FLAGGED') => {
    await apiFetch(`/api/attendance/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ reviewStatus }),
    });
    notify('success', `Emergency session marked ${reviewStatus}.`);
    await loadAll();
  };

  const secondsLeft = liveSession ? Math.max(0, Math.floor((new Date(liveSession.expiresAt).getTime() - nowMs) / 1000)) : 0;

  return (
    <PortalLayout title="Class Attendance Session Manager" subtitle="Generate 60-second GPS-verified attendance codes and review late requests">
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A]">Start Live Lecture Attendance Session</h2>
          <form onSubmit={startSession} className="mt-4 flex flex-col sm:flex-row gap-3">
            <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} required className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {modules.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
            <select value={venueId} onChange={(e) => setVenueId(e.target.value)} required className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.code} — {v.name}</option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-[#12304A] px-5 py-2 text-sm font-medium text-white hover:bg-[#1C638A] whitespace-nowrap">
              Generate 60s Code
            </button>
          </form>

          {liveSession && (
            <div className="mt-5 rounded-xl border border-[#1C638A] bg-[#F3F6F9] p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#1C638A]">Active Attendance Verification Code</p>
                <p className="mt-1 font-mono text-4xl font-bold tracking-[0.25em] text-[#12304A]">{liveSession.sessionCode}</p>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center gap-1.5 font-mono text-lg font-bold tabular-nums ${secondsLeft > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  <Clock className="h-5 w-5" />
                  {secondsLeft > 0 ? `${secondsLeft}s valid` : 'EXPIRED'}
                </span>
                <p className="text-xs text-slate-500 mt-0.5">Students verify enrolment &amp; venue GPS</p>
              </div>
            </div>
          )}
        </div>

        {/* Manual Requests */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">Manual &amp; Late Attendance Requests</h2>
          {requests.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No manual attendance requests pending.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {requests.map((r) => (
                <div key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#12304A]">{r.student_name} ({r.registration_number})</p>
                    <p className="text-xs text-slate-600">{r.module_code} · {r.request_type} · &ldquo;{r.reason}&rdquo;</p>
                  </div>
                  {r.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => reviewRequest(r.id, 'APPROVED')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button type="button" onClick={() => reviewRequest(r.id, 'REJECTED')} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-red-700">
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500">{r.status}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Session Reports */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">Attendance Session Reports</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Module</th>
                  <th className="py-2 pr-3 font-medium">Venue</th>
                  <th className="py-2 pr-3 font-medium">Timestamp</th>
                  <th className="py-2 pr-3 font-medium">Check-ins</th>
                  <th className="py-2 text-right font-medium">CR Emergency Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3 font-mono font-semibold text-[#12304A]">{s.module_code}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{s.venue_name}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">{s.created_at.slice(0, 16)}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">{s.attended_count}</td>
                    <td className="py-2.5 text-right">
                      {s.is_emergency ? (
                        s.review_status === 'PENDING_REVIEW' ? (
                          <span className="inline-flex gap-2">
                            <button type="button" onClick={() => verifyEmergency(s.id, 'VERIFIED')} className="text-emerald-700 font-medium hover:underline">Verify</button>
                            <button type="button" onClick={() => verifyEmergency(s.id, 'FLAGGED')} className="text-red-700 font-medium hover:underline">Flag</button>
                          </span>
                        ) : (
                          <span className="font-medium text-slate-600">{s.review_status}</span>
                        )
                      ) : (
                        <span className="text-slate-400">Standard</span>
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

export const LecturerMarksPage: React.FC = () => {
  const { apiFetch, notify } = useAuth();
  const [modules, setModules] = useState<AssignedModule[]>([]);
  const [selectedModId, setSelectedModId] = useState('');
  const [assessments, setAssessments] = useState<{ id: string; title: string; assessment_type: string; max_marks: number; weight_percentage: number; marks_released: number }[]>([]);
  const [students, setStudents] = useState<{ student_id: string; registration_number: string; full_name: string }[]>([]);
  const [selectedAsmtId, setSelectedAsmtId] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [releaseMarks, setReleaseMarks] = useState(true);

  // Create Assessment form
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [aType, setAType] = useState<'TEST' | 'ASSIGNMENT' | 'PRESENTATION' | 'EXAMINATION'>('TEST');
  const [maxMarks, setMaxMarks] = useState(100);
  const [weightPct, setWeightPct] = useState(20);

  useEffect(() => {
    apiFetch<{ assignedModules: AssignedModule[] }>('/api/lecturer/dashboard')
      .then((d) => {
        setModules(d.assignedModules);
        if (d.assignedModules[0]) setSelectedModId(d.assignedModules[0].id);
      })
      .catch(() => {});
  }, [apiFetch]);

  const loadModuleMarks = useCallback(async (modId: string) => {
    if (!modId) return;
    const data = await apiFetch<{
      assessments: typeof assessments;
      students: typeof students;
      marks: { assessment_id: string; student_id: string; score: number }[];
    }>(`/api/marks/module/${modId}`);
    setAssessments(data.assessments);
    setStudents(data.students);
    const firstAsmt = data.assessments[0]?.id ?? '';
    setSelectedAsmtId((prev) => (data.assessments.some((a) => a.id === prev) ? prev : firstAsmt));
    const map: Record<string, string> = {};
    for (const m of data.marks) {
      map[`${m.assessment_id}:${m.student_id}`] = String(m.score);
    }
    setScores(map);
  }, [apiFetch]);

  useEffect(() => {
    if (selectedModId) loadModuleMarks(selectedModId);
  }, [selectedModId, loadModuleMarks]);

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    const mod = modules.find((m) => m.id === selectedModId);
    if (!mod) return;
    try {
      await apiFetch('/api/assessments', {
        method: 'POST',
        body: JSON.stringify({
          moduleId: mod.id,
          academicYearId: mod.academic_year_id || 'ay-2026-2027',
          semesterId: mod.semester_id || 'sem-2627-1',
          title,
          assessmentType: aType,
          maxMarks,
          weightPercentage: weightPct,
          marksReleased: false,
        }),
      });
      notify('success', 'Assessment created.');
      setTitle('');
      setShowNew(false);
      await loadModuleMarks(selectedModId);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create assessment.');
    }
  };

  const handleSaveMarks = async () => {
    if (!selectedAsmtId) return;
    const entries = students
      .map((s) => ({
        studentId: s.student_id,
        score: Number(scores[`${selectedAsmtId}:${s.student_id}`] ?? ''),
      }))
      .filter((e) => !Number.isNaN(e.score) && scores[`${selectedAsmtId}:${e.studentId}`] !== undefined && scores[`${selectedAsmtId}:${e.studentId}`] !== '');

    if (entries.length === 0) {
      notify('error', 'Enter at least one student score before saving.');
      return;
    }

    try {
      const res = await apiFetch<{ message: string }>('/api/marks/enter', {
        method: 'POST',
        body: JSON.stringify({ assessmentId: selectedAsmtId, entries, releaseMarks }),
      });
      notify('success', res.message);
      await loadModuleMarks(selectedModId);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save marks.');
    }
  };

  const activeAsmt = assessments.find((a) => a.id === selectedAsmtId);

  return (
    <PortalLayout title="Assessment Marks Entry" subtitle="Enter, validate, and publish student marks for assigned modules">
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3 flex-1">
            <select value={selectedModId} onChange={(e) => setSelectedModId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {modules.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
            <select value={selectedAsmtId} onChange={(e) => setSelectedAsmtId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>{a.title} ({a.assessment_type} · {a.weight_percentage}%)</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setShowNew((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white">
            <Plus className="h-4 w-4" /> New Assessment
          </button>
        </div>

        {showNew && (
          <form onSubmit={handleCreateAssessment} className="rounded-xl border border-slate-200 bg-white p-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Assessment Title" className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={aType} onChange={(e) => setAType(e.target.value as 'TEST' | 'ASSIGNMENT' | 'PRESENTATION' | 'EXAMINATION')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="TEST">Test</option>
              <option value="ASSIGNMENT">Assignment</option>
              <option value="PRESENTATION">Presentation</option>
              <option value="EXAMINATION">Examination</option>
            </select>
            <div className="flex gap-2">
              <input type="number" value={maxMarks} onChange={(e) => setMaxMarks(Number(e.target.value))} placeholder="Max" className="w-1/2 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              <input type="number" value={weightPct} onChange={(e) => setWeightPct(Number(e.target.value))} placeholder="Weight %" className="w-1/2 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
            </div>
            <button type="submit" className="rounded-lg bg-[#12304A] py-2 text-sm font-medium text-white">Create Assessment</button>
          </form>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-[#12304A]">{activeAsmt?.title ?? 'Select an Assessment'}</h2>
              {activeAsmt && (
                <p className="text-xs text-slate-500">
                  Max Marks: {activeAsmt.max_marks} · Weight: {activeAsmt.weight_percentage}% · Visibility: {activeAsmt.marks_released ? 'Released to Students' : 'Draft (Hidden)'}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={releaseMarks} onChange={(e) => setReleaseMarks(e.target.checked)} className="rounded border-slate-300" />
                Release marks to students
              </label>
              <button type="button" onClick={handleSaveMarks} className="inline-flex items-center gap-1.5 rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C638A]">
                <Save className="h-3.5 w-3.5" /> Save Marks
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-4 font-medium">Registration Number</th>
                  <th className="py-2 pr-4 font-medium">Student Name</th>
                  <th className="py-2 font-medium text-right">Score (/{activeAsmt?.max_marks ?? 100})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.student_id}>
                    <td className="py-2.5 pr-4 font-mono text-xs font-semibold text-[#12304A]">{s.registration_number}</td>
                    <td className="py-2.5 pr-4 text-slate-800">{s.full_name}</td>
                    <td className="py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        max={activeAsmt?.max_marks ?? 100}
                        step="0.5"
                        value={scores[`${selectedAsmtId}:${s.student_id}`] ?? ''}
                        onChange={(e) => setScores((p) => ({ ...p, [`${selectedAsmtId}:${s.student_id}`]: e.target.value }))}
                        className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-right font-mono text-xs tabular-nums"
                      />
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
