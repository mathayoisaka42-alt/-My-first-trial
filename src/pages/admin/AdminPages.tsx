import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Shield, HardDrive, Download, Save } from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';

interface SettingRow {
  setting_key: string;
  setting_value: string;
  description: string;
}

interface StorageStat {
  category: string;
  fileCount: number;
  totalBytes: number;
}

export const AdminDashboardPage: React.FC = () => {
  const { apiFetch } = useAuth();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [storage, setStorage] = useState<StorageStat[]>([]);

  useEffect(() => {
    apiFetch<{ settings: SettingRow[]; storage: StorageStat[] }>('/api/admin/settings')
      .then((d) => {
        setSettings(d.settings);
        setStorage(d.storage);
      })
      .catch(() => {});
  }, [apiFetch]);

  const totalFiles = storage.reduce((a, b) => a + b.fileCount, 0);

  return (
    <PortalLayout title="System Administration Console" subtitle="Technical configuration, security governance, and storage backups">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <Settings className="h-5 w-5 text-[#1C638A]" />
            <h2 className="mt-3 text-base font-semibold text-[#12304A]">System Settings</h2>
            <p className="mt-1 text-xs text-slate-500">{settings.length} active configuration parameters</p>
            <Link to="/admin/settings" className="mt-3 inline-block text-xs font-medium text-[#1C638A] hover:underline">Configure →</Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <Shield className="h-5 w-5 text-[#1C638A]" />
            <h2 className="mt-3 text-base font-semibold text-[#12304A]">Security &amp; RBAC</h2>
            <p className="mt-1 text-xs text-slate-500">Strict server-side role boundaries active</p>
            <Link to="/admin/security" className="mt-3 inline-block text-xs font-medium text-[#1C638A] hover:underline">Inspect Policies →</Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <HardDrive className="h-5 w-5 text-[#1C638A]" />
            <h2 className="mt-3 text-base font-semibold text-[#12304A]">Storage &amp; Backups</h2>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">{totalFiles} confined upload file(s)</p>
            <Link to="/admin/storage" className="mt-3 inline-block text-xs font-medium text-[#1C638A] hover:underline">Manage Backups →</Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A]">External Supabase Integration Status</h2>
          <p className="mt-2 text-sm text-slate-600">
            {isSupabaseConfigured
              ? 'Supabase environment credentials are configured for external PostgreSQL synchronization.'
              : 'Local SQLite relational database (data/mustiso.db) is currently active. To connect an external Supabase project, configure VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and apply the SQL migrations in supabase/migrations/.'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Governance safeguard: System Administrators do not hold automatic permission to modify official student marks or GPA calculations without explicit Principal authorization.
          </p>
        </div>
      </div>
    </PortalLayout>
  );
};

export const AdminSettingsPage: React.FC = () => {
  const { apiFetch, notify } = useAuth();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const d = await apiFetch<{ settings: SettingRow[] }>('/api/admin/settings');
    setSettings(d.settings);
    const map: Record<string, string> = {};
    for (const s of d.settings) map[s.setting_key] = s.setting_value;
    setEdits(map);
  }, [apiFetch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const saveSetting = async (key: string) => {
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ settingKey: key, settingValue: edits[key] }),
      });
      notify('success', `Saved ${key}.`);
      await load();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save setting.');
    }
  };

  return (
    <PortalLayout title="System Configuration" subtitle="Manage attendance code TTL, GPS check-in radius, session lifetime, and timezone">
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {settings.map((s) => (
          <div key={s.setting_key} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs font-semibold text-[#12304A]">{s.setting_key}</p>
              <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={edits[s.setting_key] ?? ''}
                onChange={(e) => setEdits((p) => ({ ...p, [s.setting_key]: e.target.value }))}
                className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => saveSetting(s.setting_key)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#12304A] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1C638A]"
              >
                <Save className="h-3.5 w-3.5" /> Save
              </button>
            </div>
          </div>
        ))}
      </div>
    </PortalLayout>
  );
};

export const AdminSecurityPage: React.FC = () => {
  const { apiFetch } = useAuth();
  const [logs, setLogs] = useState<{ id: string; action: string; actor_name: string | null; created_at: string }[]>([]);

  useEffect(() => {
    apiFetch<{ logs: typeof logs }>('/api/admin/audit-logs')
      .then((d) => setLogs(d.logs.slice(0, 25)))
      .catch(() => {});
  }, [apiFetch]);

  return (
    <PortalLayout title="Security &amp; Access Control" subtitle="Role boundaries, session integrity, and recent security events">
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A]">Verified Security Safeguards</h2>
          <ul className="mt-3 space-y-2 text-xs text-slate-700 list-disc pl-5">
            <li>Passwords hashed server-side using Node scrypt with unique 16-byte per-user salts and timing-safe comparison.</li>
            <li>Bearer session tokens held strictly in React memory (never persisted to localStorage or sessionStorage) and signed with HMAC-SHA256.</li>
            <li>All protected API endpoints enforce server-side role verification and resource ownership checks (students cannot access peer marks or staff consoles).</li>
            <li>All SQL operations use parameterized prepared statements and transactional locks for venue bookings.</li>
            <li>Uploaded files are stored in confined server directories with MIME validation and path traversal boundary checks.</li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-[#12304A] border-b border-slate-100 pb-3">Recent Security Audit Events</h2>
          <div className="mt-3 divide-y divide-slate-100 text-xs">
            {logs.map((l) => (
              <div key={l.id} className="py-2.5 flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-[#12304A]">{l.action}</span>
                <span className="text-slate-500">{l.actor_name || 'System'} · {l.created_at}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PortalLayout>
  );
};

export const AdminStoragePage: React.FC = () => {
  const { apiFetch, notify } = useAuth();
  const [storage, setStorage] = useState<StorageStat[]>([]);

  useEffect(() => {
    apiFetch<{ storage: StorageStat[] }>('/api/admin/settings')
      .then((d) => setStorage(d.storage))
      .catch(() => {});
  }, [apiFetch]);

  const exportBackup = async () => {
    try {
      const snapshot = await apiFetch<Record<string, unknown>>('/api/admin/backup');
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mustiso_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('success', 'Institutional backup snapshot downloaded.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Backup export failed.');
    }
  };

  return (
    <PortalLayout title="Storage Management &amp; Backups" subtitle="Confined file storage metrics and structured institutional backup exports">
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#12304A]">Export Institutional Database Snapshot</h2>
            <p className="mt-1 text-xs text-slate-600">Download structural academic records, venues, grading rules, and settings as JSON.</p>
          </div>
          <button type="button" onClick={exportBackup} className="inline-flex items-center gap-2 rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C638A]">
            <Download className="h-4 w-4" /> Download Backup JSON
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {storage.map((s) => (
            <div key={s.category} className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="font-mono text-xs font-semibold uppercase text-[#1C638A]">{s.category}</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#12304A] tabular-nums">{s.fileCount} files</p>
              <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">{Math.round(s.totalBytes / 1024)} KB used</p>
            </div>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
};
