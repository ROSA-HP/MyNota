# Data model

One flexible `nodes` table with a `level` replaces fixed chapter/section tables, because textbooks vary in depth.

Canvas content lives in two forms:
1. **Live Yjs documents** for editing (one per chapter + one book-level document for chapter positions and cross-chapter relations). Opening a book loads only the chapters in view.
2. **Readable Postgres snapshot** (`nodes`, `relations`) kept in sync from Yjs, used by search, flashcards, admin, and export.

Every table has RLS enabled in the migration that creates it.

## Users and organization

**profiles** (1:1 with `auth.users`)
- id, username, name, avatar_url
- username: unique, lowercase, `a–z 0–9 _`, 3–24 chars, starts with a letter (used for invites). Chosen at sign-up; generated from the email for Google sign-ups; editable in Settings
- role: `student` | `admin`
- status: `active` | `suspended`
- two_factor_enabled
- ui_language: `en` | `ar` | `de`
- theme: `light` | `dark` | `system`
- created_at, updated_at

**subjects**
- id, owner_id, name, color, sort_order (named `sort_order` because `order` is reserved in SQL)

**maps**
- id, owner_id, subject_id (nullable)
- type: `book` | `notes` | `blank`
- title, cover_color, languages[]
- link_token (nullable, ≥ 32 random bytes, URL-safe), link_access: `off` | `view` | `edit`, link_expires_at
- `link_token` is not readable through the API by anyone (column privilege); the owner gets it through a server function. Share fields are written only by server functions (Phase 5)
- created_at, updated_at

**map_members**
- map_id, user_id, role: `editor` | `viewer`, invited_by, added_at

## Canvas

**nodes**
- id, map_id, parent_id, order
- level: `book` | `chapter` | `section` | `block`
- title, summary
- type: `definition` | `concept` | `process_step` | `event` | `person` | `formula` | `example` | `comparison` | `key_fact` | `warning` | `vocabulary` (blocks only)
- icon, color
- importance: `core` | `supporting` | `extra`
- details: array of detail blocks (below)
- lang, dir: `ltr` | `rtl`
- branch_view: `tree` | `process` | `timeline` | `comparison` | `cause_effect`
- position {x, y}, size {w, h}, collapsed
- source {paragraphs: string[], page: number}
- ai_added (boolean), ai_added_reason
- created_by (user id or `ai`), created_at, updated_at

**relations**
- id, map_id, from_node, to_node
- type: `causes` | `leads_to` | `part_of` | `example_of` | `contrasts_with` | `prerequisite` | `analogy` | `derived_from` | `related`
- label (1–3 words), direction: `forward` | `backward` | `both`
- status: `suggested` | `accepted`
- created_by

**Detail block types** (from MindLex `shared/index.ts`): `text`, `bullet`, `example` (sentence + translation), `vocab` (rows per language, article, plural), `formula` (LaTeX + variables), `question` (front/back), `cloze`.

## Sources and AI

**sources**
- id, map_id, chapter_node_id
- kind: `pdf` | `images` | `text`
- storage_path, pages
- paragraphs: numbered `P1..Pn`, each with text and page number

**ai_jobs**
- id, map_id, chapter_node_id
- pass: `outline` | `details` | `links` | `tool`
- provider, model, prompt_version
- status: `queued` | `running` | `done` | `failed`
- tokens_in, tokens_out, duration_ms, error
- **Never the API key.**

## Flashcards

**cards**
- id, map_id, node_id (nullable)
- type: `basic` | `reversed` | `vocab` | `cloze`
- front, back, languages
- created_by: `auto` | `ai` | `manual`

**card_progress** (per user)
- card_id, user_id
- FSRS fields: stability, difficulty, due, reps, lapses, state
- last_review

**review_logs**
- card_id, user_id, rating (1–4), reviewed_at, elapsed_days

## Security and admin

**login_events**: user_id, at, success, device, country, ip_hash
**share_events**: map_id, actor_id, action (`link_created` | `link_reset` | `invite_sent` | `member_added` | `member_removed` | `role_changed`), target_user_id, at
**reports**: map_id, reporter_id, reason, status (`open` | `resolved`), outcome, handled_by
**audit_log**: actor_id, action, target_type, target_id, reason, at — includes every admin view of map content
**rate_limits** (counters): key, window_start, count

## RLS summary

- Read a map and its nodes/relations/cards/sources: owner, member, or valid link token (view via Edge Function).
- Write: owner or editor.
- `card_progress`, `review_logs`: only the user themself.
- Admin tables and admin reads: role = `admin` verified in the database.
- Every admin read of map content writes an `audit_log` row.
