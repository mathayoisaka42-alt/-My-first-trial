import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Clock, AlertTriangle, CheckCircle2, XCircle, Megaphone } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface SessionRow {
  id: string;
  module_code: string;
  module_name: string;
  venue_name: string | null;
  session_code: string;
  code_expires_at: string;
  is_emergency: number;
  emergency_reason: string | null;
  review_status: string;
  attended_count: number;
  created_at: string;
}

interface AttendanceRequestRow {
  id: string;
  student_name: string;
  registration_number: string;
  module_code: string;
  request_type: string;
  reason: string;
  status: string;
  created_at: string;
}

export const CrDashboardPage: React.FC = () => {
  const { apiFetch, user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [requests, setRequests] = useState<AttendanceRequestRow[]>([]);

  useEffect(() => {
    apiFetch<{ sessions: SessionRow[]; requests: AttendanceRequestRow[] }>('/api/attendance/manage')
      .then((d) => {
        setSessions(d.sessions);
        setRequests(d.requests.filter((r) => r.status === 'PENDING'));
      })
      .catch(() => {});
  }, [apiFetch]);

  return (
    <PortalLayout title="Course Representative Console" subtitle={`Authorized CR Portal · ${user?.registrationNumber ?? ''}`}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Course Attendance Sessions</p>
            <p className="mt-1 font-mono text-3xl font-bold text-[#12304A] tabular-nums">{sessions.length}</p>
            <Link to="/cr/attendance" className="mt-2 inline-block text-xs font-medium text-[#1C638A] hover:underline">
              Open Attendance Tools →
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Pending Manual Requests</p>
            <p className="mt-1 font-mono text-3xl font-bold text-amber-700 tabular-nums">{requests.length}</p>
            <Link to="/cr/attendance" className="mt-2 inline-block text-xs font-medium text-[#1C638A] hover:underline">
              Review Class Requests →
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Course Communication</p>
            <p className="mt-1 text-sm font-semibold text-[#12304A]">Publish Course Notices</p>
            <Link to="/cr/announcements" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#1C638A] hover:underline">
              <Megaphone className="h-3.5 w-3.5" /> New Course Announcement
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A]">Course Representative Scope &amp; Governance</h2>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            CR permissions are strictly scoped on the server to your assigned course. Emergency attendance sessions created when a lecturer is absent are automatically flagged for lecturer and institutional review. CR accounts cannot alter official assessment marks or GPA records.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/student/dashboard" className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-[#12304A] hover:bg-slate-50">
              Switch to My Student Dashboard
            </Link>
            <Link to="/cr/course-management" className="rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C638A]">
              View Course Statistics
            </Link>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
};

export const CrAttendancePage: React.FC = () => {
  const { apiFetch, user, notify } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [requests, setRequests] = useState<AttendanceRequestRow[]>([]);
  const [modules, setModules] = useState<{ id: string; code: string; name: string; course_id: string }[]>([]);
  const [venues, setVenues] = useState<{ id: string; code: string; name: string }[]>([]);

  const [moduleId, setModuleId] = useState('');
  const [venueId, setVenueId] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [liveCode, setLiveCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const loadData = useCallback(async () => {
    try {
      const [att, str, ven] = await Promise.all([
        apiFetch<{ sessions: SessionRow[]; requests: AttendanceRequestRow[] }>('/api/attendance/manage'),
        apiFetch<{ modules: { id: string; code: string; name: string; course_id: string }[] }>('/api/academic/structure'),
        apiFetch<{ venues: { id: string; code: string; name: string }[] }>('/api/venues'),
      ]);
      setSessions(att.sessions);
      setRequests(att.requests);
      const courseModules = str.modules.filter((m) => !user?.courseId || m.course_id === user.courseId);
      setModules(courseModules);
      setVenues(ven.venues);
      if (!moduleId && courseModules[0]) setModuleId(courseModules[0].id);
      if (!venueId && ven.venues[0]) setVenueId(ven.venues[0].id);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load CR attendance tools.');
    }
  }, [apiFetch, notify, user?.courseId, moduleId, venueId]);

  useEffect(() => {
    loadData();
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loadData]);

  const handleEmergencySession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ sessionCode: string; expiresAt: string }>('/api/attendance/sessions', {
        method: 'POST',
        body: JSON.stringify({
          moduleId,
          venueId,
          isEmergency: true,
          emergencyReason,
        }),
      });
      setLiveCode({ code: res.sessionCode, expiresAt: res.expiresAt });
      setEmergencyReason('');
      notify('success', 'Emergency attendance session generated and flagged for lecturer review.');
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create emergency session.');
    }
  };

  const handleReview = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await apiFetch(`/api/attendance/requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, attendanceStatus: 'LATE' }),
      });
      notify('success', `Request ${decision.toLowerCase()}.`);
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to process request.');
    }
  };

  const secondsLeft = liveCode ? Math.max(0, Math.floor((new Date(liveCode.expiresAt).getTime() - nowMs) / 1000)) : 0;

  return (
    <PortalLayout title="CR Attendance &amp; Emergency Sessions" subtitle="Authorized emergency session generator and manual verification queue">
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-[#12304A]">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-base font-semibold">Create Emergency Attendance Session</h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Use only when the scheduled lecturer is absent or unable to initiate the session. Every emergency session records your identity and reason for lecturer/administration review.
          </p>

          <form onSubmit={handleEmergencySession} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Course Module</label>
                <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Teaching Venue</label>
                <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>{v.code} — {v.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#172B3A]">Mandatory Emergency Reason *</label>
              <input
                required
                minLength={8}
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                placeholder="e.g. Lecturer delayed due to faculty board meeting; class convened in LH-01."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" className="rounded-lg bg-[#12304A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1C638A]">
              Generate 60-Second Emergency Code
            </button>
          </form>

          {liveCode && secondsLeft > 0 && (
            <div className="mt-5 rounded-lg border border-[#E4B64D] bg-[#F3F6F9] p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-600">Share this temporary code with students in the venue:</p>
                <p className="font-mono text-3xl font-bold tracking-widest text-[#12304A]">{liveCode.code}</p>
              </div>
              <div className="flex items-center gap-2 font-mono text-sm font-semibold text-amber-700 tabular-nums">
                <Clock className="h-4 w-4" /> {secondsLeft}s
              </div>
            </div>
          )}
        </div>

        {/* Manual Attendance Requests */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">
            Justified Manual Attendance Requests
          </h2>
          {requests.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No attendance requests for your course.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {requests.map((r) => (
                <div key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#12304A]">
                      {r.student_name} <span className="font-mono text-xs text-[#1C638A]">({r.registration_number})</span>
                    </p>
                    <p className="text-xs text-slate-600">{r.module_code} · {r.request_type} · &ldquo;{r.reason}&rdquo;</p>
                  </div>
                  {r.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleReview(r.id, 'APPROVED')}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve Late
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReview(r.id, 'REJECTED')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-red-700"
                      >
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

        {/* Course Sessions Log */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">Course Attendance Sessions</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Module</th>
                  <th className="py-2 pr-3 font-medium">Venue</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Review Status</th>
                  <th className="py-2 text-right font-medium">Check-ins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3 font-mono font-semibold text-[#12304A]">{s.module_code}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{s.venue_name ?? '—'}</td>
                    <td className="py-2.5 pr-3">{s.is_emergency ? 'Emergency (CR)' : 'Lecturer Session'}</td>
                    <td className="py-2.5 pr-3 font-medium">{s.review_status}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{s.attended_count}</td>
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

export const CrCourseManagementPage: React.FC = () => {
  const { apiFetch, user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  useEffect(() => {
    apiFetch<{ sessions: SessionRow[] }>('/api/attendance/manage')
      .then((d) => setSessions(d.sessions))
      .catch(() => {});
  }, [apiFetch]);

  const emergencyCount = sessions.filter((s) => s.is_emergency === 1).length;
  const totalCheckins = sessions.reduce((acc, s) => acc + s.attended_count, 0);

  return (
    <PortalLayout title="CR Course Management" subtitle="Course-level attendance statistics and communication oversight">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Total Sessions Tracked</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#12304A] tabular-nums">{sessions.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Total Student Check-ins</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#1C638A] tabular-nums">{totalCheckins}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Emergency Sessions Flagged</p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">{emergencyCount}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A]">Report Attendance Irregularity</h2>
          <p className="mt-1 text-xs text-slate-600">
            Submit formal course attendance irregularity notifications directly to Administration through the protected feedback channel.
          </p>
          <div className="mt-4 flex gap-3">
            <Link to="/student/feedback" className="rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C638A]">
              Report Irregularity to Administration
            </Link>
            <Link to="/cr/announcements" className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-[#12304A]">
              Message Class Cohort ({user?.courseId ?? 'Assigned Course'})
            </Link>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
};
