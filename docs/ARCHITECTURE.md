# MUSTISO System Architecture

## Overview
MUSTISO (Mbeya University of Science and Technology Information System) is a full-stack, role-governed university management platform built with React, TypeScript, Tailwind CSS, Express, and a normalized 34-table relational database schema.

## Core Modules & Data Flow
1. **Authentication & RBAC (`server/auth.ts`, `src/context/AuthContext.tsx`)**:
   - Passwords are hashed server-side using `crypto.scryptSync` with 16-byte per-user salts and verified via `crypto.timingSafeEqual`.
   - Sessions use HMAC-SHA256 signed Bearer tokens held strictly in React memory (never persisted in `localStorage` or `sessionStorage`).
   - Six institutional roles (`STUDENT`, `CR`, `LECTURER`, `BOARD`, `PRINCIPAL`, `ADMIN`) are enforced by Express middleware (`requireAuth`, `requireRoles`) on every endpoint and mirrored in PostgreSQL RLS (`supabase/migrations/0002_rls_policies.sql`).
2. **60-Second GPS Attendance Engine (`server/routes/academicRoutes.ts`)**:
   - Lecturers and authorized CRs (emergency mode) generate random 6-digit codes with a server-enforced 60-second expiration (`code_expires_at`).
   - Student check-in captures device GPS (`latitude`, `longitude`, `accuracy`) and validates enrolment, duplicate prevention, code expiration, and Haversine distance against the venue coordinates and configured radius (`attendance_gps_radius_meters`).
3. **Personal Trend & Configurable GPA Engine (`server/gpa.ts`)**:
   - Computes weighted module scores from released assessments, resolves grades against the active `grading_scales` table (configurable by Principal/Board), and aggregates Semester, Annual, and Cumulative GPA snapshots.
4. **FIND VENUE & Double-Booking Prevention (`server/routes/venueAndAdminRoutes.ts`)**:
   - Computes live `FREE` / `OCCUPIED` availability dynamically from `venue_bookings` records for the requested date and time window.
   - Booking mutations run inside `BEGIN IMMEDIATE` database transactions (and PostgreSQL `BEFORE INSERT OR UPDATE` triggers in Supabase) to prevent overlapping approved reservations.
5. **Confined File Storage (`server/storage.ts`)**:
   - Uploaded avatars, venue photos, learning materials, and assignments are stored under `storage/uploads/{category}` using UUID filenames, MIME validation, and `path.resolve` containment checks.
