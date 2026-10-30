# Features

## Flashcards

One deck per map, scheduled with FSRS (`ts-fsrs`). Every card links back to its block.

- **Sources**: automatically from definition, vocabulary, formula, key_fact, and event blocks when a map is created; AI on demand ("make 10 cards from this chapter"); manually from any block.
- **Types**: basic, reversed, vocabulary (de ↔ ar ↔ en), cloze. Image-occlusion cards later.
- **Ratings**: Again / Hard / Good / Easy. Daily limits for new cards and reviews set in Settings.
- **Tied to the map**: "Show on map" flies to the card's block; each block shows a mastery dot (red → amber → green); study a whole map, one chapter, or only due cards.
- **Shared maps**: cards are shared with the map; progress is per user.

## Sharing

- **Roles**: owner, editor, viewer.
- **Invites**: by email or username, choosing editor or viewer. Owner can change roles or remove members.
- **Share link** (one per map):
  - Access: `off` / `view` / `edit`.
  - Token ≥ 32 random bytes, URL-safe.
  - "Reset link" rotates the token instantly.
  - Optional expiry date.
  - Anyone can open a view or edit link without an account, read-only.
  - On an edit link, "Sign in to edit"; after sign-in the user is added as an editor automatically.
  - Viewers get "Copy to my library".
- **Report** button on shared maps.
- All sharing actions are recorded in `share_events`.

## Real-time co-editing (Phase 6)

- Yjs: one document per chapter + one book-level document.
- Sync via Supabase Realtime or a dedicated Yjs server (see open questions).
- Presence: avatars in the top bar, colored cursors, highlight on the block someone is editing.
- Offline edits sync on reconnect.
- Per-user undo.
- AI-generated blocks are inserted into the shared document, so collaborators watch the map grow.
- A snapshot job keeps `nodes` and `relations` in Postgres up to date.

## Search

- Covers map titles, node titles/summaries/details, flashcards, and source text.
- Only maps the user owns or can access (RLS).
- Postgres full-text search (English and German stemming).
- **Arabic normalization** before indexing and querying:
  - أ إ آ → ا
  - strip diacritics (tashkeel)
  - unify ة / ه and ى / ي
  - remove tatweel (ـ)
- UI: search bar + keyboard shortcut (command palette, based on MindLex). Results grouped by map. Click opens the map, flies to the node, highlights it. Inside a map, typing filters the canvas live.
- Later: search by meaning with embeddings created using the user's own key.

## Admin dashboard

Separate area at `/admin` with its own layout. Admin role verified in the database; 2FA required.

| Page | Shows | Actions |
|---|---|---|
| Overview | Total and active users, signups over time, maps, reviews, storage | — |
| Users | Search, status, last login, map count, 2FA | Suspend, ban, reactivate |
| User detail | Maps, logins, shares, reports | Same |
| Maps | All maps: owner, type, size, sharing status | Open content (writes `audit_log`), take down link |
| Login activity | Time, device, approximate country, failures | Flag accounts |
| Sharing | All shares and public links | Revoke |
| AI jobs | Success/failure by provider, model, prompt version (never keys) | — |
| Reports | Moderation queue | Resolve, take down, suspend |
| Audit log | Every admin action | — |
| System | Rate-limit values, feature switches | Edit (logged) |
