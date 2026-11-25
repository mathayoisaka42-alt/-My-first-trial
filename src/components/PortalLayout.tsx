import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Bell,
  CalendarCheck,
  BookOpen,
  FileText,
  TrendingUp,
  MapPin,
  MessageSquare,
  Megaphone,
  UserCheck,
  Users,
  Layers,
  GraduationCap,
  Shield,
  HardDrive,
  Settings,
  ClipboardList,
  LogOut,
  Menu,
  X,
  Search,
  User,
  CheckCheck,
} from 'lucide-react';
import { useAuth, type RoleName } from '../context/AuthContext';
import { PWAInstallButton } from './PWAWidgets';

interface NavItem {
  label: string;
  path: string;
  icon: React.FC<{ className?: string }>;
  roles: RoleName[];
}

const NAV_ITEMS: NavItem[] = [
  // Student
  { label: 'Overview', path: '/student/dashboard', icon: LayoutDashboard, roles: ['STUDENT', 'CR'] },
  { label: 'Announcements', path: '/student/announcements', icon: Megaphone, roles: ['STUDENT', 'CR'] },
  { label: 'Attendance', path: '/student/attendance', icon: CalendarCheck, roles: ['STUDENT', 'CR'] },
  { label: 'Notes & Materials', path: '/student/notes', icon: BookOpen, roles: ['STUDENT', 'CR'] },
  { label: 'Assignments', path: '/student/assignments', icon: FileText, roles: ['STUDENT', 'CR'] },
  { label: 'Personal Trend', path: '/student/trend', icon: TrendingUp, roles: ['STUDENT', 'CR'] },
  { label: 'Find Venue', path: '/student/find-venue', icon: MapPin, roles: ['STUDENT', 'CR'] },
  { label: 'Feedback', path: '/student/feedback', icon: MessageSquare, roles: ['STUDENT', 'CR'] },
  { label: 'My Profile', path: '/student/profile', icon: User, roles: ['STUDENT', 'CR'] },

  // CR
  { label: 'CR Console', path: '/cr/dashboard', icon: UserCheck, roles: ['CR'] },
  { label: 'CR Announcements', path: '/cr/announcements', icon: Megaphone, roles: ['CR'] },
  { label: 'CR Attendance', path: '/cr/attendance', icon: CalendarCheck, roles: ['CR'] },
  { label: 'Course Management', path: '/cr/course-management', icon: Layers, roles: ['CR'] },

  // Lecturer
  { label: 'Lecturer Overview', path: '/lecturer/dashboard', icon: LayoutDashboard, roles: ['LECTURER'] },
  { label: 'Assigned Modules', path: '/lecturer/modules', icon: BookOpen, roles: ['LECTURER'] },
  { label: 'Class Attendance', path: '/lecturer/attendance', icon: CalendarCheck, roles: ['LECTURER'] },
  { label: 'Assignments', path: '/lecturer/assignments', icon: FileText, roles: ['LECTURER'] },
  { label: 'Course Materials', path: '/lecturer/materials', icon: Layers, roles: ['LECTURER'] },
  { label: 'Marks & Grading', path: '/lecturer/marks', icon: GraduationCap, roles: ['LECTURER'] },
  { label: 'Find & Book Venue', path: '/lecturer/venues', icon: MapPin, roles: ['LECTURER'] },
  { label: 'Student Feedback', path: '/lecturer/feedback', icon: MessageSquare, roles: ['LECTURER'] },

  // Board
  { label: 'Board Overview', path: '/board/dashboard', icon: LayoutDashboard, roles: ['BOARD'] },
  { label: 'Student Oversight', path: '/board/students', icon: Users, roles: ['BOARD'] },
  { label: 'Lecturer Monitoring', path: '/board/lecturers', icon: UserCheck, roles: ['BOARD'] },
  { label: 'Course Analytics', path: '/board/courses', icon: Layers, roles: ['BOARD'] },
  { label: 'Module Analytics', path: '/board/modules', icon: BookOpen, roles: ['BOARD'] },
  { label: 'University Reports', path: '/board/reports', icon: ClipboardList, roles: ['BOARD'] },

  // Principal
  { label: 'Principal Console', path: '/principal/dashboard', icon: LayoutDashboard, roles: ['PRINCIPAL'] },
  { label: 'Users & Approvals', path: '/principal/users', icon: Users, roles: ['PRINCIPAL'] },
  { label: 'Academic Management', path: '/principal/academic-management', icon: Layers, roles: ['PRINCIPAL'] },
  { label: 'Attendance Oversight', path: '/principal/attendance', icon: CalendarCheck, roles: ['PRINCIPAL'] },
  { label: 'Results & GPA Scale', path: '/principal/results', icon: GraduationCap, roles: ['PRINCIPAL'] },
  { label: 'Campus Venues', path: '/principal/venues', icon: MapPin, roles: ['PRINCIPAL'] },
  { label: 'Institutional Reports', path: '/principal/reports', icon: ClipboardList, roles: ['PRINCIPAL'] },
  { label: 'Audit Logs', path: '/principal/audit-logs', icon: Shield, roles: ['PRINCIPAL'] },

  // System Admin
  { label: 'Admin Dashboard', path: '/admin/dashboard', icon: LayoutDashboard, roles: ['ADMIN'] },
  { label: 'System Settings', path: '/admin/settings', icon: Settings, roles: ['ADMIN'] },
  { label: 'Security & RBAC', path: '/admin/security', icon: Shield, roles: ['ADMIN'] },
  { label: 'Storage & Backups', path: '/admin/storage', icon: HardDrive, roles: ['ADMIN'] },
];

