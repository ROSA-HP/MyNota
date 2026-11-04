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
- Share-link access resolved by a `SECURITY DEFINER` Postgres function (`link_open`, `share_link_map`) that validates token, access level, expiry and that the owner is active (decided 2026-10-31, instead of an Edge Function). The token column is never readable through the table API; only the owner gets it from `share_settings()`.
- Live editing (Phase 6): Realtime channels are private and checked by RLS policies on `realtime.messages` — only people on the map join, only owner and editors send changes; "Allow public access" is turned off in the Realtime settings. Every change is saved through `doc_push` under the normal write rules. Realtime checks access when someone joins and keeps that answer for the connection, so a removed member can keep *receiving* live changes until their access token renews (keep the token lifetime short, e.g. 15 minutes); they can never save changes after removal.
- Write tests for RLS policies.

## API keys

- Stored only on the device (IndexedDB), never in Supabase, logs, analytics, or error reports.
- "Don't remember my key" option: keep it in memory only, cleared when the tab closes.
- Strict Content Security Policy; no third-party scripts on app pages. `connect-src` allows any `https:` origin plus `http://localhost` / `127.0.0.1`, because students can point MyNota at their own OpenAI-compatible endpoint; `script-src` stays `'self'`.
- Error tracking must scrub keys and map content. As built in Phase 7.6: MyNota's own
  `client_errors` table (no third-party service). `src/lib/errors/scrub.ts` runs in the browser
  before anything is sent: AI keys, bearer tokens, JWTs, `key=`/`token=` values and long opaque
  strings become `[secret]`, any quoted text (model output, block titles) becomes `[text]`,
  emails, URL queries, ids and share tokens are removed, stacks keep only function, file and
  line. At most 10 reports per page load; the database keeps 30 days and limits 30 an hour per
  person. Read in Admin › Errors. Pages that crash show a reload screen instead of going blank.

## Untrusted content

- AI output: validated with Zod, sanitized, rendered as a safe Markdown subset. Never `dangerouslySetInnerHTML` with model output.
- Links in content are checked before rendering.
- Prompts tell the model to ignore instructions inside source text.

## Uploads

- Allowed types: PDF, images (PNG, JPEG, WebP), plain text.
- Limits (decided 2026-10-30): up to **300 pages and 50 MB per book**; photos up to 20 MB each, at most 300 per upload. Checked in the browser before reading and by a database check on `sources.file_size`. Map counts per user are part of the Phase 7 rate limits.
- PDFs and photos are parsed in the browser. pdf.js and the OCR engine come from our own origin; the CSP adds only `'wasm-unsafe-eval'` (WebAssembly for OCR), never JS `eval`.
- Original files stay on the device (IndexedDB) and are parsed in the browser (pdf.js, Tesseract). Only extracted text and page numbers reach Postgres (decided 2026-10-30). If Storage is ever used: private buckets and short-lived signed URLs.

## Admin mapping through MCP

Admins can build maps with Claude or Gemini through the local server in `mcp/` (decided
2026-11-05; `docs/ai-pipeline.md`). The local server is not a security boundary: it runs on the
admin's computer and anyone could change it.

- **Admins only, in the database.** `admin_import_map()` is the only way in, and it starts with
  `admin_require()`: an active admin with a two-factor (`aal2`) session. It sets the owner,
  `created_by` and `map_id` itself and never takes them from the caller. It writes only to the
  caller's own maps, and only to maps never opened. Every call goes to `audit_log` as
  `map_imported`, with counts and never content. Normal limits apply.
- **No secret key.** It signs in as the admin, with the public key. The server refuses a Supabase
  secret key, which would skip every check.
- **Passwords and two-factor codes never reach the AI.** Only `npm run mcp:login`, in the admin's
  own terminal, sees them. The session is kept in `~/.mynota-mcp/session.json`, readable only by
  that user where the system supports it. `-- --logout` deletes it.
- **The AI is treated as untrusted.** It reads source text that may try to steer it, so
  `load_source` opens only `.pdf`, `.txt` and `.md` files within the upload limits, draft ids must
  match an exact format before becoming file names, and every read is marked as data. The skill
  tells it to publish only after the admin says yes, and hosts ask before running a tool.
- **It never reads anyone's maps.** No tool can read a student's map or the database's content.
- **Source text goes to the admin's AI provider** under the terms of their plan, as it would in
  any chat with that AI. Use it for material the admin may share there, not for students' content.

## Rate limiting

Sharing limits are counted from `share_events` inside the sharing functions (Phase 5): link created 20/hour, link reset 10/hour, invites 30/hour, copies 20/hour, reports 5/day (error `MN429`). Other limits: Supabase's built-in auth limits, and Edge Functions with a `rate_limits` counters table later (Phase 7). Public link views are not limited yet (no IP in the database).

| What | Why |
|---|---|
| Sign-in and sign-up attempts | Brute force |
| Share-link creation and reset | Spam |
| Invites sent | Spam |
| Public link views | Scraping |
| Uploads (size, type, count) and storage quota | Abuse and cost |
| Map and node creation | Abuse |
| AI calls (client-side queue + backoff) | Protect the user's key from provider bans |

As built in Phase 7.4 (`20261101100000_limits_and_logins.sql`): new maps per person per day,
nodes per map (only new rows count, saving re-sends existing ones) and uploads per person per day
(one file hash = one upload) are enforced by triggers with values from `app_settings`, error
`MN429`; admins switch off sign-ups or new share links (`MN403`). Sign-ins: failed password
attempts come from the Auth hook `hook_password_attempt`, successful ones from the `log-signin`
Edge Function through `log_signin()` (the caller's own account only, once a minute; device name,
country when the platform sends it, salted IP hash; 30 per IP hash an hour via `rate_hit()`).

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

As built in Phase 7.5: Settings › Your data downloads one JSON file built in the browser (owned
maps with blocks, links, source text and cards; subjects; own progress and review history on
every map; never AI keys). "Delete my account" calls the `delete-account` Edge Function: the
username must be typed, two-factor accounts need an aal2 session, 5 tries an hour; deleting the
auth user cascades to everything the account owns, and the app then clears the account's data
from the device (`forgetAccountOnDevice`). `/privacy` and `/terms` are public pages in all three
languages, linked from every sign-in screen and Settings; they are drafts until reviewed and the
contact (`LEGAL_CONTACT`) is set before launch.
