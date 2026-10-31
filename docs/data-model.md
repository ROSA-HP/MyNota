# Data model

One flexible `nodes` table with a `level` replaces fixed chapter/section tables, because textbooks vary in depth.

Canvas content lives in two forms:
1. **Live Yjs documents** for editing (one per chapter + one book-level document for chapter positions and cross-chapter relations). Opening a book loads only the chapters in view.
2. **Readable Postgres snapshot** (`nodes`, `relations`) kept in sync from Yjs, used by search, flashcards, admin, and export.

**Live documents** (`20261031190000_live_docs.sql`, Phase 6): `doc_key` is `book` (the book and chapter nodes, links between chapters) or a chapter node id (its sections, blocks and the links inside it).
- **map_docs**: map_id, doc_key, state (merged Yjs update), upto (last saved change merged into it), updated_by, updated_at. Read by everyone on the map; written only by `doc_compact()`.
- **map_doc_updates**: id (increasing), map_id, doc_key, data (one Yjs update, ≤ 4 MB), created_by (always the caller), created_at. Read by everyone on the map; inserted by owner and editors; never changed; deleted only by `doc_compact()`.
- Functions (base64 in and out): `doc_load(map, keys[])` (state + changes after it + upto, `SECURITY INVOKER`), `doc_push(map, key, update)` (`SECURITY INVOKER`), `doc_compact(map, key, state, upto)` (`SECURITY DEFINER`, owner/editor, one at a time per document; an older merge never replaces a newer one).
- Realtime topics `map:<id>` (changes) and `map:<id>:people` (presence, cursors), checked by policies on `realtime.messages` using `live_topic_map()` and `map_role()`.

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

**Search** (`20261031150000_search.sql`, Phase 4.5): generated columns `search_text` (normalized with `search_normalize()`, same rules as `src/lib/searchText.ts`: lower case, Latin accents and Arabic diacritics stripped, أ إ آ ٱ → ا, ى → ي, ة → ه, ؤ → و, ئ → ي, tatweel removed, ß → ss) on `maps` (title), `nodes` (title, summary, detail text), `cards` (front, back) and `sources` (all paragraph text), each with a pg_trgm GIN index; `search_fts` (English + German stemmed tsvector) on `nodes` and `cards` with GIN indexes. `search_all(q, max_results)` (`SECURITY INVOKER`) returns map / node / card / source rows ranked best first: every word must appear as a substring, or the stemmed words match. Sources return the first matching paragraph and their chapter node. Needs `q` of 2+ characters; LIKE wildcards are literal.

## Security and admin

**login_events**: user_id, at, success, device, country, ip_hash
**map_invites** (Phase 5): map_id, invitee_id, role (`editor` | `viewer`), invited_by, status (`pending` | `accepted` | `declined` | `cancelled`), created_at, responded_at; one pending invite per person and map. Read by the map owner and the invitee.
**share_events**: map_id, actor_id, action (`link_created` | `link_changed` | `link_reset` | `link_joined` | `invite_sent` | `invite_cancelled` | `invite_accepted` | `invite_declined` | `member_removed` | `member_left` | `role_changed` | `map_copied` | `map_reported`), target_user_id, at. Read by the map owner and the actor; also the rate-limit counter for sharing.
**reports**: map_id, reporter_id, reason (`spam` | `inappropriate` | `copyright` | `harmful` | `other`), details, status (`open` | `resolved`), outcome, handled_by; one open report per person and map; read only by the reporter (admins in Phase 7).

**Sharing functions** (`20261031170000_sharing.sql`, `SECURITY DEFINER`): `share_settings`, `share_link_set(map, access, expires_at)`, `share_link_reset`, `invite_member(map, username_or_email, role)`, `invite_cancel`, `invite_respond(invite, accept)`, `member_set_role`, `member_remove` (owner removes, or a member leaves), `map_people`, `my_invites`, `link_open(token)` (also for anon: map, nodes, accepted relations, sources), `link_join(token)` (edit links: become editor), `copy_map(map | token)`, `report_map`. `map_members` has no client write grants any more. Errors: `MN400` invalid, `MN404` not found, `MN409` already done, `MN410` link off/expired, `MN429` too many, `42501` not allowed.
**audit_log**: actor_id, action, target_type, target_id, reason, at — includes every admin view of map content
**rate_limits** (counters): key, window_start, count

## RLS summary

- Read a map and its nodes/relations/cards/sources: owner, member, or valid link token (read only, through `link_open()`).
- Write: owner or editor.
- `cards`: read by everyone on the map, written by owner and editors.
- `card_progress`, `review_logs`: only the user themself (and only for maps they can open); review logs are never changed, and only deleted by undo within an hour (`20261031130000_review_undo.sql`).
- Admin tables and admin reads: role = `admin` verified in the database.
- Every admin read of map content writes an `audit_log` row.
