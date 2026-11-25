import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type RoleName = 'STUDENT' | 'CR' | 'LECTURER' | 'BOARD' | 'PRINCIPAL' | 'ADMIN';

export interface AuthUser {
  id: string;
  fullName: string;
  registrationNumber: string | null;
  staffId: string | null;
  phoneNumber: string;
  email: string | null;
  accountStatus: string;
  roles: RoleName[];
  canEditAcademicResults: boolean;
  studentRecordId: string | null;
  courseId: string | null;
  programmeId: string | null;
  departmentId: string | null;
  yearOfStudy: number | null;
  lecturerRecordId: string | null;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  apiFetch: <T = unknown>(url: string, options?: RequestInit) => Promise<T>;
  hasAnyRole: (roles: RoleName[]) => boolean;
  primaryDashboardPath: () => string;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Strictly in-memory session storage (never localStorage/sessionStorage per security policy)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
  }, []);

  const apiFetch = useCallback(
    async <T = unknown>(url: string, options: RequestInit = {}): Promise<T> => {
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(url, { ...options, headers });
      const contentType = res.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await res.json() : await res.text();

      if (!res.ok) {
        const message =
          typeof payload === 'object' && payload !== null && 'error' in payload
            ? String((payload as { error: string }).error)
            : `Request failed (${res.status})`;
        throw new Error(message);
      }
      return payload as T;
    },
    [token]
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Ignore network errors on logout cleanup
    } finally {
      setToken(null);
      setUser(null);
    }
  }, [token]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setToken(null);
      setUser(null);
    }
  }, [token, apiFetch]);

  const hasAnyRole = useCallback(
    (roles: RoleName[]) => {
      if (!user) return false;
      return user.roles.some((r) => roles.includes(r));
    },
    [user]
  );

  const primaryDashboardPath = useCallback(() => {
    if (!user) return '/login';
    if (user.roles.includes('PRINCIPAL')) return '/principal/dashboard';
    if (user.roles.includes('BOARD')) return '/board/dashboard';
    if (user.roles.includes('ADMIN')) return '/admin/dashboard';
    if (user.roles.includes('LECTURER')) return '/lecturer/dashboard';
    if (user.roles.includes('CR')) return '/cr/dashboard';
    return '/student/dashboard';
  }, [user]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setToasts([]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: Boolean(token && user),
        login,
        logout,
        refreshUser,
        apiFetch,
        hasAnyRole,
        primaryDashboardPath,
        notify,
      }}
    >
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 no-print"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm ${
                t.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : t.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-white text-[#172B3A]'
              }`}
            >
              <span className="font-medium leading-snug">{t.text}</span>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-xs font-semibold opacity-60 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
