import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth, type RoleName } from '../context/AuthContext';

interface RoleGuardProps {
  allowedRoles: RoleName[];
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { isAuthenticated, hasAnyRole, primaryDashboardPath } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasAnyRole(allowedRoles)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F6F9] p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-[#12304A]">Access Restricted</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your current institutional role does not permit access to this route. Every access attempt is governed by backend role authorization.
          </p>
          <Link
            to={primaryDashboardPath()}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#12304A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1C638A] transition"
          >
            Return to Authorized Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
