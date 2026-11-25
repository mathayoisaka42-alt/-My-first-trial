import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, ShieldCheck } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface FeedbackRow {
  id: string;
  recipient_type: string;
  category: string;
  privacy_mode: string;
  message: string;
  status: string;
  response_text: string | null;
  sender_display?: string;
  recipient_name?: string | null;
  created_at: string;
}

interface RecipientOption {
  id: string;
  full_name: string;
  role: string;
}

export const FeedbackPage: React.FC = () => {
  const { apiFetch, hasAnyRole, notify } = useAuth();
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [recipientType, setRecipientType] = useState<'LECTURER' | 'CR' | 'ADMINISTRATION'>('ADMINISTRATION');
  const [recipientProfileId, setRecipientProfileId] = useState('');
  const [category, setCategory] = useState('Academic Delivery');
  const [privacyMode, setPrivacyMode] = useState<'IDENTIFIED' | 'CONFIDENTIAL' | 'ANONYMOUS'>('CONFIDENTIAL');
  const [message, setMessage] = useState('');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});

  const canRespond = hasAnyRole(['LECTURER', 'CR', 'PRINCIPAL', 'BOARD', 'ADMIN']);
  const isStudent = hasAnyRole(['STUDENT', 'CR']);

  const loadData = useCallback(async () => {
    try {
      const data = await apiFetch<{ feedback: FeedbackRow[]; recipients: RecipientOption[] }>('/api/feedback');
      setItems(data.feedback);
      setRecipients(data.recipients);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load feedback.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          recipientType,
          recipientProfileId: recipientType === 'ADMINISTRATION' ? null : recipientProfileId || null,
          category,
          privacyMode,
          message,
        }),
      });
      notify('success', 'Feedback submitted.');
      setMessage('');
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to submit feedback.');
    }
  };

  const handleRespond = async (id: string, status: 'RESPONDED' | 'MODERATED_HIDDEN' = 'RESPONDED') => {
    const responseText = responseDrafts[id] || (status === 'MODERATED_HIDDEN' ? 'Moderated by administration' : '');
    if (!responseText.trim()) return;
    try {
      await apiFetch(`/api/feedback/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ responseText, status }),
      });
      notify('success', 'Feedback updated.');
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Action failed.');
    }
  };

  return (
    <PortalLayout title="Feedback &amp; Institutional Suggestions" subtitle="Protected channels supporting identified, confidential, and anonymous feedback">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {isStudent && (
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2 text-[#12304A]">
              <ShieldCheck className="h-5 w-5 text-[#1C638A]" />
              <h2 className="text-base font-semibold">Submit Feedback</h2>
            </div>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Recipient</label>
                <select value={recipientType} onChange={(e) => setRecipientType(e.target.value as 'LECTURER' | 'CR' | 'ADMINISTRATION')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="ADMINISTRATION">University Administration</option>
                  <option value="LECTURER">Lecturer</option>
                  <option value="CR">Course Representative (CR)</option>
                </select>
              </div>

              {recipientType !== 'ADMINISTRATION' && (
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Select {recipientType}</label>
                  <select required value={recipientProfileId} onChange={(e) => setRecipientProfileId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Choose recipient</option>
                    {recipients.filter((r) => r.role === recipientType).map((r) => (
                      <option key={r.id} value={r.id}>{r.full_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option>Academic Delivery</option>
                    <option>Campus Venues &amp; Facilities</option>
                    <option>Attendance &amp; Scheduling</option>
                    <option>Welfare &amp; Governance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Privacy Mode</label>
                  <select value={privacyMode} onChange={(e) => setPrivacyMode(e.target.value as 'IDENTIFIED' | 'CONFIDENTIAL' | 'ANONYMOUS')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="IDENTIFIED">Identified</option>
                    <option value="CONFIDENTIAL">Confidential</option>
                    <option value="ANONYMOUS">Anonymous</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Message *</label>
                <textarea rows={4} required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write constructive feedback or suggestion..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>

              <button type="submit" className="w-full rounded-lg bg-[#12304A] py-2.5 text-sm font-medium text-white hover:bg-[#1C638A]">
                Submit Feedback
              </button>
            </form>
          </div>
        )}

        <div className={isStudent ? 'lg:col-span-7 space-y-4' : 'lg:col-span-12 space-y-4'}>
          {loading ? (
            <p className="py-12 text-center text-sm text-slate-500">Loading feedback records...</p>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm text-slate-600">No feedback entries yet.</p>
            </div>
          ) : (
            items.map((f) => (
              <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    <strong className="text-[#12304A]">{f.category}</strong> · {f.privacy_mode} · To {f.recipient_type}
                    {f.sender_display ? ` · From ${f.sender_display}` : ''}
                  </span>
                  <span className="font-mono">{f.status} · {f.created_at.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-slate-800">{f.message}</p>
                {f.response_text && (
                  <div className="rounded-lg bg-[#F3F6F9] p-3 text-xs text-slate-700">
                    <span className="font-semibold text-[#12304A]">Official Response: </span>
                    {f.response_text}
                  </div>
                )}
                {canRespond && !f.response_text && (
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <input
                      value={responseDrafts[f.id] ?? ''}
                      onChange={(e) => setResponseDrafts((p) => ({ ...p, [f.id]: e.target.value }))}
                      placeholder="Write official response..."
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                    />
                    <button type="button" onClick={() => handleRespond(f.id, 'RESPONDED')} className="rounded-lg bg-[#12304A] px-3 py-1.5 text-xs font-medium text-white">
                      Respond
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </PortalLayout>
  );
};
