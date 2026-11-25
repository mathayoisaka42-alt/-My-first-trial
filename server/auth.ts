import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

// Session signing key from environment or ephemeral secure runtime key (never hardcoded)
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export type RoleName = 'STUDENT' | 'CR' | 'LECTURER' | 'BOARD' | 'PRINCIPAL' | 'ADMIN';

export interface AuthenticatedUser {
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

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

export function signSessionToken(profileId: string, tokenVersion: number, ttlMinutes = 480): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: profileId,
      ver: tokenVersion,
      iat: nowSec,
      exp: nowSec + ttlMinutes * 60,
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifySessionToken(token: string): { sub: string; ver: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: string;
      ver: number;
      exp: number;
    };
    if (!decoded.sub || typeof decoded.exp !== 'number') return null;
    if (Math.floor(Date.now() / 1000) > decoded.exp) return null;
    return { sub: decoded.sub, ver: decoded.ver };
  } catch {
    return null;
  }
}

export function loadUserContext(profileId: string): AuthenticatedUser | null {
  const profile = db
    .prepare(
      `SELECT id, full_name, registration_number, staff_id, phone_number, email, account_status, can_edit_academic_results
       FROM profiles WHERE id = ?`
    )
    .get(profileId) as
    | {
        id: string;
        full_name: string;
        registration_number: string | null;
        staff_id: string | null;
        phone_number: string;
        email: string | null;
        account_status: string;
        can_edit_academic_results: number;
      }
    | undefined;

  if (!profile) return null;

  const roleRows = db
    .prepare('SELECT role FROM user_roles WHERE profile_id = ?')
    .all(profileId) as { role: RoleName }[];
  const roles = roleRows.map((r) => r.role);

  const studentRec = db
    .prepare('SELECT id, course_id, programme_id, department_id, year_of_study FROM student_records WHERE profile_id = ?')
    .get(profileId) as
    | { id: string; course_id: string; programme_id: string; department_id: string; year_of_study: number }
    | undefined;

  const lecturerRec = db
    .prepare('SELECT id, department_id FROM lecturer_records WHERE profile_id = ?')
    .get(profileId) as { id: string; department_id: string } | undefined;

  return {
    id: profile.id,
    fullName: profile.full_name,
    registrationNumber: profile.registration_number,
    staffId: profile.staff_id,
    phoneNumber: profile.phone_number,
    email: profile.email,
    accountStatus: profile.account_status,
    roles,
    canEditAcademicResults: profile.can_edit_academic_results === 1,
    studentRecordId: studentRec?.id ?? null,
    courseId: studentRec?.course_id ?? null,
    programmeId: studentRec?.programme_id ?? null,
    departmentId: studentRec?.department_id ?? lecturerRec?.department_id ?? null,
    yearOfStudy: studentRec?.year_of_study ?? null,
    lecturerRecordId: lecturerRec?.id ?? null,
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const parsed = verifySessionToken(token);
  if (!parsed) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  const versionRow = db
    .prepare('SELECT token_version, account_status FROM profiles WHERE id = ?')
    .get(parsed.sub) as { token_version: number; account_status: string } | undefined;
  if (!versionRow || versionRow.token_version !== parsed.ver) {
    res.status(401).json({ error: 'Session has been invalidated. Please sign in again.' });
    return;
  }

  if (versionRow.account_status !== 'APPROVED') {
    res.status(403).json({
      error:
        versionRow.account_status === 'PENDING'
          ? 'Your account is pending institutional verification and approval.'
          : 'Your account is not active for portal access.',
    });
    return;
  }

  const user = loadUserContext(parsed.sub);
  if (!user) {
    res.status(401).json({ error: 'User profile not found.' });
    return;
  }

  req.user = user;
  next();
}

export function requireRoles(...allowedRoles: RoleName[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const hasMatch = req.user.roles.some((r) => allowedRoles.includes(r));
    if (!hasMatch) {
      res.status(403).json({ error: 'Access denied: insufficient institutional privileges for this action.' });
      return;
    }
    next();
  };
}

// Simple in-memory rate limiter for sensitive endpoints (login, registration, code check-in)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait briefly before retrying.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}

// Haversine distance in meters between two WGS-84 coordinates
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Format date/time in Africa/Dar_es_Salaam
export function darEsSalaamToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
