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
| 5 | Subject | Maps in the subject, combined card stats, "New map in this subject". As built (Phase 3): the library has subject chips (All · N, one per subject with its color, + New subject), maps grouped by subject, then No subject, then Shared with you. Drag a map card onto a chip or group to file it, or use the card's ⋯ menu (touch and keyboard). Subject menu: edit (name, color), delete (maps stay, without a subject). Book cards show chapter colors and "4 of 6 chapters built" with a bar; others "13 blocks · updated yesterday". New map from a subject preselects it; the workspace breadcrumb shows the subject. |
| 6 | New map flow | Type (book / notes / blank) → PDF, photos of pages (reorderable) or paste; OCR language for scanned pages; progress for reading and OCR → books: chapter review (rename, merge, split at a page, tap pages to skip, tick chapters to build now, others wait on the map) / notes: paragraph review → options (language, explanations, detail level, provider + model) → estimate (tokens, requests, cost) → build, jump to workspace. The file stays on the device. |
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
- **Semantic zoom** (built 2026-10-31). Positions never change between levels; only what is drawn changes. Zoomed-out text keeps a readable screen size (capped by the card's size).
  - Chapters (book maps, zoom < 0.32): each chapter region shows its number, title, section chips with block counts, and a core-blocks bar. Click a chapter to zoom into it.
  - Sections (book < 0.62, notes < 0.45): each section card grows over its column with its summary and first blocks.
  - Blocks: full nodes with type icon, importance, mastery dot.
  - Zoomed out, links are bundled between the cards still drawn (one line per pair, thicker and counted for several); click a bundle to zoom in on it.
  - Toolbar switch: Chapters / Sections / Blocks (notes maps: Sections / Blocks). Any zoom by the student stops the map from re-fitting while it grows.
- **Book maps**: chapters are notebook tabs over colored regions, packed in rows. A chapter not built yet is striped with "Build this chapter"; one that stopped half-way shows "Continue building", which only builds the missing sections (works after closing the tab). The outline shows chapter numbers and status and offers "Build N waiting chapters"; chapters build one after another.
- **Left panel — outline**: collapsible tree of the whole map; click to fly there.
- **Right panel — node details** (when a node is selected):
  - Editable title, summary, type, color, importance
  - Rich details (bullets, formulas, examples, vocabulary)
  - Source: original paragraphs and page number ("where is this in my book?")
  - This node's flashcards
  - AI tools: expand, simplify, example, split, explain simpler, translate, make cards
- **Bottom toolbar**: select, add node, connect, auto-layout (style: top-down (default) / left-right tree / radial), focus mode, hide-details mode, undo / redo, zoom.
- **AI processing banner**: per-section progress, retry on failure, rate-limit countdown.
- **Suggested links tray** (built 2026-10-31): top-bar button "Suggested links N" (yellow when there are some) opens a right panel: "Accept N strong", "Dismiss all", then one card per suggestion (both ends with their chapter or section color, label, Strong / Medium, Accept / Dismiss / Show). Show zooms to the pair and highlights both blocks. "Find links" / "Look for more links" runs the pass by hand. After a pass, a note above the toolbar: "Found 5 links between chapters 1–4. Accept the ones that help." with Review. Link labels on the map sit on the nearest free spot along the link, never over a block, and links pass under blocks so blocks stay clickable.
- **Add notes** (merge, built 2026-10-31): top-bar button opens a dialog: (book maps: chapter) → paste, PDF or photos → "Find places" → preview with the new notes on the left (green: added to existing branches, blue: new branch, grey: skipped) and the plan on the right in three groups, each item with a checkbox and "Change" (pick another place or a new section); skipped duplicates can be "added anyway" as details → "Apply N changes". New blocks are highlighted on the map.
- **Page previews** (built 2026-10-31): the source panel lists the pages a block cites ("p. 7"); tapping one shows that page, rendered from the PDF or photo kept on this device. On another device it says the previews work where the file is.
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
