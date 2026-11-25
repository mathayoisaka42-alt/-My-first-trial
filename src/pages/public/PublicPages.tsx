import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Building2,
  BookOpen,
  ShieldCheck,
  MapPin,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  KeyRound,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../../components/PWAWidgets';

interface PublicOverview {
  institution: string;
  systemName: string;
  timezone: string;
  bootstrapped: boolean;
  counts: {
    departments: number;
    programmes: number;
    courses: number;
    venues: number;
    totalVenueCapacity: number;
  };
  departments: { id: string; code: string; name: string; description: string }[];
  programmes: { id: string; department_id: string; code: string; name: string; level: string; duration_years: number }[];
  courses: { id: string; programme_id: string; department_id: string; code: string; name: string }[];
  academicYears: { id: string; label: string; is_current: number }[];
}

const PublicHeader: React.FC = () => (
  <header className="border-b border-slate-200 bg-white">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 h-16">
      <Link to="/" className="font-display text-lg font-bold tracking-tight text-[#12304A] whitespace-nowrap shrink-0">
        MUSTISO
      </Link>

      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
        <a href="#academic-structure" className="hover:text-[#12304A] transition whitespace-nowrap shrink-0">
          Academics
        </a>
        <a href="#campus-systems" className="hover:text-[#12304A] transition whitespace-nowrap shrink-0">
          Modules
        </a>
        <Link to="/registration-status" className="hover:text-[#12304A] transition whitespace-nowrap shrink-0">
          Registration Status
        </Link>
        <Link to="/register" className="hover:text-[#12304A] transition whitespace-nowrap shrink-0">
          Student Registration
        </Link>
      </nav>

      <div className="flex items-center gap-3 shrink-0">
        <PWAInstallButton />
        <Link
          to="/login"
          className="inline-flex items-center justify-center rounded-lg bg-[#12304A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1C638A] transition whitespace-nowrap shrink-0"
        >
          Sign In
        </Link>
      </div>
    </div>
  </header>
);

const bootstrapSchema = z.object({
  principalName: z.string().min(3, 'Enter the Principal or Institutional Lead full name'),
  principalPhone: z.string().min(9, 'Enter a valid phone number'),
  principalEmail: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  seedSampleAccounts: z.boolean(),
});

type BootstrapFormValues = z.infer<typeof bootstrapSchema>;

