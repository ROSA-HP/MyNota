# Roadmap

Each phase ends with something a student can actually use. Before starting a phase, propose a short plan and wait for approval.

## Phase 1 — Foundation

- Vite + React + TypeScript (strict) + Tailwind v4 setup, ESLint, Vitest
- Design tokens (CSS variables, light/dark) and base components: Button (neo-btn), Card, Input, Dialog, Toast, Sidebar, TopBar
- App shell with routing
- Supabase project; migrations for `profiles`, `subjects`, `maps`, `map_members` with RLS
- Auth: Google + email with verification
- i18n (en / ar / de) with full RTL switching
- Empty library screen

**Done when**: a user can sign up, log in, and see an empty library in all three languages, light and dark.

## Phase 2 — Core map (MVP)

- Settings → AI providers: Gemini key, test, remember toggle (IndexedDB)
- AI provider interface + Gemini adapter, Zod schemas, repair retry, queue with backoff
- Paste text → numbered paragraphs → outline pass → details pass
- Canvas (React Flow) with top-down layout (built as a small custom layout; ELK decision pending, see open-questions), custom nodes (type icon, importance), hierarchy and relation edges
- Add / edit / delete nodes; create labeled relations; node details panel
- Migrations for `nodes`, `relations`, `ai_jobs`, and `sources` (text only; moved up from Phase 3 so block citations point to saved paragraphs)
- Save to Supabase + IndexedDB cache

**Done when**: pasted text becomes an editable, saved map.

## Phase 3 — Books and power

- PDF and photo upload (Storage), pdf.js extraction, Tesseract OCR
- Chapter detection and extraction review screen
- PDF and image `sources`; page numbers in the source view
- Chapter regions (colored), semantic zoom, outline panel
- Cross-links pass with suggested-links tray
- Claude and OpenAI-compatible adapters; cost estimate
- Notes mode, merge mode, subjects

**Done when**: a full textbook becomes a navigable book map.

## Phase 4 — Study

- `cards`, `card_progress`, `review_logs`; auto, AI, and manual cards
- FSRS scheduling; deck overview; study session; card browser
- Mastery dots; hide-details mode; focus mode
- Global search with Arabic normalization
- Export: PNG, PDF, Markdown

**Done when**: a student can study a chapter end to end.

## Phase 5 — Sharing

- Invites with roles; share links (view / edit, reset, expiry) via Edge Functions
- Shared-link page; copy to library; reports
- `share_events`, `reports`, rate limits on sharing

**Done when**: two friends can share a map safely.

## Phase 6 — Real-time co-editing

- Yjs per chapter + book-level document
- Presence, cursors, editing highlight
- Offline sync; per-user undo
- Snapshot pipeline to Postgres

**Done when**: two people edit the same map live without conflicts.

## Phase 7 — Admin and launch

- Admin dashboard (all pages in `docs/features.md`), `audit_log`, `login_events`
- Admin 2FA enforcement
- Moderation queue
- Privacy policy, terms, data export, account deletion
- Error monitoring with scrubbing
- Prompt test set and recommended-models list
- Branding

**Done when**: ready for public students.

## After launch

Mobile layout · merge-mode polish · search by meaning · stylus annotation · image-occlusion cards.
