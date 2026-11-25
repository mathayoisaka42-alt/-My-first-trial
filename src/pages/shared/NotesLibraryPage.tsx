import React, { useEffect, useState, useCallback } from 'react';
import { BookOpen, Upload, Download, Eye, Trash2, Search, X } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';

interface MaterialRow {
  id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  course_code: string;
  programme_code: string;
  department_code: string;
  academic_year_label: string;
  semester_name: string;
  uploader_id: string;
  uploader_name: string;
  category: string;
  title: string;
  description: string;
  file_url: string;
  file_name: string;
  file_mime_type: string;
  file_size_bytes: number;
  created_at: string;
}

interface AcademicStructure {
  departments: { id: string; code: string; name: string }[];
  modules: { id: string; code: string; name: string; course_id: string }[];
  academicYears: { id: string; label: string; is_current: number }[];
  semesters: { id: string; academic_year_id: string; name: string; is_current: number }[];
}

const CATEGORIES = [
  { value: 'LECTURER_SLIDES', label: 'Lecturer Slides' },
  { value: 'LECTURE_NOTES', label: 'Lecture Notes' },
  { value: 'GENERAL_NOTES', label: 'General Notes' },
  { value: 'STUDENT_SHARED_NOTES', label: 'Student Shared Notes' },
  { value: 'PAST_PAPERS', label: 'Past Papers' },
  { value: 'REFERENCE_MATERIALS', label: 'Reference Materials' },
];

