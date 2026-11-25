import React, { useEffect, useState, useCallback } from 'react';
import { MapPin, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface StudentSessionRow {
  id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  venue_name: string | null;
  venue_code: string | null;
  code_expires_at: string;
  session_status: string;
  is_emergency: number;
  created_at: string;
  my_status: string | null;
  verification_method: string | null;
  checked_in_at: string | null;
  distance_from_venue_meters: number | null;
  request_status: string | null;
  request_type: string | null;
}

export const StudentAttendancePage: React.FC = () => {
  const { apiFetch, notify } = useAuth();
  const [sessions, setSessions] = useState<StudentSessionRow[]>([]);
  const [radiusMeters, setRadiusMeters] = useState(150);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());

  // Check-in state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Manual request modal state
  const [manualSessionId, setManualSessionId] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<'LATE_CODE' | 'GPS_UNAVAILABLE' | 'EXCUSED_ABSENCE'>('LATE_CODE');
  const [reason, setReason] = useState('');

  const loadData = useCallback(async () => {
    try {
      const data = await apiFetch<{ sessions: StudentSessionRow[]; configuredRadiusMeters: number }>('/api/attendance/student');
      setSessions(data.sessions);
      setRadiusMeters(data.configuredRadiusMeters);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load attendance sessions.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify]);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [loadData]);

  const handleCheckIn = async (sessionId: string) => {
    if (!code.trim()) {
      notify('error', 'Enter the 6-digit attendance code displayed by your lecturer.');
      return;
    }
    if (!navigator.geolocation) {
      notify('error', 'Browser Geolocation is not available on this device. Submit a manual verification request.');
      setManualSessionId(sessionId);
      setRequestType('GPS_UNAVAILABLE');
      return;
    }

    setSubmitting(true);
    setGpsStatus('Acquiring device GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          setGpsStatus(`Location captured (±${Math.round(pos.coords.accuracy)}m). Verifying on server...`);
          const res = await apiFetch<{ message: string; distanceMeters: number | null }>('/api/attendance/check-in', {
            method: 'POST',
            body: JSON.stringify({
              sessionId,
              code: code.trim(),
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          });
          notify('success', `${res.message}${res.distanceMeters !== null ? ` (${res.distanceMeters}m from venue)` : ''}`);
          setCode('');
          setActiveSessionId(null);
          setGpsStatus(null);
          await loadData();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Verification failed.';
          setGpsStatus(msg);
          notify('error', msg);
        } finally {
          setSubmitting(false);
        }
      },
      (geoErr) => {
        setSubmitting(false);
        const msg = `GPS unavailable (${geoErr.message}). Use the manual verification procedure below.`;
        setGpsStatus(msg);
        notify('error', msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSessionId) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/attendance/requests', {
        method: 'POST',
        body: JSON.stringify({ sessionId: manualSessionId, requestType, reason }),
      });
      notify('success', 'Manual attendance request submitted for CR/Lecturer verification.');
      setManualSessionId(null);
      setReason('');
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to submit manual request.');
    } finally {
      setSubmitting(false);
    }
  };

  const liveSessions = sessions.filter((s) => s.session_status === 'ACTIVE' && new Date(s.code_expires_at).getTime() > nowMs);

  return (
    <PortalLayout
      title="Lecture Attendance &amp; GPS Verification"
      subtitle={`Server-verified 60-second session codes · Configured GPS radius: ${radiusMeters}m`}
    >
      <div className="space-y-6">
        {/* Live Sessions */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="text-base font-semibold text-[#12304A]">Active Attendance Sessions</h2>
            <span className="text-xs text-slate-500">Device location permission required for live check-in</span>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Checking live sessions...</p>
          ) : liveSessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No active 60-second attendance windows right now. If you missed a session, request manual verification in your history below.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {liveSessions.map((s) => {
                const secondsLeft = Math.max(0, Math.floor((new Date(s.code_expires_at).getTime() - nowMs) / 1000));
                return (
                  <div key={s.id} className="rounded-lg border border-slate-200 bg-[#F3F6F9] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono text-[#1C638A]">
                          {s.module_code} · {s.venue_name ?? 'Campus Venue'} {s.is_emergency ? '· CR Emergency Session' : ''}
                        </p>
                        <h3 className="text-base font-semibold text-[#12304A]">{s.module_name}</h3>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-sm font-semibold text-[#12304A] tabular-nums">
                        <Clock className="h-4 w-4 text-amber-600" />
                        <span>{secondsLeft}s remaining</span>
                      </div>
                    </div>

                    {s.my_status ? (
                      <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Checked in ({s.my_status})
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-col sm:flex-row gap-3">
                        <input
                          value={activeSessionId === s.id ? code : ''}
                          onFocus={() => setActiveSessionId(s.id)}
                          onChange={(e) => {
                            setActiveSessionId(s.id);
                            setCode(e.target.value);
                          }}
                          placeholder="Enter 6-digit session code"
                          className="sm:w-56 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono tracking-widest focus:border-[#1C638A] focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleCheckIn(s.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#12304A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1C638A] disabled:opacity-60"
                        >
                          <MapPin className="h-4 w-4" />
                          Verify GPS &amp; Check In
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setManualSessionId(s.id);
                            setRequestType('GPS_UNAVAILABLE');
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          GPS Unavailable? Request Manual
                        </button>
                      </div>
                    )}

                    {activeSessionId === s.id && gpsStatus && (
                      <p className="mt-2 text-xs text-slate-600">{gpsStatus}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Attendance History */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">
            Attendance History &amp; Late Verification Requests
          </h2>
          {sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No attendance sessions recorded for your enrolled modules yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Module</th>
                    <th className="py-2.5 pr-3 font-medium">Venue</th>
                    <th className="py-2.5 pr-3 font-medium">Date</th>
                    <th className="py-2.5 pr-3 font-medium">Status</th>
                    <th className="py-2.5 pr-3 font-medium">Method / Distance</th>
                    <th className="py-2.5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 pr-3">
                        <span className="font-mono text-xs font-semibold text-[#12304A]">{s.module_code}</span>
                        <span className="block text-xs text-slate-500">{s.module_name}</span>
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-700">{s.venue_name ?? '—'}</td>
                      <td className="py-3 pr-3 font-mono text-xs text-slate-600 tabular-nums">{s.created_at.slice(0, 16)}</td>
                      <td className="py-3 pr-3 text-xs font-semibold">
                        {s.my_status ? (
                          <span className={s.my_status === 'PRESENT' ? 'text-emerald-700' : s.my_status === 'LATE' ? 'text-amber-700' : 'text-slate-700'}>
                            {s.my_status}
                          </span>
                        ) : s.request_status ? (
                          <span className="text-[#1C638A]">Request: {s.request_status}</span>
                        ) : (
                          <span className="text-red-700">NOT RECORDED</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-500 tabular-nums">
                        {s.verification_method ?? '—'}
                        {s.distance_from_venue_meters !== null ? ` · ${s.distance_from_venue_meters}m` : ''}
                      </td>
                      <td className="py-3 text-right">
                        {!s.my_status && !s.request_status && (
                          <button
                            type="button"
                            onClick={() => {
                              setManualSessionId(s.id);
                              setRequestType('LATE_CODE');
                            }}
                            className="text-xs font-medium text-[#1C638A] hover:underline"
                          >
                            Request Manual Verification
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Manual Verification Modal */}
      {manualSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center gap-2 text-[#12304A]">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h3 className="text-base font-semibold">Manual Attendance Verification Request</h3>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Requests are reviewed by your authorized Course Representative or Lecturer and logged with timestamp and approver identity.
            </p>
            <form onSubmit={handleManualSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Reason Category</label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as 'LATE_CODE' | 'GPS_UNAVAILABLE' | 'EXCUSED_ABSENCE')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="LATE_CODE">Missed 60-second code window (Late)</option>
                  <option value="GPS_UNAVAILABLE">Device GPS unavailable / indoor drift</option>
                  <option value="EXCUSED_ABSENCE">Authorized excused absence</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Explanation *</label>
                <textarea
                  rows={3}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Provide factual explanation for late arrival or GPS issue..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setManualSessionId(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C638A]"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};
