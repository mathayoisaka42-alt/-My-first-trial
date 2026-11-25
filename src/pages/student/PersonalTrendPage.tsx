import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface TrendResponse {
  scaleName: string;
  gradingScale: {
    grade_letter: string;
    min_score: number;
    max_score: number;
    grade_point: number;
    remark: string;
  }[];
  modules: {
    moduleId: string;
    moduleCode: string;
    moduleName: string;
    creditUnits: number;
    academicYearLabel: string;
    semesterName: string;
    totalPercentage: number;
    gradeLetter: string;
    gradePoint: number;
    remark: string;
    assessments: {
      assessmentId: string;
      title: string;
      assessmentType: string;
      score: number;
      maxMarks: number;
      weightPercentage: number;
    }[];
  }[];
  semesterGpas: { label: string; gpa: number; totalCredits: number }[];
  annualGpas: { label: string; gpa: number; totalCredits: number }[];
  cumulativeGpa: number;
  totalCredits: number;
  attendance: {
    totalSessions: number;
    present: number;
    late: number;
    excused: number;
    absent: number;
    attendancePercentage: number;
  };
}

export const PersonalTrendPage: React.FC = () => {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TrendResponse>('/api/student/trend')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load academic trend.'))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  return (
    <PortalLayout
      title="Personal Trend &amp; Academic Progression"
      subtitle="Private individual performance analytics · Confidential to your student record"
    >
      {loading && <div className="py-12 text-center text-sm text-slate-500">Computing academic progression...</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      {data && (
        <div className="space-y-6">
          {/* GPA Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Cumulative GPA</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#12304A] tabular-nums">
                {data.cumulativeGpa.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">{data.totalCredits} evaluated credits</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Latest Annual GPA</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#1C638A] tabular-nums">
                {data.annualGpas[data.annualGpas.length - 1]?.gpa.toFixed(2) ?? '0.00'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {data.annualGpas[data.annualGpas.length - 1]?.label ?? 'Current Year'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Latest Semester GPA</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#12304A] tabular-nums">
                {data.semesterGpas[data.semesterGpas.length - 1]?.gpa.toFixed(2) ?? '0.00'}
              </p>
              <p className="mt-1 text-xs text-slate-500 truncate">
                {data.semesterGpas[data.semesterGpas.length - 1]?.label ?? 'Current Semester'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Overall Attendance</p>
              <p className="mt-1 font-mono text-3xl font-bold text-emerald-700 tabular-nums">
                {data.attendance.attendancePercentage}%
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                Present {data.attendance.present} · Late {data.attendance.late} · Absent {data.attendance.absent}
              </p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-semibold text-[#12304A]">Semester GPA Progression</h2>
              <p className="text-xs text-slate-500 mt-0.5">Historical and current academic progression</p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.semesterGpas}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="gpa" name="Semester GPA" stroke="#12304A" strokeWidth={2.5} dot={{ r: 4, fill: '#E4B64D' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-semibold text-[#12304A]">Module Percentage Averages</h2>
              <p className="text-xs text-slate-500 mt-0.5">Released assessments across enrolled modules</p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.modules.filter((m) => m.assessments.length > 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="moduleCode" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip />
                    <Bar dataKey="totalPercentage" name="Average (%)" fill="#1C638A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Detailed Module Breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">
              Released Assessment Marks &amp; Module Grades
            </h2>
            <div className="mt-4 space-y-4">
              {data.modules.map((m) => (
                <div key={`${m.moduleId}-${m.semesterName}`} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-semibold text-[#1C638A]">{m.moduleCode}</span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="text-sm font-semibold text-[#12304A]">{m.moduleName}</span>
                      <span className="ml-2 text-xs text-slate-500">({m.academicYearLabel} · {m.semesterName})</span>
                    </div>
                    <div className="font-mono text-xs font-semibold text-[#12304A] tabular-nums">
                      {m.assessments.length > 0 ? `${m.totalPercentage}% · Grade ${m.gradeLetter} (${m.gradePoint.toFixed(1)} GP)` : 'Marks Pending Release'}
                    </div>
                  </div>
                  {m.assessments.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-500">
                            <th className="py-1.5 pr-3 font-medium">Assessment</th>
                            <th className="py-1.5 pr-3 font-medium">Category</th>
                            <th className="py-1.5 pr-3 font-medium text-right">Weight</th>
                            <th className="py-1.5 font-medium text-right">Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {m.assessments.map((a) => (
                            <tr key={a.assessmentId}>
                              <td className="py-1.5 pr-3 text-slate-800">{a.title}</td>
                              <td className="py-1.5 pr-3 text-slate-500">{a.assessmentType}</td>
                              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{a.weightPercentage}%</td>
                              <td className="py-1.5 text-right font-mono font-medium text-[#12304A] tabular-nums">
                                {a.score} / {a.maxMarks}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Active Grading Scale Notice */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-[#12304A]">Active Grading Scale ({data.scaleName})</h2>
            <p className="mt-1 text-xs text-slate-500">
              Configured in the MUSTISO GPA Engine. Official university grading scales are maintained by Principal &amp; Academic Board.
            </p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {data.gradingScale.map((g) => (
                <div key={g.grade_letter} className="rounded-lg border border-slate-200 bg-[#F3F6F9] p-3 text-xs">
                  <p className="font-mono text-base font-bold text-[#12304A]">{g.grade_letter}</p>
                  <p className="font-mono text-slate-600 tabular-nums">{g.min_score}–{g.max_score}%</p>
                  <p className="mt-1 font-medium text-[#1C638A] tabular-nums">{g.grade_point.toFixed(1)} GP · {g.remark}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};
