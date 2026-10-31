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
- id, map_id, parent_id, sort_order (position among siblings; `order` is reserved in SQL)
- level: `book` | `chapter` | `section` | `block`
- title, summary
- type: `definition` | `concept` | `process_step` | `event` | `person` | `formula` | `example` | `comparison` | `key_fact` | `warning` | `vocabulary` (blocks only)
- icon, color
- importance: `core` | `supporting` | `extra`
- details: array of detail blocks (below)
- lang, dir: `ltr` | `rtl`
- branch_view: `tree` | `process` | `timeline` | `comparison` | `cause_effect`
- position {x, y}, size {w, h}, collapsed
- source {paragraphs: number[], page?: number} (paragraph numbers cited from the map's source, e.g. `[5, 6]` = P5–P6)
- ai_added (boolean: content the AI added beyond the source), ai_added_reason
- origin: `user` | `ai` (who created the node), created_by (the user who saved it), created_at, updated_at

**relations**
- id, map_id, from_node, to_node
- type: `causes` | `leads_to` | `part_of` | `example_of` | `contrasts_with` | `prerequisite` | `analogy` | `derived_from` | `related`
- label (1–3 words), direction: `forward` | `backward` | `both`
- status: `suggested` | `accepted` | `dismissed` (a dismissed AI suggestion is kept so it is never suggested again; hidden everywhere in the app)
- confidence: `high` | `medium` (AI suggestions only)
- origin: `user` | `ai`, created_by

**Detail block types** (from MindLex `shared/index.ts`): `text`, `bullet`, `example` (sentence + translation), `vocab` (rows per language, article, plural), `formula` (LaTeX + variables), `question` (front/back), `cloze`.

Until flashcards ship in Phase 4, flashcard candidates from the details pass are stored on their block as `question` details, so nothing is lost. Phase 4 turns them into cards.

Outline subsections are orientation for the details pass only; they are not stored as nodes. A section's blocks hang directly under it (with nesting where the model groups them).

## Sources and AI

**sources**
- id, map_id, chapter_node_id
- kind: `pdf` | `images` | `text`
- pages, file_name, file_size, file_hash (to find the local copy; the file itself stays in the device's IndexedDB, never in Storage)
- paragraphs: numbered `P1..Pn`, each with text and page number
- A chapter (or a notes map's root) can have several sources: notes added later ("Add notes") are saved as another source of the same chapter, numbered after the existing paragraphs, so a block's citations always point to one stored paragraph.

**map_stats(map_ids)** (Postgres function, `SECURITY INVOKER`, so RLS applies): blocks, chapters, chapters built and chapter colors per map, for library cards.

**ai_jobs**
- id, map_id, chapter_node_id, node_id (the section a details job is for)
- pass: `outline` | `details` | `links` | `merge` | `tool`
- provider, model, prompt_version
- status: `queued` | `running` | `done` | `failed`
- tokens_in, tokens_out, duration_ms, error (a check constraint rejects strings that look like API keys)
- created_by; owner/editor can insert and update only the status fields
- **Never the API key, never the source text or model output.**

## Flashcards

**cards** (built 2026-10-31, migration `20261031120000_flashcards.sql`)
- id, map_id, node_id (nullable; deleting the block deletes its cards)
- type: `basic` | `reversed` | `vocab` | `cloze` (cloze text marks the gap as `{{…}}`)
- front, back, languages
- origin: `auto` (from a block's type) | `ai` (the AI's card ideas, "make cards") | `manual`
- source_key: for made cards, the rule that made it (`type`, `q:<hash>`, `c:<hash>`, `v:<hash>`); unique per block, so a sync never makes a card twice
- suspended: a made card the student removed stays hidden, so it is not made again
- created_by (the user who saved it)
- Cards are made on the device: after blocks change (2 s quiet), for editors, from `question` / `cloze` details first, else one card for definition, vocabulary, formula, key_fact and event blocks.

**card_progress** (per user, primary key card_id + user_id)
- card_id, user_id, map_id
- FSRS fields: due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state (0 new, 1 learning, 2 review, 3 relearning), last_review
- Mastered = review state with stability ≥ 21 days; struggling = relearning, or 2+ lapses and not mastered.

**review_logs** (per user; insert-only, except that a student may delete their own answer within an hour — the study session's undo)
- card_id, user_id, map_id, rating (1–4), state before the answer, elapsed_days, scheduled_days, duration_ms, reviewed_at

**profiles**: daily_new_limit (default 10), daily_review_limit (default 100) (decided 2026-10-31). Read separately from the rest of the profile.

**Functions** (`SECURITY INVOKER`, RLS applies): `deck_stats(map_ids)` (total, new, due, learning, mastered per map for the caller), `study_activity(days, tz)` (reviews per day).

## Security and admin

**login_events**: user_id, at, success, device, country, ip_hash
**share_events**: map_id, actor_id, action (`link_created` | `link_reset` | `invite_sent` | `member_added` | `member_removed` | `role_changed`), target_user_id, at
**reports**: map_id, reporter_id, reason, status (`open` | `resolved`), outcome, handled_by
**audit_log**: actor_id, action, target_type, target_id, reason, at — includes every admin view of map content
**rate_limits** (counters): key, window_start, count

## RLS summary

- Read a map and its nodes/relations/cards/sources: owner, member, or valid link token (view via Edge Function).
- Write: owner or editor.
- `cards`: read by everyone on the map, written by owner and editors.
- `card_progress`, `review_logs`: only the user themself (and only for maps they can open); review logs are never changed, and only deleted by undo within an hour (`20261031130000_review_undo.sql`).
- Admin tables and admin reads: role = `admin` verified in the database.
- Every admin read of map content writes an `audit_log` row.
