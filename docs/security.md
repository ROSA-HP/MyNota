# Security

Permissions are enforced in the database, not the UI, and the user's API key never leaves their device except to go to their AI provider.

## Authentication

- Supabase Auth: Google sign-in and email with verification.
- 2FA optional for students, **required for admins**.
- Session expiry; users can view active devices and log them out.
- Record every attempt in `login_events`.

## Authorization

- RLS on every table, created in the same migration as the table.
- Read only what you own or what is shared with you; write only as owner or editor.
- Admin role checked in the database and Edge Functions, never only by hiding UI.
- Share-link access resolved by an Edge Function that validates token, access level, and expiry.
- Write tests for RLS policies.

## API keys

- Stored only on the device (IndexedDB), never in Supabase, logs, analytics, or error reports.
- "Don't remember my key" option: keep it in memory only, cleared when the tab closes.
- Strict Content Security Policy; no third-party scripts on app pages.
- Error tracking must scrub keys and map content.

## Untrusted content

- AI output: validated with Zod, sanitized, rendered as a safe Markdown subset. Never `dangerouslySetInnerHTML` with model output.
- Links in content are checked before rendering.
- Prompts tell the model to ignore instructions inside source text.

## Uploads

- Allowed types: PDF, images (PNG, JPEG, WebP), plain text.
- Size limits per file and per-user storage quota.
- Original files stay on the device (IndexedDB) and are parsed in the browser (pdf.js, Tesseract). Only extracted text and page numbers reach Postgres (decided 2026-10-30). If Storage is ever used: private buckets and short-lived signed URLs.

## Rate limiting

Edge Functions with a `rate_limits` counters table, plus Supabase's built-in auth limits.

| What | Why |
|---|---|
| Sign-in and sign-up attempts | Brute force |
| Share-link creation and reset | Spam |
| Invites sent | Spam |
| Public link views | Scraping |
| Uploads (size, type, count) and storage quota | Abuse and cost |
| Map and node creation | Abuse |
| AI calls (client-side queue + backoff) | Protect the user's key from provider bans |

## Abuse and moderation

- Report button on shared maps.
- Admins can take down links and suspend users.
- Every admin action and every admin view of map content goes to `audit_log`.

## Privacy and data rights

- Privacy policy and terms must state clearly that admins can view map content.
- Data export (all maps, cards, progress).
- Account deletion.
- Regular backups.
- Many users may be in the EU, so treat privacy law as a requirement.
