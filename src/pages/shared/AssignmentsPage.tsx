import React, { useEffect, useState, useCallback } from 'react';
import { FileText, Users, Send, Plus, CheckCircle2, Lock } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface AssignmentRow {
  id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  title: string;
  instructions: string;
  assignment_type: 'INDIVIDUAL' | 'GROUP';
  max_marks: number;
  due_at: string;
  marks_released: number;
  my_submission_id?: string | null;
  my_submitted_at?: string | null;
  my_file_name?: string | null;
  my_marks?: number | null;
  my_feedback?: string | null;
  submission_count?: number;
}

interface DiscussionGroup {
  id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  assignment_id: string | null;
  assignment_title: string | null;
  name: string;
  member_count: number;
  message_count: number;
  is_member: number;
}

interface DiscussionMessage {
  id: string;
  author_name: string;
  message: string;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
}

interface SubmissionRow {
  id: string;
  submitter_name: string;
  registration_number: string | null;
  group_name: string | null;
  submission_text: string;
  file_url: string | null;
  file_name: string | null;
  marks_awarded: number | null;
  lecturer_feedback: string | null;
  submitted_at: string;
}

export const AssignmentsPage: React.FC = () => {
  const { apiFetch, hasAnyRole, token, notify } = useAuth();
  const [tab, setTab] = useState<'ASSIGNMENTS' | 'DISCUSSIONS'>('ASSIGNMENTS');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [groups, setGroups] = useState<DiscussionGroup[]>([]);
  const [modules, setModules] = useState<{ id: string; code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const isStaff = hasAnyRole(['LECTURER', 'PRINCIPAL', 'BOARD']);

  // Student submit state
  const [submitTarget, setSubmitTarget] = useState<AssignmentRow | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionGroupId, setSubmissionGroupId] = useState('');
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);

  // Lecturer create assignment state
  const [showCreate, setShowCreate] = useState(false);
  const [newModId, setNewModId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newInstr, setNewInstr] = useState('');
  const [newType, setNewType] = useState<'INDIVIDUAL' | 'GROUP'>('INDIVIDUAL');
  const [newMaxMarks, setNewMaxMarks] = useState(20);
  const [newDueAt, setNewDueAt] = useState('');

  // Lecturer view submissions
  const [viewingAssignment, setViewingAssignment] = useState<AssignmentRow | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [gradeInputs, setGradeInputs] = useState<Record<string, { marks: string; feedback: string }>>({});

  // Discussion Thread state
  const [activeGroup, setActiveGroup] = useState<DiscussionGroup | null>(null);
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [msgText, setMsgText] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupModId, setNewGroupModId] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [aData, gData, sData] = await Promise.all([
        apiFetch<{ assignments: AssignmentRow[] }>('/api/assignments'),
        apiFetch<{ groups: DiscussionGroup[] }>('/api/discussions'),
        apiFetch<{ modules: { id: string; code: string; name: string }[] }>('/api/academic/structure'),
      ]);
      setAssignments(aData.assignments);
      setGroups(gData.groups);
      setModules(sData.modules);
      if (!newModId && sData.modules[0]) setNewModId(sData.modules[0].id);
      if (!newGroupModId && sData.modules[0]) setNewGroupModId(sData.modules[0].id);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load assignments.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify, newModId, newGroupModId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitTarget) return;
    try {
      const fd = new FormData();
      fd.append('submissionText', submissionText);
      if (submitTarget.assignment_type === 'GROUP') fd.append('groupId', submissionGroupId);
      if (submissionFile) fd.append('file', submissionFile);
      await apiFetch(`/api/assignments/${submitTarget.id}/submit`, { method: 'POST', body: fd });
      notify('success', 'Assignment submitted and locked with timestamp.');
      setSubmitTarget(null);
      setSubmissionText('');
      setSubmissionFile(null);
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Submission failed.');
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          moduleId: newModId,
          title: newTitle,
          instructions: newInstr,
          assignmentType: newType,
          maxMarks: newMaxMarks,
          dueAt: newDueAt,
        }),
      });
      notify('success', 'Assignment published.');
      setShowCreate(false);
      setNewTitle('');
      setNewInstr('');
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create assignment.');
    }
  };

  const openSubmissions = async (a: AssignmentRow) => {
    setViewingAssignment(a);
    const data = await apiFetch<{ submissions: SubmissionRow[] }>(`/api/assignments/${a.id}/submissions`);
    setSubmissions(data.submissions);
  };

  const handleGradeSubmission = async (subId: string) => {
    const g = gradeInputs[subId];
    if (!g || !g.marks) return;
    try {
      await apiFetch(`/api/assignments/submissions/${subId}/grade`, {
        method: 'POST',
        body: JSON.stringify({ marksAwarded: Number(g.marks), lecturerFeedback: g.feedback, releaseMarks: true }),
      });
      notify('success', 'Submission graded and released.');
      if (viewingAssignment) await openSubmissions(viewingAssignment);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Grading failed.');
    }
  };

  const openGroupThread = async (g: DiscussionGroup) => {
    setActiveGroup(g);
    const data = await apiFetch<{ messages: DiscussionMessage[] }>(`/api/discussions/${g.id}/messages`);
    setMessages(data.messages);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await apiFetch('/api/discussions', {
        method: 'POST',
        body: JSON.stringify({ moduleId: newGroupModId, name: newGroupName }),
      });
      notify('success', 'Discussion group created.');
      setNewGroupName('');
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to create group.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup || !msgText.trim()) return;
    await apiFetch(`/api/discussions/${activeGroup.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: msgText }),
    });
    setMsgText('');
    await openGroupThread(activeGroup);
  };

  return (
    <PortalLayout title="Assignments &amp; Group Discussions" subtitle="Individual tasks, shared group submissions, and collaborative study threads">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setTab('ASSIGNMENTS')}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${tab === 'ASSIGNMENTS' ? 'bg-white text-[#12304A] shadow-sm' : 'text-slate-600'}`}
            >
              Assignments
            </button>
            <button
              type="button"
              onClick={() => setTab('DISCUSSIONS')}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${tab === 'DISCUSSIONS' ? 'bg-white text-[#12304A] shadow-sm' : 'text-slate-600'}`}
            >
              Group Discussions
            </button>
          </div>

          {isStaff && tab === 'ASSIGNMENTS' && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C638A]"
            >
              <Plus className="h-4 w-4" /> New Assignment
            </button>
          )}
        </div>

        {showCreate && isStaff && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-[#12304A]">Create Assignment</h2>
            <form onSubmit={handleCreateAssignment} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Module</label>
                  <select value={newModId} onChange={(e) => setNewModId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Type</label>
                  <select value={newType} onChange={(e) => setNewType(e.target.value as 'INDIVIDUAL' | 'GROUP')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="INDIVIDUAL">Individual Assignment</option>
                    <option value="GROUP">Group Assignment</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-[#172B3A]">Max Marks</label>
                    <input type="number" value={newMaxMarks} onChange={(e) => setNewMaxMarks(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#172B3A]">Deadline</label>
                    <input type="datetime-local" required value={newDueAt} onChange={(e) => setNewDueAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Title</label>
                <input required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Instructions</label>
                <textarea rows={3} required value={newInstr} onChange={(e) => setNewInstr(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="rounded-lg bg-[#12304A] px-5 py-2 text-sm font-medium text-white hover:bg-[#1C638A]">
                Publish Assignment
              </button>
            </form>
          </div>
        )}

        {tab === 'ASSIGNMENTS' && (
          <div className="space-y-4">
            {loading ? (
              <p className="py-12 text-center text-sm text-slate-500">Loading assignments...</p>
            ) : assignments.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 text-sm font-medium text-[#12304A]">No assignments posted yet.</p>
              </div>
            ) : (
              assignments.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-[#1C638A]">
                      {a.module_code} · {a.assignment_type} · Max {a.max_marks} marks
                    </span>
                    <span className="font-mono tabular-nums">Due: {a.due_at.slice(0, 16)}</span>
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold text-[#12304A]">{a.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{a.instructions}</p>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    {isStaff ? (
                      <button
                        type="button"
                        onClick={() => openSubmissions(a)}
                        className="text-xs font-medium text-[#1C638A] hover:underline"
                      >
                        Review &amp; Grade Submissions ({a.submission_count ?? 0}) →
                      </button>
                    ) : a.my_submission_id ? (
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" /> Submitted {a.my_submitted_at?.slice(0, 16)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Lock className="h-3.5 w-3.5" /> Locked
                        </span>
                        {a.my_marks !== null && a.my_marks !== undefined && (
                          <span className="font-mono font-semibold text-[#12304A]">
                            Score: {a.my_marks}/{a.max_marks} {a.my_feedback ? `· "${a.my_feedback}"` : ''}
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSubmitTarget(a)}
                        className="rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C638A]"
                      >
                        Submit Assignment
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'DISCUSSIONS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-4">
              <form onSubmit={handleCreateGroup} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <h2 className="text-sm font-semibold text-[#12304A]">Create Discussion Group</h2>
                <select value={newGroupModId} onChange={(e) => setNewGroupModId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Group name..."
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                  <button type="submit" className="rounded-lg bg-[#12304A] px-3 py-2 text-xs font-medium text-white">Create</button>
                </div>
              </form>

              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                {groups.map((g) => (
                  <div key={g.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-[#1C638A]">{g.module_code}</p>
                      <p className="text-sm font-semibold text-[#12304A]">{g.name}</p>
                      <p className="text-xs text-slate-500 tabular-nums">{g.member_count} members · {g.message_count} messages</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!g.is_member && !isStaff && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/discussions/${g.id}/join`, { method: 'POST' });
                            loadData();
                          }}
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium"
                        >
                          Join
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openGroupThread(g)}
                        className="rounded-lg bg-[#12304A] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 flex flex-col min-h-[420px]">
              {!activeGroup ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500">
                  <Users className="h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm">Select a discussion group to view messages.</p>
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-base font-semibold text-[#12304A]">{activeGroup.name}</h3>
                    <p className="text-xs text-slate-500">{activeGroup.module_code} · {activeGroup.module_name}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto py-4 space-y-3 max-h-80">
                    {messages.map((m) => (
                      <div key={m.id} className="rounded-lg bg-[#F3F6F9] p-3">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="font-semibold text-[#12304A]">{m.author_name}</span>
                          <span className="font-mono tabular-nums">{m.created_at.slice(0, 16)}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">{m.message}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendMessage} className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                    <input
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      placeholder="Write a message to your group..."
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                    />
                    <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-[#12304A] px-4 py-2 text-sm font-medium text-white">
                      <Send className="h-4 w-4" /> Send
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Student Submit Modal */}
      {submitTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[#12304A]">Submit: {submitTarget.title}</h3>
            <p className="mt-1 text-xs text-slate-500">Submissions are locked against unauthorized edits once recorded.</p>
            <form onSubmit={handleStudentSubmit} className="mt-4 space-y-4">
              {submitTarget.assignment_type === 'GROUP' && (
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Select Discussion Group *</label>
                  <select required value={submissionGroupId} onChange={(e) => setSubmissionGroupId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Choose group</option>
                    {groups.filter((g) => g.module_id === submitTarget.module_id).map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Submission Notes / Response</label>
                <textarea rows={4} value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Attach Document (PDF / DOCX / ZIP / Image)</label>
                <input type="file" onChange={(e) => setSubmissionFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setSubmitTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium">Cancel</button>
                <button type="submit" className="rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white">Confirm &amp; Lock Submission</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lecturer Grading Modal */}
      {viewingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-[#12304A]">Submissions: {viewingAssignment.title}</h3>
              <button type="button" onClick={() => setViewingAssignment(null)} className="text-xs font-medium text-slate-600 hover:underline">Close</button>
            </div>
            <div className="mt-4 space-y-4">
              {submissions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No student submissions yet.</p>
              ) : (
                submissions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-[#12304A]">{s.group_name ? `Group: ${s.group_name}` : `${s.submitter_name} (${s.registration_number ?? ''})`}</span>
                      <span className="font-mono text-slate-500">{s.submitted_at.slice(0, 16)}</span>
                    </div>
                    {s.submission_text && <p className="text-sm text-slate-700">{s.submission_text}</p>}
                    {s.file_url && (
                      <a href={`${s.file_url}?token=${encodeURIComponent(token || '')}`} target="_blank" rel="noreferrer" className="inline-block text-xs font-medium text-[#1C638A] hover:underline">
                        Download: {s.file_name}
                      </a>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                      <input
                        type="number"
                        placeholder={`Marks / ${viewingAssignment.max_marks}`}
                        defaultValue={s.marks_awarded ?? ''}
                        onChange={(e) => setGradeInputs((p) => ({ ...p, [s.id]: { marks: e.target.value, feedback: p[s.id]?.feedback ?? s.lecturer_feedback ?? '' } }))}
                        className="w-32 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      />
                      <input
                        placeholder="Lecturer feedback..."
                        defaultValue={s.lecturer_feedback ?? ''}
                        onChange={(e) => setGradeInputs((p) => ({ ...p, [s.id]: { marks: p[s.id]?.marks ?? String(s.marks_awarded ?? ''), feedback: e.target.value } }))}
                        className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      />
                      <button type="button" onClick={() => handleGradeSubmission(s.id)} className="rounded-lg bg-[#12304A] px-3 py-1.5 text-xs font-medium text-white">
                        Save &amp; Release
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};
