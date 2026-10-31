# MyNota

MyNota turns textbook chapters and lecture notes into colorful, editable mind maps that students study from, share, and review with flashcards. Public product for students; small number of admins. Languages: English, Arabic (full RTL), German. Desktop and tablet first, mobile later.

**Core idea: the AI classifies, the app draws.** The student's own AI model returns structured JSON (topics, subtopics, block types, relations). MyNota does layout, styling, and editing. The model never decides positions or visuals.

This file holds the rules that apply to every task. Detailed specs live in `docs/` — read the relevant one before working on that area. If a request conflicts with anything here or in `docs/`, ask before deviating.

## Docs index

| File | Read before working on |
|---|---|
| `docs/data-model.md` | Database tables, migrations, RLS, Zod schemas, Yjs documents |
| `docs/ai-pipeline.md` | Anything AI: extraction, passes, prompts, provider adapters, classification rules, prompt testing |
| `docs/features.md` | Flashcards, sharing, real-time collaboration, search, admin dashboard |
| `docs/security.md` | Auth, permissions, keys, uploads, rate limits, privacy |
| `docs/design-system.md` | Any UI: colors, fonts, components, RTL, tablet |
| `docs/screens.md` | Any screen or user flow |
| `docs/roadmap.md` | Phase scope and "done when" criteria |
| `docs/migrations.md` | The list of database migrations, how to check which are applied, and how to apply them |
| `docs/open-questions.md` | Undecided items. Ask the user when you reach one |

## Non-negotiable decisions

- **Bring-your-own-key only.** API keys are stored only on the device (IndexedDB) and sent only to the chosen AI provider. Never to Supabase, never to logs, analytics, or error reports.
- **Providers**: Gemini (recommended; free key from Google AI Studio), Claude, and any OpenAI-compatible endpoint with a custom base URL.
- **AI output is structured JSON only**, validated with Zod, with one repair retry that includes the validation error.
- **One big map per book**: chapters are colored zoomable regions with semantic zoom. Map types: book, notes, blank. Maps are grouped into Subjects.
- **Backend is Supabase** (Auth, Postgres + Row Level Security, Storage, Realtime, Edge Functions). No custom Express server.
- **Local IndexedDB copy** for instant load and offline use.
- **Real-time co-editing with Yjs** ships in Phase 6, but data must be designed for it from day one.
- **Sharing**: invite (editor / viewer) or one link per map (off / view / edit). Anyone can view a link; editing requires an account.
- **Flashcards**: one deck per map, FSRS scheduling, progress is per user.
- **Search** across all maps the user owns or can access, with Arabic normalization.
- **Admins have full content access**; every admin view of map content is written to `audit_log`.
- **Design**: neo-brutalist notebook style based on Perfusense, multi-colored.

## Tech stack

React + TypeScript (strict) + Vite · Tailwind CSS v4 · React Flow (`@xyflow/react`) · Zustand · Zod · Yjs · Dexie (IndexedDB) · Supabase JS · pdf.js · Tesseract.js (ara, deu, eng) · KaTeX · lucide-react · ts-fsrs (5.x; 6.0 changed the API, decided 2026-10-31) · Vitest.

## Architecture rules

- **Browser**: text extraction, AI calls with the user's key, layout, canvas, FSRS scheduling, local cache.
- **Postgres**: all persistent data. **Every table has RLS enabled in the same migration that creates it.** Permissions are enforced in the database, never only in the UI.
- **Sharing** (share links, invites, members, copy, reports, their rate limits and `share_events` log) runs in `SECURITY DEFINER` Postgres functions, not Edge Functions (decided 2026-10-31: one migration to apply, covered by the RLS tests). Invites wait for the invitee to accept; only existing accounts can be invited (email invites to new people later).
- **Edge Functions**: admin actions and audit logging (Phase 7), and anything that needs a server secret (e.g. sending email).
- **Realtime**: one Yjs document per chapter + one book-level document. Postgres keeps a readable snapshot for search, flashcards, admin, and export.
- **Map layout** is MyNota's own small top-down layout (`src/features/workspace/canvas/layout.ts`), not ELK.js (decided 2026-10-30).
- **Uploaded PDFs and photos stay on the device** (IndexedDB). Only the extracted paragraphs and page numbers are saved to Postgres, so maps work everywhere; page previews work on the device that has the file (decided 2026-10-30).
- **AI calls go directly from the browser to the provider.** No pass-through server for now; if an endpoint blocks browser calls (CORS), show a clear message. A pass-through Edge Function (never storing or logging the key or content) is only reconsidered if users need it (decided 2026-10-30).

## Security essentials (full list in `docs/security.md`)

- Admin role is verified server-side (database / Edge Functions), never only in the UI. 2FA required for admins.
- AI output is untrusted: validate with Zod, sanitize, render a safe Markdown subset. Never `dangerouslySetInnerHTML` with model output.
- Prompts treat source text as data and tell the model to ignore instructions inside it.
- Uploads: allowed types and size limits; files are parsed locally and stay on the device (nothing uploaded to Storage).
- Share-link tokens: ≥ 32 random bytes, URL-safe, rotatable.

## Folder structure

```
src/
  app/              routing, providers, app shell
  features/         auth, library, new-map, workspace, flashcards, sharing, search, settings, admin
  ai/
    providers/      gemini.ts, anthropic.ts, openaiCompatible.ts
    prompts/        outline.v1.ts, details.v1.ts, links.v1.ts
    pipeline/       prepare, outline, details, links, queue
    schemas/        Zod schemas for AI output
  lib/              supabase client, indexeddb, i18n, arabic normalization, fsrs
  components/ui/    design-system components
  styles/
supabase/
  migrations/       SQL schema + RLS policies
  functions/        Edge Functions
tests/
docs/
```

## Reuse from earlier repos

- **MyNotes / MindLex** (https://github.com/ROSA-HP/MyNotes): adapt the React Flow node/edge components, context menu, edge toolbar, connection popover, block editor, command palette, study modal, outline view, Zod schemas, merge and suggest-links logic. **Drop**: the hardcoded local-fallback extractor, text truncation, Express + MongoDB, server-side Gemini key, dagre.
- **Perfusense** (https://github.com/ROSA-HP/Perfusense): fonts, ink color, borders, hard shadows, `.neo-btn`, sidebar pattern (tap to open on tablet instead of hover).

## Roadmap (details in `docs/roadmap.md`)

1. Foundation — setup, design tokens, app shell, Supabase, auth, i18n + RTL
2. Core map (MVP) — BYOK, paste text → map, edit canvas, save
3. Books and power — PDF/OCR, chapters, semantic zoom, cross-links, all providers
4. Study — flashcards, FSRS, search, export
5. Sharing — invites, links, reports
6. Real-time co-editing — Yjs
7. Admin and launch

## How to work

- Start with **Phase 1**. Before writing code for any phase, propose a short plan and **wait for the user's approval**.
- Read the relevant `docs/` file before working on an area.
- Keep changes small and focused; commit often with clear messages.
- TypeScript strict mode. No `any` without a comment explaining why.
- Write tests for: Zod schemas, AI response parsing and repair, Arabic normalization, FSRS integration, RLS policies.
- Check UI in LTR and RTL, light and dark, desktop and tablet widths.
- When you hit an item in `docs/open-questions.md`, ask the user.
- When the user changes a decision, update this file or the relevant `docs/` file in the same change.
- When something is unclear or seems wrong, ask instead of guessing.
