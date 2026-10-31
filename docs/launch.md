# Launch checklist

What must be done before MyNota opens to students (Phase 7 "done when: ready for public
students"). Code is finished for each item unless it says otherwise; most steps need someone with
access to the Supabase project or the hosting account.

## 1. Database and Supabase settings

- [ ] Apply the missing migrations in order (`docs/migrations.md`; check with
      `supabase/check_migrations.sql`): 11 live documents, 12 admin, 13 limits and sign-ins,
      14 error reports.
- [ ] Realtime › Settings: turn off "Allow public access" (after migration 11).
- [ ] Authentication › Hooks › Password verification attempt → `public.hook_password_attempt`.
- [ ] Authentication: access token (JWT) expiry 900 seconds (removed members stop receiving live
      changes sooner).
- [ ] Authentication › Multi-factor: TOTP enabled (on by default in Supabase).
- [ ] Backups: daily backups on; point-in-time recovery if the plan allows (docs/security.md ›
      Regular backups).

## 2. Edge Functions

- [ ] `npx supabase secrets set IP_HASH_SALT=<long random string> APP_ORIGIN=<app address>`
- [ ] `npx supabase functions deploy log-signin`
- [ ] `npx supabase functions deploy delete-account`

## 3. Admins

- [ ] Make the first admin (SQL Editor; only the database can do this):
      `update public.profiles set role = 'admin' where username = '<username>';`
- [ ] That person turns on two-factor sign-in (Settings › Security), signs out and in with the
      code, and checks every page under `/admin`.
- [ ] Try the System page: change a limit (with a reason) and see it in the Audit log.

## 4. Hosting (open question: Vercel, Netlify or Cloudflare Pages)

- [ ] Choose the host (docs/open-questions.md).
- [ ] Environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (never the secret key).
- [ ] Send the Content Security Policy as a header too, plus `frame-ancestors 'none'` (the build
      already puts the policy in a meta tag; see `vite.config.ts`).
- [ ] Single-page app fallback: every path serves `index.html`.
- [ ] Supabase › Authentication › URL configuration: the production address and
      `/auth/callback` as redirect URLs; Google sign-in with the production origin.

## 5. Legal

- [ ] Have `/privacy` and `/terms` reviewed (they are drafts written for an EU audience; they
      say admins can view map content, as docs/security.md requires).
- [ ] Set `LEGAL_CONTACT` in `src/features/legal/LegalPage.tsx` (operator name and email) and
      update `LEGAL_UPDATED`.

## 6. AI quality

- [ ] Add real chapters to `tests/prompt-set/samples/` until there are about 10 across subjects
      and all three languages (4 original samples are there now: en, de, ar, messy notes).
- [ ] Run the test set for each model worth recommending, with your own keys:
      `MYNOTA_EVAL_PROVIDER=gemini MYNOTA_EVAL_MODEL=<model> MYNOTA_EVAL_KEY=<key> npm run eval:prompts`
      (results in `tests/prompt-set/results/`; keys are never written).
- [ ] Do the manual checks for the best runs (a teacher agrees with the outline; sources point at
      the right paragraphs).
- [ ] Put the chosen models into `src/ai/recommended.ts` (Settings shows them per provider).

## 7. Live editing (Phase 6)

- [ ] With migration 11 applied: two people on one map in two browsers: edits appear for both,
      cursors and "… is editing" show, Ctrl+Z undoes only one's own changes, offline edits arrive
      after reconnecting, a large book loads chapters as they come on screen.
- [ ] Merge `phase-7` (which contains Phase 6) into `main` after those checks.

## 8. Last look

- [ ] Every screen in English, German and Arabic (RTL), light and dark, desktop and tablet.
- [ ] Admin › Errors is empty or explained after a day of testing.
- [ ] Download my data and Delete my account with a test account.
