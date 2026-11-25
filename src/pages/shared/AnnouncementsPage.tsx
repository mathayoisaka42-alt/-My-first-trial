import React, { useEffect, useState, useCallback } from 'react';
import { Megaphone, Paperclip, CheckCircle2, Plus } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface AnnouncementRow {
  id: string;
  title: string;
  description: string;
  author_name: string;
  author_role: string;
  target_scope: string;
  course_code: string | null;
  module_code: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  is_read: number;
  created_at: string;
}

interface AcademicStructure {
  courses: { id: string; code: string; name: string }[];
  modules: { id: string; code: string; name: string }[];
}

export const AnnouncementsPage: React.FC<{ forcePublisherMode?: boolean }> = ({ forcePublisherMode = false }) => {
  const { apiFetch, user, token, hasAnyRole, notify } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [structure, setStructure] = useState<AcademicStructure | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(forcePublisherMode);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetScope, setTargetScope] = useState<'INSTITUTION' | 'COURSE' | 'MODULE'>('COURSE');
  const [targetCourseId, setTargetCourseId] = useState('');
  const [targetModuleId, setTargetModuleId] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canPublish = hasAnyRole(['CR', 'LECTURER', 'BOARD', 'PRINCIPAL', 'ADMIN']);
  const isExecutive = hasAnyRole(['BOARD', 'PRINCIPAL', 'ADMIN']);

  const loadData = useCallback(async () => {
    try {
      const [aData, sData] = await Promise.all([
        apiFetch<{ announcements: AnnouncementRow[] }>('/api/announcements'),
        apiFetch<AcademicStructure>('/api/academic/structure'),
      ]);
      setAnnouncements(aData.announcements);
      setStructure(sData);
      if (user?.courseId && !targetCourseId) {
        setTargetCourseId(user.courseId);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load announcements.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify, user?.courseId, targetCourseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('description', description);
      fd.append('targetScope', targetScope);
      if (targetScope === 'COURSE' && targetCourseId) fd.append('targetCourseId', targetCourseId);
      if (targetScope === 'MODULE' && targetModuleId) fd.append('targetModuleId', targetModuleId);
      if (attachment) fd.append('attachment', attachment);

      await apiFetch('/api/announcements', { method: 'POST', body: fd });
      notify('success', 'Announcement published and notifications dispatched.');
      setTitle('');
      setDescription('');
      setAttachment(null);
      setShowForm(false);
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to publish announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    await apiFetch(`/api/announcements/${id}/read`, { method: 'POST' });
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: 1 } : a)));
  };

  return (
    <PortalLayout
      title="University &amp; Course Announcements"
      subtitle="Role-scoped official academic communications"
    >
      <div className="space-y-6">
        {canPublish && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#12304A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1C638A] transition"
            >
              <Plus className="h-4 w-4" />
              {showForm ? 'Hide Publisher Form' : 'Publish Announcement'}
            </button>
          </div>
        )}

        {canPublish && showForm && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-[#12304A]">New Announcement</h2>
            <form onSubmit={handlePublish} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Announcement Title *</label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Concise subject line"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Target Audience *</label>
                  <select
                    value={targetScope}
                    onChange={(e) => setTargetScope(e.target.value as 'INSTITUTION' | 'COURSE' | 'MODULE')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {isExecutive && <option value="INSTITUTION">Institution-Wide (All Users)</option>}
                    <option value="COURSE">Assigned Course</option>
                    {hasAnyRole(['LECTURER', 'PRINCIPAL', 'BOARD']) && <option value="MODULE">Assigned Module</option>}
                  </select>
                </div>
              </div>

              {targetScope === 'COURSE' && (
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Course</label>
                  <select
                    value={targetCourseId}
                    onChange={(e) => setTargetCourseId(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select Course</option>
                    {structure?.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetScope === 'MODULE' && (
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Module</label>
                  <select
                    value={targetModuleId}
                    onChange={(e) => setTargetModuleId(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select Module</option>
                    {structure?.modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} — {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Description *</label>
                <textarea
                  rows={4}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Write the full announcement message..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Optional Attachment (PDF / Image / Doc)</label>
                <input
                  type="file"
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-xs text-slate-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#12304A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1C638A] disabled:opacity-60"
              >
                {submitting ? 'Publishing...' : 'Publish Announcement'}
              </button>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <p className="py-12 text-center text-sm text-slate-500">Loading announcements...</p>
          ) : announcements.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
              <Megaphone className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-[#12304A]">No announcements available for your academic scope.</p>
            </div>
          ) : (
            announcements.map((a) => (
              <article key={a.id} className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#1C638A]">{a.author_role}</span>
                    <span aria-hidden="true">·</span>
                    <span>{a.author_name}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Scope: {a.target_scope}
                      {a.module_code ? ` (${a.module_code})` : a.course_code ? ` (${a.course_code})` : ''}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums">{a.created_at.slice(0, 16)}</span>
                </div>

                <h3 className="mt-2 text-lg font-semibold text-[#12304A]">{a.title}</h3>
                <p className="mt-2 text-sm text-slate-700 whitespace-pre-line leading-relaxed">{a.description}</p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <div>
                    {a.attachment_url && (
                      <a
                        href={`${a.attachment_url}?token=${encodeURIComponent(token || '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1C638A] hover:underline"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {a.attachment_name || 'Download Attachment'}
                      </a>
                    )}
                  </div>

                  {a.is_read ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Read
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(a.id)}
                      className="text-xs font-medium text-[#1C638A] hover:underline"
                    >
                      Mark as Read
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </PortalLayout>
  );
};
