import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RoleGuard } from './components/RoleGuard';
import { OfflineIndicator } from './components/PWAWidgets';

// Public Pages
import {
  LandingPage,
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  RegistrationStatusPage,
} from './pages/public/PublicPages';

// Student Pages
import { StudentDashboardPage, StudentProfilePage } from './pages/student/StudentDashboard';
import { StudentAttendancePage } from './pages/student/StudentAttendancePage';
import { PersonalTrendPage } from './pages/student/PersonalTrendPage';

// Shared Feature Pages
import { AnnouncementsPage } from './pages/shared/AnnouncementsPage';
import { NotesLibraryPage } from './pages/shared/NotesLibraryPage';
import { AssignmentsPage } from './pages/shared/AssignmentsPage';
import { FindVenuePage } from './pages/shared/FindVenuePage';
import { FeedbackPage } from './pages/shared/FeedbackPage';

// CR Pages
import { CrDashboardPage, CrAttendancePage, CrCourseManagementPage } from './pages/cr/CrPages';

// Lecturer Pages
import {
  LecturerDashboardPage,
  LecturerModulesPage,
  LecturerAttendancePage,
  LecturerMarksPage,
} from './pages/lecturer/LecturerPages';

// Board & Principal Pages
import {
  InstitutionalDashboardPage,
  PrincipalUsersPage,
  PrincipalAcademicManagementPage,
  PrincipalResultsAndScalePage,
  InstitutionalAttendancePage,
  InstitutionalReportsPage,
  AuditLogsPage,
} from './pages/executive/BoardAndPrincipalPages';