export const NotesLibraryPage: React.FC = () => {
  const { apiFetch, token, user, hasAnyRole, notify } = useAuth();
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [structure, setStructure] = useState<AcademicStructure | null>(null);
  const [loading, setLoading] = useState(true);

  const [filterModule, setFilterModule] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [previewItem, setPreviewItem] = useState<MaterialRow | null>(null);

  // Upload state
  const [moduleId, setModuleId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [category, setCategory] = useState('GENERAL_NOTES');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [copyrightAttested, setCopyrightAttested] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isStaff = hasAnyRole(['LECTURER', 'PRINCIPAL', 'BOARD']);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterModule) params.set('moduleId', filterModule);
      if (filterCategory) params.set('category', filterCategory);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const [mData, sData] = await Promise.all([
        apiFetch<{ materials: MaterialRow[] }>(`/api/materials?${params.toString()}`),
        apiFetch<AcademicStructure>('/api/academic/structure'),
      ]);
      setMaterials(mData.materials);
      setStructure(sData);

      if (!academicYearId) {
        const currAy = sData.academicYears.find((y) => y.is_current) ?? sData.academicYears[0];
        if (currAy) setAcademicYearId(currAy.id);
      }
      if (!semesterId) {
        const currSem = sData.semesters.find((s) => s.is_current) ?? sData.semesters[0];
        if (currSem) setSemesterId(currSem.id);
      }
      if (!moduleId && sData.modules[0]) {
        setModuleId(sData.modules[0].id);
      }
      if (!isStaff && !['GENERAL_NOTES', 'STUDENT_SHARED_NOTES'].includes(category)) {
        setCategory('STUDENT_SHARED_NOTES');
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to load notes library.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filterModule, filterCategory, searchQuery, notify, academicYearId, semesterId, moduleId, isStaff, category]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      notify('error', 'Select a file to upload.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('moduleId', moduleId);
      fd.append('academicYearId', academicYearId);
      fd.append('semesterId', semesterId);
      fd.append('category', category);
      fd.append('title', title);
      fd.append('description', description);
      fd.append('copyrightAttested', String(copyrightAttested));
      fd.append('file', file);

      await apiFetch('/api/materials', { method: 'POST', body: fd });
      notify('success', 'Learning material uploaded to academic library.');
      setTitle('');
      setDescription('');
      setFile(null);
      setCopyrightAttested(false);
      setShowUpload(false);
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!window.confirm('Remove this learning material from the library?')) return;
    try {
      await apiFetch(`/api/materials/${id}`, { method: 'DELETE' });
      notify('success', 'Material removed.');
      await loadData();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to remove material.');
    }
  };

  const allowedUploadCategories = isStaff
    ? CATEGORIES
    : CATEGORIES.filter((c) => ['GENERAL_NOTES', 'STUDENT_SHARED_NOTES'].includes(c.value));

  return (
    <PortalLayout
      title="Notes &amp; Digital Academic Library"
      subtitle="University → Department → Programme → Course → Academic Year → Semester → Module"
    >
      <div className="space-y-6">
        {/* Search & Filter Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex flex-1 flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, module code, or topic..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-[#1C638A] focus:outline-none"
              />
            </div>

            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All Modules</option>
              {structure?.modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#12304A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1C638A] whitespace-nowrap shrink-0"
          >
            <Upload className="h-4 w-4" />
            {showUpload ? 'Close Uploader' : 'Upload Notes / Slides'}
          </button>
        </div>

        {/* Upload Drawer */}
        {showUpload && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-[#12304A]">Upload Academic Material</h2>
            <form onSubmit={handleUpload} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Module *</label>
                  <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {structure?.modules.map((m) => (
                      <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Category *</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {allowedUploadCategories.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Academic Year</label>
                  <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {structure?.academicYears.map((y) => (
                      <option key={y.id} value={y.id}>{y.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Semester</label>
                  <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {structure?.semesters.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Document Title *</label>
                  <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 4 Lecture Slides: Query Optimization" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">Attach File (PDF, PPTX, DOCX, TXT, Image) *</label>
                  <input type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs text-slate-600" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]">Description</label>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Summary of topics covered..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={copyrightAttested} onChange={(e) => setCopyrightAttested(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
                <span>I confirm this material complies with MUST academic integrity and copyright regulations and contains no unauthorized proprietary exam leaks.</span>
              </label>

              <button type="submit" disabled={uploading} className="rounded-lg bg-[#12304A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1C638A] disabled:opacity-60">
                {uploading ? 'Uploading...' : 'Publish Material'}
              </button>
            </form>
          </div>
        )}

        {/* Materials List */}
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading academic materials...</p>
        ) : materials.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-[#12304A]">No materials match your filter.</p>
            <p className="mt-1 text-xs text-slate-500">Upload lecture slides, study notes, or past papers to populate this module library.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {materials.map((m) => {
              const fileHref = `${m.file_url}?token=${encodeURIComponent(token || '')}`;
              const canDelete = m.uploader_id === user?.id || isStaff;
              return (
                <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-[#1C638A]">
                        {m.department_code} · {m.course_code} · {m.module_code}
                      </span>
                      <span className="tabular-nums">{m.created_at.slice(0, 10)}</span>
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold text-[#12304A]">{m.title}</h3>
                    <p className="mt-1 text-xs text-slate-600">{m.description || m.file_name}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {m.category.replace(/_/g, ' ')} · Contributor: {m.uploader_name} · {Math.max(1, Math.round(m.file_size_bytes / 1024))} KB
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPreviewItem(m)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#12304A] hover:underline"
                      >
                        <Eye className="h-3.5 w-3.5" /> Read Online
                      </button>
                      <a
                        href={fileHref}
                        download={m.file_name}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#1C638A] hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleRemove(m.id)}
                        className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Online Reader Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-[#12304A]">{previewItem.title}</h3>
                <p className="text-xs text-slate-500">{previewItem.module_code} · {previewItem.file_name}</p>
              </div>
              <button type="button" onClick={() => setPreviewItem(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 bg-[#F3F6F9] p-4 overflow-auto min-h-[400px]">
              {previewItem.file_mime_type.startsWith('image/') ? (
                <img
                  src={`${previewItem.file_url}?token=${encodeURIComponent(token || '')}`}
                  alt={previewItem.title}
                  className="mx-auto max-h-[70vh] rounded-lg"
                />
              ) : previewItem.file_mime_type === 'application/pdf' || previewItem.file_mime_type === 'text/plain' ? (
                <iframe
                  title={previewItem.title}
                  src={`${previewItem.file_url}?token=${encodeURIComponent(token || '')}`}
                  className="w-full h-[65vh] rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex h-64 flex-col items-center justify-center text-center">
                  <p className="text-sm text-slate-700">
                    Inline browser preview is unavailable for <span className="font-mono">{previewItem.file_mime_type}</span>.
                  </p>
                  <a
                    href={`${previewItem.file_url}?token=${encodeURIComponent(token || '')}`}
                    download={previewItem.file_name}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#12304A] px-4 py-2 text-sm font-medium text-white"
                  >
                    <Download className="h-4 w-4" /> Download {previewItem.file_name}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
};
