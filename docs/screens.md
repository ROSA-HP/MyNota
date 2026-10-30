# Screens

## App shell

- **Top bar**: logo, global search, notifications, profile.
- **Left sidebar**: Home, Subjects, Shared with me, Flashcards, Settings. Pinnable on desktop; tap to open on tablet.

## Screen list

| # | Screen | Contents |
|---|---|---|
| 1 | Landing | Messy textbook page → colorful map visual, get started, sign in, short BYOK explanation |
| 2 | Sign in / up | Google, email, 2FA step |
| 3 | Onboarding | UI language + study field → get free AI Studio key (illustrated guide, paste, live test with green check) → sample chapter becomes a map → home |
| 4 | Home | Continue studying, due today + "Study now", streak and weekly activity, subjects, recent maps, shared with me |
| 5 | Subject | Maps in the subject, combined card stats, "New map in this subject" |
| 6 | New map flow | Type (book / notes / blank) → upload PDF, photos, or paste → review extraction (fix chapter splits, skip pages) → options (language, bilingual, detail level brief/standard/detailed, provider + model) → cost and time estimate → start, jump to workspace |
| 7 | Workspace | See below |
| 8 | Deck overview | Due, new, mastered per chapter; study all / chapter / due only |
| 9 | Study session | Big card, tap/space to flip, Again / Hard / Good / Easy, swipe on tablet, "Show on map", end summary |
| 10 | Card browser | List, filters, edit, delete |
| 11 | Share dialog | Invite with role, member list, link access (off / view / edit), copy, reset, expiry |
| 12 | Shared link page | Read-only map, "Sign in to edit", "Copy to my library", report |
| 13 | Settings | Profile · AI providers (keys, test, remember toggle, recommended models) · Appearance (theme, UI language) · Study (daily limits) · Security (2FA, devices) · Data (export, delete account) |
| 14 | Admin | Pages in `docs/features.md` |

## Workspace

- **Top bar**: map title, breadcrumb (Book › Chapter › Section), collaborator avatars, Search, Study, Share.
- **Canvas**: dot grid, minimap.
- **Semantic zoom**:
  - Zoomed out: chapter islands with titles and chapter-to-chapter arrows.
  - Middle: sections with summaries.
  - Zoomed in: full nodes with type icon, importance, mastery dot.
- **Left panel — outline**: collapsible tree of the whole map; click to fly there.
- **Right panel — node details** (when a node is selected):
  - Editable title, summary, type, color, importance
  - Rich details (bullets, formulas, examples, vocabulary)
  - Source: original paragraphs and page number ("where is this in my book?")
  - This node's flashcards
  - AI tools: expand, simplify, example, split, explain simpler, translate, make cards
- **Bottom toolbar**: select, add node, connect, auto-layout (style: top-down (default) / left-right tree / radial), focus mode, hide-details mode, undo / redo, zoom.
- **AI processing banner**: per-section progress, retry on failure, rate-limit countdown.
- **Suggested links tray**: dashed AI-proposed relations to accept or dismiss.
- **Linking blocks** (built 2026-10-30):
  - Hover or select a block: a dot on each side. Drag a dot onto any block to link; drop on empty space to make a new linked block. The block under the pointer is highlighted.
  - Right after linking, an inline picker (no dialog): kind 1–9, label (1–3 words, recent labels to reuse), one-way / both-ways arrow, swap. Edits apply live; Enter saves, Esc cancels a new link.
  - **L** (or toolbar Link / node menu "Link to…"): search any block on the map by name (accent- and Arabic-insensitive), whole map or this section; marks blocks already linked; can create the typed name as a new linked block. Linking an already linked pair opens that link instead of duplicating it.
  - Shift-click several blocks, then L: link them all to one target.
  - Drag a row from the outline onto a block on the map.
  - Click a link: toolbar above its label (kind, swap, both ways, edit label, go to the other end, delete); double-click a label to edit it; drag the square on either end onto another block to move that end. Delete removes the selected link.
  - Toolbar Link with nothing selected: tap two blocks (touch-friendly fallback).
- **Context menus**: right-click or long-press on nodes and edges.
- **Hide-details mode**: titles visible, details blurred; tap to reveal.
- **Focus mode**: dims everything except one branch.
- **Tablet**: panels become slide-over sheets, larger toolbar.

## States to design

- Empty library (first map CTA)
- Invalid key
- Rate-limited key ("Your free key needs a short break, resuming in 30s")
- Processing failed (per section, with retry)
- Offline (working from local copy)
- No permission (shared map you can't edit)
- Expired or reset share link