interface NotificationItem {
  id: string;
  category: string;
  title: string;
  body: string;
  action_url: string | null;
  is_read: number;
  created_at: string;
}

export const PortalLayout: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => {
  const { user, logout, apiFetch, notify } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!user) return false;
    return item.roles.some((r) => user.roles.includes(r));
  }).filter((item) => {
    if (!searchQuery.trim()) return true;
    return item.label.toLowerCase().includes(searchQuery.trim().toLowerCase());
  });

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Quiet background notification refresh
    }
  }, [apiFetch]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, location.pathname]);

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      await loadNotifications();
      notify('success', 'All notifications marked as read.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to mark notifications read.');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F3F6F9] text-[#172B3A] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#12304A] text-white no-print">
        <div className="flex h-16 items-center justify-between px-5 border-b border-white/10">
          <Link to="/" className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            MUSTISO
          </Link>
          <span className="font-mono text-[11px] text-[#E4B64D]">MUST</span>
        </div>

        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter portal menu..."
              className="w-full rounded-lg border border-white/15 bg-white/10 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-300 focus:border-[#E4B64D] focus:outline-none"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap ${
                  active
                    ? 'bg-[#1C638A] text-white'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-white truncate">{user?.fullName}</p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-300 truncate">
              {user?.registrationNumber || user?.staffId || user?.phoneNumber}
            </p>
            <p className="mt-1 text-[11px] text-[#E4B64D] font-medium">
              {user?.roles.join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 py-2 text-xs font-medium text-white hover:bg-white/10 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative flex w-72 max-w-[85vw] flex-col bg-[#12304A] text-white">
            <div className="flex h-16 items-center justify-between px-5 border-b border-white/10">
              <span className="font-display text-lg font-bold">MUSTISO</span>
              <button type="button" onClick={() => setMobileOpen(false)} className="p-1.5 text-slate-200 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      active ? 'bg-[#1C638A] text-white' : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-white/10 p-4">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 py-2.5 text-xs font-medium text-white hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg border border-slate-200 p-2 text-[#12304A] hover:bg-slate-50"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-[#12304A] truncate">{title}</h1>
              {subtitle && <p className="hidden sm:block text-xs text-slate-500 truncate">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-[#12304A] hover:bg-slate-50 transition"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="ml-1.5 font-mono text-[11px] font-semibold text-[#1C638A] tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-lg z-50">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <span className="text-sm font-semibold text-[#12304A]">Notifications</span>
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#1C638A] hover:underline"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No notifications at this time.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={async () => {
                            if (!n.is_read) {
                              await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
                              loadNotifications();
                            }
                            setNotifOpen(false);
                            if (n.action_url) navigate(n.action_url);
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${
                            n.is_read ? 'opacity-75' : 'bg-[#F3F6F9]/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span className="font-medium text-[#1C638A]">{n.category}</span>
                            <span className="tabular-nums">{n.created_at.slice(0, 16)}</span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-[#12304A]">{n.title}</p>
                          <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{n.body}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
