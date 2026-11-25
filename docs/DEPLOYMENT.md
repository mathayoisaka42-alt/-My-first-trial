# MUSTISO Deployment & Supabase Connection Guide

## 1. Environment Configuration
Copy `.env.example` to `.env` and configure:
- `TZ="Africa/Dar_es_Salaam"`
- `SESSION_SECRET` (optional in dev; set a strong 64-char random hex secret in production)
- `MUSTISO_BOOTSTRAP_PASSCODE` (optional; if unset, complete the one-time First-Run Institutional Setup UI on first visit)

## 2. Connecting External Supabase PostgreSQL (Optional Production Migration)
MUSTISO runs out-of-the-box with its embedded relational SQLite database (`data/mustiso.db`) and local confined file storage (`storage/uploads/`). When deploying against a hosted Supabase project:
1. Create a Supabase project and run `supabase/migrations/0001_mustiso_schema.sql` followed by `supabase/migrations/0002_rls_policies.sql` in the Supabase SQL Editor.
2. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` in your hosting environment.
3. Import verified MUST student, programme, module, and venue records via the Principal Administration Console (`/principal/users`) and replace illustrative venue previews with official campus photographs (`/principal/venues`).

## 3. Build & Run Commands
- Development: `npm run dev` (runs Express + Vite middleware on port 3000)
- Type Check: `npm run lint`
- Production Build: `npm run build`
- Production Start: `NODE_ENV=production npm start`
