import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, User as UserIcon, ArrowRight } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface StudentDashboardData {
  modules: {
    id: string;
    code: string;
    name: string;
    credit_units: number;
    semester_name: string;
    academic_year_label: string;
  }[];
  cumulativeGpa: number;
  attendance: {
    totalSessions: number;
    present: number;
    late: number;
    attendancePercentage: number;
  };
  upcomingAssignments: {
    id: string;
    title: string;
    module_code: string;
    due_at: string;
    submission_id: string | null;
  }[];
  activeSessions: {
    id: string;
    module_code: string;
    module_name: string;
    venue_name: string | null;
    code_expires_at: string;
    my_status: string | null;
  }[];
  recentAnnouncements: {
    id: string;
    title: string;
    author_name: string;
    author_role: string;
    created_at: string;
    is_read: number;
  }[];
}

export const StudentDashboardPage: React.FC = () => {
  const { apiFetch, user } = useAuth();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<StudentDashboardData>('/api/student/dashboard')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  return (
    <PortalLayout title="Student Overview" subtitle={`Academic Portal · ${user?.registrationNumber ?? ''}`}>
      {loading && <div className="py-12 text-center text-sm text-slate-500">Loading academic dashboard...</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      {data && (
        <div className="space-y-6">
          {/* Top Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Cumulative GPA</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#12304A] tabular-nums">
                {data.cumulativeGpa.toFixed(2)}
              </p>
              <Link to="/student/trend" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#1C638A] hover:underline">
                View Personal Trend <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Attendance Rate</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#12304A] tabular-nums">
                {data.attendance.attendancePercentage}%
              </p>
              <p className="mt-2 text-xs text-slate-500 tabular-nums">
                {data.attendance.present + data.attendance.late} of {data.attendance.totalSessions} sessions
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Active Attendance Sessions</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#1C638A] tabular-nums">
                {data.activeSessions.length}
              </p>
              <Link to="/student/attendance" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#1C638A] hover:underline">
                Open Check-in <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Enrolled Modules</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#12304A] tabular-nums">
                {data.modules.length}
              </p>
              <Link to="/student/notes" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#1C638A] hover:underline">
                Browse Notes <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Enrolled Modules */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-semibold text-[#12304A]">Registered Modules</h2>
                <Link to="/student/assignments" className="text-xs font-medium text-[#1C638A] hover:underline">
                  Assignments →
                </Link>
              </div>
              {data.modules.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No modules enrolled for the current semester yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2 pr-3 font-medium">Code</th>
                        <th className="py-2 pr-3 font-medium">Module Title</th>
                        <th className="py-2 pr-3 font-medium">Semester</th>
                        <th className="py-2 text-right font-medium">Credits</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.modules.map((m) => (
                        <tr key={m.id}>
                          <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-[#12304A]">{m.code}</td>
                          <td className="py-2.5 pr-3 text-slate-800">{m.name}</td>
                          <td className="py-2.5 pr-3 text-xs text-slate-500">{m.semester_name}</td>
                          <td className="py-2.5 text-right font-mono text-xs tabular-nums">{m.credit_units}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Announcements & Deadlines */}
            <div className="lg:col-span-5 space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-base font-semibold text-[#12304A]">Recent Announcements</h2>
                  <Link to="/student/announcements" className="text-xs font-medium text-[#1C638A] hover:underline">
                    View all
                  </Link>
                </div>
                <div className="mt-3 divide-y divide-slate-100">
                  {data.recentAnnouncements.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">No recent announcements.</p>
                  ) : (
                    data.recentAnnouncements.map((a) => (
                      <div key={a.id} className="py-3">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-medium text-[#1C638A]">{a.author_role}</span>
                          <span aria-hidden="true">·</span>
                          <span>{a.author_name}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{a.created_at.slice(0, 10)}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-[#12304A]">{a.title}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-base font-semibold text-[#12304A]">Upcoming Assignments</h2>
                  <Link to="/student/assignments" className="text-xs font-medium text-[#1C638A] hover:underline">
                    Open
                  </Link>
                </div>
                <div className="mt-3 divide-y divide-slate-100">
                  {data.upcomingAssignments.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500">No upcoming assignments.</p>
                  ) : (
                    data.upcomingAssignments.map((a) => (
                      <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-[#1C638A]">{a.module_code}</p>
                          <p className="text-sm font-medium text-[#12304A] truncate">{a.title}</p>
                          <p className="text-xs text-slate-500 tabular-nums">Due {a.due_at.slice(0, 16)}</p>
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${a.submission_id ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {a.submission_id ? 'Submitted' : 'Pending'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};

export const StudentProfilePage: React.FC = () => {
  const { apiFetch, notify, refreshUser } = useAuth();
  const [profile, setProfile] = useState<Record<string, string | number | null> | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const data = await apiFetch<{ profile: Record<string, string | number | null> }>('/api/auth/me');
    setProfile(data.profile);
    setFullName(String(data.profile.full_name ?? ''));
    setEmail(String(data.profile.email ?? ''));
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('fullName', fullName);
      fd.append('email', email);
      if (photo) fd.append('profilePicture', photo);
      await apiFetch('/api/auth/profile', { method: 'PUT', body: fd });
      await refreshUser();
      await load();
      notify('success', 'Profile updated successfully.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalLayout title="Student Profile" subtitle="Academic registration details and identification">
      {!profile ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading profile...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 text-center">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border border-slate-200 bg-[#F3F6F9] flex items-center justify-center">
              {profile.profile_photo_url ? (
                <img
                  src={String(profile.profile_photo_url)}
                  alt={String(profile.full_name)}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserIcon className="h-10 w-10 text-slate-400" />
              )}
            </div>
            <h2 className="mt-4 text-lg font-semibold text-[#12304A]">{String(profile.full_name)}</h2>
            <p className="mt-1 font-mono text-xs text-[#1C638A]">{String(profile.registration_number ?? profile.staff_id ?? '')}</p>
            <p className="mt-2 text-xs text-slate-500">
              {String(profile.programme_code ?? '')} · Year {String(profile.year_of_study ?? '')} · {String(profile.academic_year_label ?? '')}
            </p>
          </div>

          <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-semibold text-[#12304A]">Update Contact &amp; Photo</h3>
            <p className="mt-1 text-xs text-slate-500">
              Official registration numbers, programmes, and courses can only be altered by MUST Administration.
            </p>
            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Full Name</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600 bg-[#F3F6F9] rounded-lg p-4">
                <div>
                  <span className="text-slate-500">Department:</span>{' '}
                  <span className="font-medium text-[#12304A]">{String(profile.department_name ?? '—')}</span>
                </div>
                <div>
                  <span className="text-slate-500">Course:</span>{' '}
                  <span className="font-medium text-[#12304A]">{String(profile.course_name ?? '—')}</span>
                </div>
                <div>
                  <span className="text-slate-500">Phone Number:</span>{' '}
                  <span className="font-mono font-medium text-[#12304A]">{String(profile.phone_number ?? '—')}</span>
                </div>
                <div>
                  <span className="text-slate-500">Account Status:</span>{' '}
                  <span className="font-semibold text-emerald-700">{String(profile.account_status)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Upload New Profile Picture</label>
                <label className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-600 cursor-pointer hover:bg-slate-50">
                  <Upload className="h-4 w-4 text-[#1C638A]" />
                  <span>{photo ? photo.name : 'Select JPEG, PNG, or WEBP photo'}</span>
                  <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="hidden" />
                </label>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#12304A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1C638A] disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};
