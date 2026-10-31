# Features

## Flashcards

One deck per map, scheduled with FSRS (`ts-fsrs`). Every card links back to its block.

- **Sources**: automatically from definition, vocabulary, formula, key_fact, and event blocks when a map is created; AI on demand ("make 10 cards from this chapter"); manually from any block.
- **Types**: basic, reversed, vocabulary (de ↔ ar ↔ en), cloze. Image-occlusion cards later.
- **Ratings**: Again / Hard / Good / Easy. Daily limits for new cards and reviews set in Settings.
- **Tied to the map**: "Show on map" flies to the card's block; each block shows a mastery dot (red → amber → green); study a whole map, one chapter, or only due cards.
- **Shared maps**: cards are shared with the map; progress is per user.
- **Study session** (Phase 4.2): `ts-fsrs` 5.x (FSRS-5, 90 % retention, learning steps 1 min / 10 min, fuzz on). Today's queue is learning cards that are due, then reviews (oldest first) with new cards spread among them. Daily limits count per user across all maps for the local day: new cards first seen today, and reviews of cards in review state. Space/Enter or a tap flips, 1–4 or swipe left/right rates, Z undoes the last answer (progress restored, review log deleted). Learning cards come back in the same session (up to 20 minutes early when nothing else is left). The summary shows the answer mix, cards answered Again with "Show on map", the streak, cards due tomorrow, and "Practice the hard ones".
- **Practice** never changes the schedule and writes nothing: from the summary, or "Practice anyway" when nothing is due.
- **Decks** (Phase 4.3): Home shows what is due today across maps; Flashcards lists every deck; each map has a deck page with an overview by chapter and a card browser. Owners and editors edit, add, delete (made cards are hidden so a sync never brings them back) and ask their AI for new cards; anyone on the map can reset their own progress on a card. Daily limits are set in Settings › Study.
- **Study views on the map** (Phase 4.4): mastery dots on blocks (struggling red, learning amber, mastered green, not studied white; toggle remembered per device); **Hide details** covers block titles on the canvas and in the outline until tapped (recall practice, "Show all" ends it); **Focus** keeps the selected block's chapter (book) or section (notes) bright and dims the rest (Esc leaves). The details panel lists a block's cards with their state, adds a quick card, and studies just those (`/maps/:id/study?block=<id>`).
- **Show on map** opens `/maps/:id?node=<block>`, which selects the block and centers the canvas on it.

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
- Built in Phase 4.5: `search_all()` (see `docs/data-model.md`); the palette opens with Ctrl/Cmd+K or the search button in the top bar, has tabs All / Blocks / Cards / Source text, highlights matches with the same normalization, and Enter opens `/maps/:id?node=…` (cards open in the deck's card browser). The outline filter in a map dims everything on the canvas that does not match (matches and the path above them stay bright).
- Later: search by meaning with embeddings created using the user's own key.

## Export (Phase 4.6)

- From the map's top bar (download icon). Everything is made in the browser; nothing is uploaded.
- **PDF**: the map picture first (a book gets one page per built chapter), then the outline with summaries, details, links and (optionally) flashcards. Outline pages are laid out by the browser and added as images, so Arabic, German and formulas look exactly as on screen (the text is not selectable). Paper: A4 landscape / portrait, Letter landscape.
- **PNG**: the map (or one chapter/section, or what is on screen) at blocks level, 2× for print, light theme, optional light colors (white regions).
- **Markdown**: the outline for notes apps (Obsidian): headings down to sections, blocks as lists, links as → / ←, cards as `front :: back`; model text is escaped.
- Pictures leave out the minimap, handles, build buttons, mastery dots and suggested (not yet accepted) links; selection, focus, filter and hidden details are switched off while the picture is taken and restored after.

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