const FirstRunBootstrapCard: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const { login, notify } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BootstrapFormValues>({
    resolver: zodResolver(bootstrapSchema),
    defaultValues: {
      principalName: 'Prof. Institutional Principal',
      principalPhone: '+255700000001',
      principalEmail: 'principal@mustiso.example.ac.tz',
      password: '',
      seedSampleAccounts: true,
    },
  });

  const onSubmit = async (values: BootstrapFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/public/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Initialization failed.');
      login(data.token, data.user);
      notify('success', 'MUSTISO institutional accounts initialized. Signed in as Principal.');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete setup.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#E4B64D] bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#12304A] text-[#E4B64D]">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-[#12304A]">First-Run Institutional Setup Required</h2>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            No Principal or System Administrator password has been claimed yet. Set your initial administrative password once to unlock MUSTISO.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#172B3A]">Principal Full Name</label>
            <input
              {...register('principalName')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
            />
            {errors.principalName && <p className="mt-1 text-xs text-red-600">{errors.principalName.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-[#172B3A]">Phone Number</label>
            <input
              {...register('principalPhone')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
            />
            {errors.principalPhone && <p className="mt-1 text-xs text-red-600">{errors.principalPhone.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#172B3A]">Institutional Email</label>
            <input
              {...register('principalEmail')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#172B3A]">Choose Initial Password (min 8 chars)</label>
            <input
              type="password"
              {...register('password')}
              placeholder="Enter secure initial password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>
        </div>

        <label className="flex items-start gap-2.5 pt-1 text-xs text-slate-700 cursor-pointer">
          <input type="checkbox" {...register('seedSampleAccounts')} className="mt-0.5 rounded border-slate-300 text-[#12304A]" />
          <span>
            Also provision clearly labelled sample evaluation accounts (Student <code className="font-mono">MUST/BCS/25/001</code>, CR <code className="font-mono">MUST/BCS/25/002</code>, Lecturer <code className="font-mono">MUST-LEC-001</code>, Board <code className="font-mono">MUST-BRD-001</code>, Admin <code className="font-mono">MUST-ADM-001</code>) using this initial password for testing.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[#12304A] py-2.5 text-sm font-medium text-white hover:bg-[#1C638A] disabled:opacity-60 transition"
        >
          {submitting ? 'Initializing Database & Roles...' : 'Complete Institutional Setup & Sign In'}
        </button>
      </form>
    </div>
  );
};

export const LandingPage: React.FC = () => {
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [imgError, setImgError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/public/overview')
      .then((r) => r.json())
      .then(setOverview)
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#F3F6F9] text-[#172B3A] flex flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-white border-b border-slate-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 lg:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-xs font-semibold tracking-wide text-[#1C638A]">
                  Mbeya University of Science and Technology · Tanzania
                </p>
                <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#12304A] leading-tight">
                  Unified Academic &amp; Campus Information Portal
                </h1>
                <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-xl">
                  MUSTISO connects Students, Course Representatives, Lecturers, the University Board, the Principal, and System Administrators in one role-governed academic environment.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#12304A] px-5 py-3 text-sm font-medium text-white hover:bg-[#1C638A] transition"
                  >
                    Access Portal
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-[#12304A] hover:bg-slate-50 transition"
                  >
                    Student Registration
                  </Link>
                </div>

                <div className="mt-6 flex items-center gap-3 text-xs text-slate-500">
                  <span>Timezone: Africa/Dar_es_Salaam</span>
                  <span aria-hidden="true">·</span>
                  <span>Role-Based Access Control</span>
                  <span aria-hidden="true">·</span>
                  <span>GPS Attendance &amp; Venue Discovery</span>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="h-full min-h-[280px] overflow-hidden rounded-xl border border-slate-200 bg-[#12304A] relative">
                  {!imgError ? (
                    <img
                      src="/src/assets/images/must_campus_hero_1795634539385.jpg"
                      alt="Illustrative university science and technology campus architecture"
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-white">
                      <Building2 className="h-10 w-10 text-[#E4B64D]" />
                      <p className="mt-3 text-sm font-medium">MUSTISO Campus Portal</p>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
                    <p className="text-xs text-white/90">
                      Illustrative campus visual preview · Official MUST photography managed via Administration
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4-column Institutional KPI Strip */}
            <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4 border-t border-slate-200 pt-8">
              <div>
                <p className="text-xs text-slate-500">Academic Departments</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-[#12304A] tabular-nums">
                  {overview?.counts.departments ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Registered Programmes</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-[#12304A] tabular-nums">
                  {overview?.counts.programmes ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Campus Venues Indexed</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-[#12304A] tabular-nums">
                  {overview?.counts.venues ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Active Academic Year</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-[#1C638A] tabular-nums">
                  {overview?.academicYears.find((y) => y.is_current)?.label ?? '2026/2027'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* First-Run Bootstrap Banner if uninitialized */}
        {overview && !overview.bootstrapped && (
          <section className="mx-auto max-w-3xl px-4 sm:px-6 pt-10">
            <FirstRunBootstrapCard onSuccess={() => navigate('/principal/dashboard')} />
          </section>
        )}

        {/* Core Modules */}
        <section id="campus-systems" className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-[#12304A]">Core Institutional Modules</h2>
            <p className="mt-2 text-sm text-slate-600">
              Every module enforces server-side role authorization, audit logging, and relational integrity.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <ShieldCheck className="h-5 w-5 text-[#1C638A]" />
              <h3 className="mt-3 text-base font-semibold text-[#12304A]">60-Second GPS Attendance</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Lecturers issue unique time-bound session codes. Student check-ins validate enrolment, code expiration, and venue GPS radius on the server, alongside CR emergency and late manual verification workflows.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <BookOpen className="h-5 w-5 text-[#1C638A]" />
              <h3 className="mt-3 text-base font-semibold text-[#12304A]">Academic Library &amp; Personal Trend</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Structured notes, slides, assignments, and group discussions paired with a configurable GPA calculation engine for semester, annual, and cumulative progression.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <MapPin className="h-5 w-5 text-[#1C638A]" />
              <h3 className="mt-3 text-base font-semibold text-[#12304A]">FIND VENUE &amp; Availability</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Real-time campus venue discovery powered by actual timetable and booking records with database-level double-booking conflict prevention.
              </p>
            </div>
          </div>
        </section>

        {/* Academic Structure Preview */}
        {overview && (
          <section id="academic-structure" className="mx-auto max-w-7xl px-4 sm:px-6 pb-14">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#12304A]">Registered Departments &amp; Programmes</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sample academic hierarchy active until verified MUST records are imported by Administration.
                  </p>
                </div>
                <Link to="/register" className="text-xs font-medium text-[#1C638A] hover:underline">
                  Proceed to Student Registration →
                </Link>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Code</th>
                      <th className="py-2.5 pr-4 font-medium">Programme</th>
                      <th className="py-2.5 pr-4 font-medium">Level</th>
                      <th className="py-2.5 font-medium text-right">Duration (Yrs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overview.programmes.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 pr-4 font-mono text-xs font-medium text-[#12304A]">{p.code}</td>
                        <td className="py-3 pr-4 text-slate-800">{p.name}</td>
                        <td className="py-3 pr-4 text-xs text-slate-600">{p.level}</td>
                        <td className="py-3 font-mono text-xs text-right tabular-nums">{p.duration_years}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>MUSTISO · Mbeya University of Science and Technology Information System</span>
          <div className="flex items-center gap-4">
            <Link to="/registration-status" className="hover:text-[#12304A]">Registration Status</Link>
            <Link to="/forgot-password" className="hover:text-[#12304A]">Account Recovery</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

// ============================================================================
// LOGIN PAGE
// ============================================================================
const loginSchema = z.object({
  identifier: z.string().min(3, 'Enter your Registration Number, Phone Number, or Staff ID'),
  password: z.string().min(1, 'Password is required'),
});

export const LoginPage: React.FC = () => {
  const { login, notify } = useAuth();
  const navigate = useNavigate();
  const [bootstrapped, setBootstrapped] = useState<boolean>(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/public/bootstrap-status')
      .then((r) => r.json())
      .then((d) => setBootstrapped(Boolean(d.bootstrapped)))
      .catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setLoading(true);
    setServerError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed.');

      login(data.token, data.user);
      notify('success', `Signed in as ${data.user.fullName}`);

      const roles: string[] = data.user.roles || [];
      if (roles.includes('PRINCIPAL')) navigate('/principal/dashboard');
      else if (roles.includes('BOARD')) navigate('/board/dashboard');
      else if (roles.includes('ADMIN')) navigate('/admin/dashboard');
      else if (roles.includes('LECTURER')) navigate('/lecturer/dashboard');
      else if (roles.includes('CR')) navigate('/cr/dashboard');
      else navigate('/student/dashboard');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6F9] flex flex-col">
      <PublicHeader />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg space-y-6">
          {!bootstrapped && <FirstRunBootstrapCard onSuccess={() => navigate('/principal/dashboard')} />}

          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <h1 className="text-2xl font-bold text-[#12304A]">Sign in to MUSTISO</h1>
            <p className="mt-1 text-sm text-slate-600">
              Use your MUST Registration Number, Phone Number, or Staff ID.
            </p>

            {serverError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#172B3A]">
                  Registration Number / Phone Number / Staff ID
                </label>
                <input
                  {...register('identifier')}
                  placeholder="e.g. MUST/BCS/25/001 or +255700000001"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#1C638A] focus:outline-none"
                />
                {errors.identifier && <p className="mt-1 text-xs text-red-600">{errors.identifier.message}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-[#172B3A]">Password</label>
                  <Link to="/forgot-password" className="text-xs font-medium text-[#1C638A] hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  {...register('password')}
                  placeholder="Enter your password"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#1C638A] focus:outline-none"
                />
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#12304A] py-2.5 text-sm font-medium text-white hover:bg-[#1C638A] disabled:opacity-60 transition"
              >
                {loading ? 'Verifying Credentials...' : 'Sign In'}
              </button>
            </form>

            {bootstrapped && (
              <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-600 space-y-1">
                <p className="font-medium text-[#12304A]">Sample Evaluation Identifiers (if seeded during setup):</p>
                <p className="font-mono text-[11px]">
                  Principal: MUST-PRIN-001 · Admin: MUST-ADM-001 · Board: MUST-BRD-001 · Lecturer: MUST-LEC-001 · CR: MUST/BCS/25/002 · Student: MUST/BCS/25/001
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-600">
              <span>New MUST student?</span>
              <Link to="/register" className="font-medium text-[#1C638A] hover:underline">
                Create Student Account →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// STUDENT REGISTRATION PAGE (ALL 12 REQUIRED FIELDS)
// ============================================================================
const registerSchema = z
  .object({
    registrationNumber: z.string().min(5, 'Registration Number is required (e.g. MUST/BCS/25/010)'),
    fullName: z.string().min(3, 'Full name is required'),
    phoneNumber: z.string().min(9, 'Valid phone number is required'),
    email: z.string().email('Invalid email format').optional().or(z.literal('')),
    departmentId: z.string().min(1, 'Select your department'),
    programmeId: z.string().min(1, 'Select your programme'),
    courseId: z.string().min(1, 'Select your course'),
    yearOfStudy: z.number().int().min(1).max(6),
    academicYearId: z.string().min(1, 'Select academic year'),
    password: z.string().min(8, 'Minimum 8 characters required'),
    confirmPassword: z.string().min(8, 'Confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const RegisterPage: React.FC = () => {
  const { notify } = useAuth();
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submittedRegNo, setSubmittedRegNo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { yearOfStudy: 1 },
  });

  useEffect(() => {
    fetch('/api/public/overview')
      .then((r) => r.json())
      .then(setOverview)
      .catch(() => {});
  }, []);

  const selectedDept = watch('departmentId');
  const selectedProg = watch('programmeId');

  const filteredProgs = overview?.programmes.filter((p) => !selectedDept || p.department_id === selectedDept) ?? [];
  const filteredCourses = overview?.courses.filter((c) => !selectedProg || c.programme_id === selectedProg) ?? [];

  const onSubmit = async (values: z.infer<typeof registerSchema>) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      Object.entries(values).forEach(([k, v]) => {
        if (v !== undefined && v !== null) formData.append(k, String(v));
      });
      if (photoFile) {
        formData.append('profilePicture', photoFile);
      }
      const res = await fetch('/api/auth/register', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed.');
      setSubmittedRegNo(data.registrationNumber);
      notify('success', 'Registration submitted for institutional verification.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6F9] flex flex-col">
      <PublicHeader />
      <div className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 py-10">
        {submittedRegNo ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h1 className="mt-4 text-xl font-bold text-[#12304A]">Registration Submitted (Status: PENDING)</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your registration for <span className="font-mono font-semibold text-[#12304A]">{submittedRegNo}</span> is awaiting verification against MUST student records by an authorized administrator.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                to={`/registration-status?reg=${encodeURIComponent(submittedRegNo)}`}
                className="rounded-lg bg-[#12304A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1C638A]"
              >
                Track Approval Status
              </Link>
              <Link to="/login" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-[#12304A]">
                Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
            <h1 className="text-2xl font-bold text-[#12304A]">Student Account Registration</h1>
            <p className="mt-1 text-sm text-slate-600">
              Complete all institutional fields. Accounts remain PENDING until verified and approved.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">{error}</div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">1. Registration Number *</label>
                  <input
                    {...register('registrationNumber')}
                    placeholder="e.g. MUST/BCS/25/019"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-[#1C638A] focus:outline-none"
                  />
                  {errors.registrationNumber && <p className="mt-1 text-xs text-red-600">{errors.registrationNumber.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">2. Full Name *</label>
                  <input
                    {...register('fullName')}
                    placeholder="Full legal name"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  />
                  {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">3. Phone Number *</label>
                  <input
                    {...register('phoneNumber')}
                    placeholder="+2557XXXXXXXX"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  />
                  {errors.phoneNumber && <p className="mt-1 text-xs text-red-600">{errors.phoneNumber.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">4. Email Address (if available)</label>
                  <input
                    type="email"
                    {...register('email')}
                    placeholder="student@example.ac.tz"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">5. Department *</label>
                  <select
                    {...register('departmentId')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  >
                    <option value="">Select Department</option>
                    {overview?.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </select>
                  {errors.departmentId && <p className="mt-1 text-xs text-red-600">{errors.departmentId.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">6. Programme *</label>
                  <select
                    {...register('programmeId')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  >
                    <option value="">Select Programme</option>
                    {filteredProgs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                  {errors.programmeId && <p className="mt-1 text-xs text-red-600">{errors.programmeId.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">7. Course *</label>
                  <select
                    {...register('courseId')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  >
                    <option value="">Select Course</option>
                    {filteredCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                  {errors.courseId && <p className="mt-1 text-xs text-red-600">{errors.courseId.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#172B3A]">8. Year of Study *</label>
                    <select
                      {...register('yearOfStudy', { valueAsNumber: true })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5].map((y) => (
                        <option key={y} value={y}>
                          Year {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#172B3A]">9. Academic Year *</label>
                    <select
                      {...register('academicYearId')}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                    >
                      <option value="">Select</option>
                      {overview?.academicYears.map((ay) => (
                        <option key={ay.id} value={ay.id}>
                          {ay.label}
                        </option>
                      ))}
                    </select>
                    {errors.academicYearId && <p className="mt-1 text-xs text-red-600">{errors.academicYearId.message}</p>}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172B3A]">10. Profile Picture (JPEG / PNG)</label>
                <label className="mt-1.5 flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-600 cursor-pointer hover:bg-slate-50">
                  <Upload className="h-4 w-4 text-[#1C638A]" />
                  <span>{photoFile ? photoFile.name : 'Choose a clear identification photo (max 3 MB)'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">11. Password *</label>
                  <input
                    type="password"
                    {...register('password')}
                    placeholder="Minimum 8 characters"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  />
                  {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172B3A]">12. Confirm Password *</label>
                  <input
                    type="password"
                    {...register('confirmPassword')}
                    placeholder="Re-enter password"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1C638A] focus:outline-none"
                  />
                  {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#12304A] py-2.5 text-sm font-medium text-white hover:bg-[#1C638A] disabled:opacity-60 transition"
              >
                {loading ? 'Submitting Registration...' : 'Submit Student Registration'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// REGISTRATION STATUS & FORGOT PASSWORD
// ============================================================================
export const RegistrationStatusPage: React.FC = () => {
  const [regNo, setRegNo] = useState('');
  const [result, setResult] = useState<{
    registrationNumber: string;
    fullName: string;
    status: string;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/auth/registration-status?registrationNumber=${encodeURIComponent(regNo.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Record not found.');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6F9] flex flex-col">
      <PublicHeader />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-xl font-bold text-[#12304A]">Registration Approval Status</h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter your MUST Registration Number to inspect verification progress.
          </p>

          <form onSubmit={handleLookup} className="mt-5 flex gap-2">
            <input
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="MUST/BCS/25/003"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-[#1C638A] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !regNo.trim()}
              className="rounded-lg bg-[#12304A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1C638A] disabled:opacity-60"
            >
              {loading ? '...' : 'Check'}
            </button>
          </form>

          {error && <p className="mt-4 text-xs text-red-700">{error}</p>}

          {result && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-[#F3F6F9] p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-[#12304A]">{result.registrationNumber}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  {result.status === 'APPROVED' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : result.status === 'REJECTED' ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-600" />
                  )}
                  {result.status}
                </span>
              </div>
              <p className="text-xs text-slate-700">Applicant: {result.fullName}</p>
              <p className="text-xs text-slate-500">Submitted: {result.submittedAt}</p>
              {result.rejectionReason && <p className="text-xs text-red-700">Note: {result.rejectionReason}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ForgotPasswordPage: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      setMessage(data.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6F9] flex flex-col">
      <PublicHeader />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-xl font-bold text-[#12304A]">Account &amp; Password Recovery</h1>
          <p className="mt-1 text-sm text-slate-600">
            Submit your Registration Number, Phone Number, or Staff ID to initiate verified institutional recovery.
          </p>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Registration Number, Phone, or Staff ID"
              required
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-[#1C638A] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#12304A] py-2.5 text-sm font-medium text-white hover:bg-[#1C638A]"
            >
              {loading ? 'Submitting Request...' : 'Request Password Recovery'}
            </button>
          </form>
          {message && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