// Admin Pages
import {
  AdminDashboardPage,
  AdminSettingsPage,
  AdminSecurityPage,
  AdminStoragePage,
} from './pages/admin/AdminPages';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* PUBLIC ROUTES */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/registration-status" element={<RegistrationStatusPage />} />

          {/* STUDENT ROUTES */}
          <Route path="/student/dashboard" element={<RoleGuard allowedRoles={['STUDENT', 'CR']}><StudentDashboardPage /></RoleGuard>} />
          <Route path="/student/profile" element={<RoleGuard allowedRoles={['STUDENT', 'CR', 'LECTURER', 'BOARD', 'PRINCIPAL', 'ADMIN']}><StudentProfilePage /></RoleGuard>} />
          <Route path="/student/announcements" element={<RoleGuard allowedRoles={['STUDENT', 'CR']}><AnnouncementsPage /></RoleGuard>} />
          <Route path="/student/attendance" element={<RoleGuard allowedRoles={['STUDENT', 'CR']}><StudentAttendancePage /></RoleGuard>} />
          <Route path="/student/notes" element={<RoleGuard allowedRoles={['STUDENT', 'CR']}><NotesLibraryPage /></RoleGuard>} />
          <Route path="/student/assignments" element={<RoleGuard allowedRoles={['STUDENT', 'CR']}><AssignmentsPage /></RoleGuard>} />
          <Route path="/student/trend" element={<RoleGuard allowedRoles={['STUDENT', 'CR']}><PersonalTrendPage /></RoleGuard>} />
          <Route path="/student/find-venue" element={<RoleGuard allowedRoles={['STUDENT', 'CR']}><FindVenuePage /></RoleGuard>} />
          <Route path="/student/feedback" element={<RoleGuard allowedRoles={['STUDENT', 'CR']}><FeedbackPage /></RoleGuard>} />

          {/* CR ROUTES */}
          <Route path="/cr/dashboard" element={<RoleGuard allowedRoles={['CR', 'PRINCIPAL']}><CrDashboardPage /></RoleGuard>} />
          <Route path="/cr/announcements" element={<RoleGuard allowedRoles={['CR', 'PRINCIPAL']}><AnnouncementsPage forcePublisherMode /></RoleGuard>} />
          <Route path="/cr/attendance" element={<RoleGuard allowedRoles={['CR', 'PRINCIPAL']}><CrAttendancePage /></RoleGuard>} />
          <Route path="/cr/course-management" element={<RoleGuard allowedRoles={['CR', 'PRINCIPAL']}><CrCourseManagementPage /></RoleGuard>} />

          {/* LECTURER ROUTES */}
          <Route path="/lecturer/dashboard" element={<RoleGuard allowedRoles={['LECTURER', 'PRINCIPAL']}><LecturerDashboardPage /></RoleGuard>} />
          <Route path="/lecturer/modules" element={<RoleGuard allowedRoles={['LECTURER', 'PRINCIPAL']}><LecturerModulesPage /></RoleGuard>} />
          <Route path="/lecturer/attendance" element={<RoleGuard allowedRoles={['LECTURER', 'PRINCIPAL']}><LecturerAttendancePage /></RoleGuard>} />
          <Route path="/lecturer/assignments" element={<RoleGuard allowedRoles={['LECTURER', 'PRINCIPAL']}><AssignmentsPage /></RoleGuard>} />
          <Route path="/lecturer/materials" element={<RoleGuard allowedRoles={['LECTURER', 'PRINCIPAL']}><NotesLibraryPage /></RoleGuard>} />
          <Route path="/lecturer/marks" element={<RoleGuard allowedRoles={['LECTURER', 'PRINCIPAL']}><LecturerMarksPage /></RoleGuard>} />
          <Route path="/lecturer/venues" element={<RoleGuard allowedRoles={['LECTURER', 'PRINCIPAL']}><FindVenuePage /></RoleGuard>} />
          <Route path="/lecturer/feedback" element={<RoleGuard allowedRoles={['LECTURER', 'PRINCIPAL']}><FeedbackPage /></RoleGuard>} />

          {/* BOARD ROUTES */}
          <Route path="/board/dashboard" element={<RoleGuard allowedRoles={['BOARD', 'PRINCIPAL']}><InstitutionalDashboardPage roleLabel="University Board" /></RoleGuard>} />
          <Route path="/board/students" element={<RoleGuard allowedRoles={['BOARD', 'PRINCIPAL']}><InstitutionalReportsPage title="Board Student Oversight" /></RoleGuard>} />
          <Route path="/board/lecturers" element={<RoleGuard allowedRoles={['BOARD', 'PRINCIPAL']}><InstitutionalAttendancePage /></RoleGuard>} />
          <Route path="/board/courses" element={<RoleGuard allowedRoles={['BOARD', 'PRINCIPAL']}><InstitutionalReportsPage title="Course Performance Analytics" /></RoleGuard>} />
          <Route path="/board/modules" element={<RoleGuard allowedRoles={['BOARD', 'PRINCIPAL']}><InstitutionalReportsPage title="Module Performance Analytics" /></RoleGuard>} />
          <Route path="/board/reports" element={<RoleGuard allowedRoles={['BOARD', 'PRINCIPAL']}><InstitutionalReportsPage title="University Board Reports" /></RoleGuard>} />

          {/* PRINCIPAL ROUTES */}
          <Route path="/principal/dashboard" element={<RoleGuard allowedRoles={['PRINCIPAL']}><InstitutionalDashboardPage roleLabel="Principal" /></RoleGuard>} />
          <Route path="/principal/users" element={<RoleGuard allowedRoles={['PRINCIPAL', 'ADMIN']}><PrincipalUsersPage /></RoleGuard>} />
          <Route path="/principal/academic-management" element={<RoleGuard allowedRoles={['PRINCIPAL', 'BOARD']}><PrincipalAcademicManagementPage /></RoleGuard>} />
          <Route path="/principal/attendance" element={<RoleGuard allowedRoles={['PRINCIPAL', 'BOARD']}><InstitutionalAttendancePage /></RoleGuard>} />
          <Route path="/principal/results" element={<RoleGuard allowedRoles={['PRINCIPAL', 'BOARD']}><PrincipalResultsAndScalePage /></RoleGuard>} />
          <Route path="/principal/venues" element={<RoleGuard allowedRoles={['PRINCIPAL', 'ADMIN']}><FindVenuePage /></RoleGuard>} />
          <Route path="/principal/reports" element={<RoleGuard allowedRoles={['PRINCIPAL', 'BOARD']}><InstitutionalReportsPage title="Principal Institutional Reports" /></RoleGuard>} />
          <Route path="/principal/audit-logs" element={<RoleGuard allowedRoles={['PRINCIPAL', 'BOARD', 'ADMIN']}><AuditLogsPage /></RoleGuard>} />

          {/* SYSTEM ADMIN ROUTES */}
          <Route path="/admin/dashboard" element={<RoleGuard allowedRoles={['ADMIN', 'PRINCIPAL']}><AdminDashboardPage /></RoleGuard>} />
          <Route path="/admin/settings" element={<RoleGuard allowedRoles={['ADMIN', 'PRINCIPAL']}><AdminSettingsPage /></RoleGuard>} />
          <Route path="/admin/security" element={<RoleGuard allowedRoles={['ADMIN', 'PRINCIPAL']}><AdminSecurityPage /></RoleGuard>} />
          <Route path="/admin/storage" element={<RoleGuard allowedRoles={['ADMIN', 'PRINCIPAL']}><AdminStoragePage /></RoleGuard>} />

          {/* FALLBACK */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <OfflineIndicator />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
