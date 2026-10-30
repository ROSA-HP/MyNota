# MyNota

Turn textbook chapters and lecture notes into colorful, editable mind maps you can study from.
The product brief is in [`CLAUDE.md`](./CLAUDE.md) with detailed specs in [`docs/`](./docs).

**Status:** Phase 1 (Foundation) — sign up, sign in, empty library, settings; English (default), Arabic (RTL) and German; light and dark themes.

## Requirements

- Node.js 22+
- pnpm 10+ (`npm i -g pnpm`)

## Run the app

```bash
pnpm install
cp .env.example .env.local   # then fill in the two values
pnpm dev                     # http://localhost:5173
```

`.env.local` needs only **public** values:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never put the Supabase **secret** key (`sb_secret_...`) in this file or anywhere in the frontend.
The app refuses to start if it sees one.

## One-time Supabase setup

### 1. Apply the database migrations

Either with the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

or paste each file from `supabase/migrations/` into **SQL Editor → New query** and run them **in filename order**.

### 2. Auth settings (Dashboard → Authentication)

| Setting                           | Value                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Sign In / Providers → Email       | Enabled, **Confirm email** on, minimum password length **8**                                                               |
| URL Configuration → Site URL      | `http://localhost:5173` (your production URL later)                                                                        |
| URL Configuration → Redirect URLs | `http://localhost:5173/auth/callback`, `http://localhost:5173/reset-password` (+ the same paths on your production domain) |

### 3. Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Sign In / Providers → **Google**: paste the client ID and secret, enable.

## Scripts

| Command                         | What it does                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev`                      | Dev server                                                                              |
| `pnpm build`                    | Type-check and production build (adds a strict CSP)                                     |
| `pnpm typecheck` / `pnpm lint`  | Checks                                                                                  |
| `pnpm test`                     | Unit tests (schemas, translations, preferences)                                         |
| `pnpm db:test && pnpm test:rls` | Row Level Security tests against a throwaway local Postgres — see `tests/rls/README.md` |

## Project layout

```
src/
  app/            router, app shell, route guards
  features/       auth, landing, library, settings
  components/ui/  design-system components
  lib/            supabase client, i18n, preferences, env
  locales/        en (reference), ar, de
  styles/         design tokens (CSS variables) + Tailwind
supabase/migrations/   schema + RLS policies
tests/            unit tests and RLS tests
```

## Security notes (Phase 1)

- Every table has RLS. Users can never change their own `role`, `status` or `two_factor_enabled` (column-level grants).
- `maps.link_token` is not readable through the API by anyone; share-link fields are written only by server functions (Phase 5).
- Suspended users lose read and write access in the database, not only in the UI.
- Production builds ship a strict Content Security Policy; also send it as an HTTP header from your host, with `frame-ancestors 'none'`.
