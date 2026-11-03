# Design system

"Neo-brutalist notebook": Perfusense's bold outlines, hard shadows, and tactile buttons, moved from a clinical dashboard onto colorful notebook paper.

## Tokens

| Element | Spec |
|---|---|
| Background | Warm off-white paper; faint dot grid on the canvas |
| Ink | `#121C1B` for outlines, text, shadows |
| Brand | Teal `#0D9488` to start (to be revisited, see open questions) |
| Chapter palette | 8 highlighter colors in order: yellow, coral, sky, mint, lavender, pink, orange, lime |
| Mastery | Small dot per block: red → amber → green |
| Latin font | Space Grotesk |
| Arabic font | IBM Plex Sans Arabic (or Cairo), matched in size and weight |
| Mono font | Space Mono — numbers and small badges only |
| Borders | 2px ink, 10–12px radius |
| Shadows | Hard offset (e.g. `2px 2px 0 #121C1B`) on buttons, panels, and the selected node; lighter outline on regular canvas nodes |
| Motion | Buttons press in on click (Perfusense `.neo-btn`); the map grows as AI works; search flies to a node |

All colors are CSS variables with light and dark values.

## Rules

- **Color rule**: chapter color = region tint + node border. Node type = icon badge (lucide icon). The two never compete.
- **Never color alone**: every meaning has an icon or label too.
- Mono labels sparingly, and never uppercase or letter-spaced in Arabic (Arabic has no uppercase; long German words in caps are hard to read).
- Hard shadows only where they add focus; hundreds of shadowed nodes look heavy.

## Node types → icons (suggested)

| Type | Icon idea |
|---|---|
| definition | book-open |
| concept | lightbulb |
| process_step | list-ordered |
| event | calendar |
| person | user |
| formula | sigma |
| example | flask-conical |
| comparison | columns-2 |
| key_fact | star |
| warning | triangle-alert |
| vocabulary | languages |

## Themes and direction

- Light and dark themes.
- App UI in English (the default for every first visit, regardless of browser language), Arabic, German. Full RTL mirroring when the UI language is Arabic (use logical CSS properties: `ms-`, `me-`, `start`, `end`).
- Each node has its own `dir`, so Arabic nodes render correctly inside an English UI and vice versa.
- Default map layout is **top-down** (decided 2026-10-30): the map title at the top, top-level sections as columns below it, and each section's blocks stacked under it. Process sections stack their steps vertically with arrows.
- In Arabic UI the columns run right-to-left.

## Tablet

- No hover-only interactions: the sidebar opens on tap.
- Long-press replaces right-click.
- Pinch to zoom, two-finger pan.
- Large touch targets, especially node connection handles.
- Side panels become slide-over sheets.
- Stylus annotation is a later idea.

## Accessibility

- Good contrast in both themes.
- Keyboard shortcuts for all main canvas actions on desktop.
- Focus states visible on every interactive element.

## Design review rules (decided 2026-10-31)

The owner installed two design skills (`.claude/skills/ui-ux-pro-max`, `.claude/skills/taste-skill`)
and chose to **refine the neo-brutalist style, not replace it**:
- Borders, hard shadows and the chapter colors stay MyNota's identity, used with intent: a hard
  shadow marks something you can press or the one primary surface of a screen, not every box.
- Color goes on content (chapters, sections, mastery, links) more than on chrome (frames, menus).
- Navigation recedes: the active item is clear but quiet.
- Type carries hierarchy: one clear heading per screen, numbers as type rather than tiles.
- Honest data states: zero shows as 0, missing as a dash, empty sections keep their frame and say
  what to do.
- ui-ux-pro-max's accessibility and interaction rules are required: contrast 4.5:1, visible focus,
  44 px touch targets, labels on icon-only buttons, `prefers-reduced-motion`, no emoji icons.

### Polish pass 4.D (2026-10-31)

- **Light-theme contrast fixes.** `--brand` is now `#0f766e` (hover `#115e59`) so brand text and white
  on brand pass 4.5:1; `--ink-faint` `#5c6865`; `--success` `#147a3b`; `--warning` `#9a4a0a`.
  Dark-theme values already passed and are unchanged.
- **Shadows.** `Panel` has no shadow by default. Shadows stay on buttons, pressable cards (library
  map cards), dialogs, menus, popovers, the canvas toolbar, the auth card and selected canvas blocks.
- **Navigation.** The active sidebar item is a bordered white row in bold, with no fill or shadow.
- **Type.** Badges and word labels ("118 words", "3 maps") use the text face, semibold, with
  `tabular-nums`. Space Mono is kept for figures that line up: page numbers, P/N references,
  zoom percent, counters, keyboard keys.
- **Disabled controls** are flat and sunken (`bg-paper-sunken`, muted text, no shadow), not faded.
- **Touch.** Small buttons grow to 44 px on coarse pointers (`pointer-coarse:`).
- **Motion.** Global `prefers-reduced-motion` CSS; canvas camera moves use `motionMs()` and become
  instant.
- **Landing.** Two-line headline, no eyebrow, feature cards are colored block fields without icons.
- Two patterns are kept on purpose and marked `taste-skill-ignore`: the paper dot grid and the hatch
  on chapters waiting to be built.

### Dark theme redesign (2026-11-01)

(Values in this list are the first pass; the brightened values follow it.) The owner found the dark theme poor; it was an inverted light theme. Now (tokens in
`src/styles/index.css`, `[data-theme='dark']`):
- **Paper**: neutral graphite (`#121417`, surfaces `#1a1d21` / `#21252a`) instead of green-black,
  so the teal brand stands out; warm off-white ink `#ecebe6`.
- **Outlines** mid grey `#6d7681` (≥ 3.3:1 on every background) instead of near-white; **hard
  shadows** a dark grey ledge `#30363d`, depth without the white glow behind every button.
- **Chapter tints** in oklch at one lightness and chroma (`oklch(0.35 0.085 <hue>)`): eight clear
  jewel tones of equal weight instead of brown and olive; ink on them ≥ 8.9:1, muted ≥ 5.4:1.
  Strong shades (borders, link colors, cursors) stay the bright highlighter colors.
- **Soft tones** (brand, danger, success, warning) are the color mixed into the surface.
- New tokens used in both themes: `--selected` / `--selected-ink` for the chosen option in tabs,
  segmented controls and toolbars (light: ink on paper as before; dark: teal, not a white pill),
  and `--danger-ink` for text on danger buttons (dark: dark text on the light red, 7.4:1; it was
  white on light red, about 2.3:1).
- Light theme values are unchanged. Exports and PDFs stay light on purpose.

**Brightened (same day).** The owner wanted dark mode brighter and the logo unchanged:
- Paper `#1c2026`, surfaces `#262a31` / `#2e333b`, ink `#f4f3ee`, outlines `#8a939e` (≥ 4:1),
  shadows a near-black ledge `#0c0e11`; brand `#4fe3cf` with `#062a25` text (9.7:1).
- Chapter tints `oklch(0.42 0.1 <hue>)` (ink ≥ 7.1:1, muted ≥ 4.8:1), brighter strong shades,
  and a stronger region wash (`--region-mix`: 42% light, 62% dark).
- **The logo mark keeps its light-theme colors in both themes** (`Logo.tsx`, fixed colors, not
  theme tokens); only the wordmark follows the ink color so it stays readable.

### Canvas redesign (2026-11-01, steps 1-6)

Asked for by the owner after a real map came out as one long column of title-only cards.
- **Cards** show the summary always and the block's first formula first (KaTeX, scaled to fit);
  height follows the content (`layout.blockCard`).
- **Opening in place**: a click opens the block on the map (formulas first, then summary and
  details, Open / Edit); the cards around it slide (`expandedCard`, transitions on node
  transform and size, link paths follow). Double-click, Enter or Open shows the side panel.
- **Grouped columns**: a section's top-level blocks and their sub-blocks are split over up to 4
  balanced columns (`balancedColumns`), the section card centred above with a rail
  (`RailEdge`); process and timeline sections stay one ordered column.
- **Links colored by meaning**: cause coral, structure blue, contrast pink, learning order
  violet, loose teal (`visuals.relationColor`); the label always names the link.
- **Side panel** opens blocks as a study card (`panels/BlockReader.tsx`): formulas first,
  summary, details, sub-ideas and links as chips that fly to the block, flashcards, source text
  folded; Edit switches to the form.
- **Motion**: cards rise in, meaning links draw themselves, cards lift on hover; all off with
  reduced motion.
- `/dev/canvas` (development only) shows the real canvas with a sample map, no account.

### Motion system (2026-11-01, "lively")

The owner asked for more animation across the whole app (lively, keeping the neo-brutalist
style). Shared pieces live in `src/styles/index.css`:
- **Tokens**: `ease-spring` (slight overshoot, for things the student touches) and `ease-soft`
  (for things that appear); utilities `animate-rise`, `animate-pop`, `animate-fade`,
  `animate-wiggle`. Durations stay between 150 and 450 ms so studying never waits.
- **Patterns**: `.mynota-page` (a page rises in; the app shell keys it by the first path segment),
  `.mynota-stagger` (children rise one after another, capped at 350 ms), `.mynota-skeleton` /
  `<Skeleton>` (loading shimmer).
- **Components**: buttons lift with a spring and press flat; trailing icons lean forward on hover;
  every native `<dialog>` springs open and slips away on close (`@starting-style`, discrete
  transitions); toasts pop up, show a time-left bar and drop away; alerts rise in; inputs turn
  their border brand-colored on focus; nav items have colored icon tiles that wiggle on hover;
  count badges pop when the number changes.
- Animations fill **backwards only**, so no transform stays on an element after it ends.
- **Reduced motion** turns all of it off (global rule at the end of the stylesheet).
- **Workspace**: the details sheet slides in from its side and each opened block fades in; the
  outline drawer eases open and its chevrons turn; menus and link popovers pop; hint pills,
  notices and the toolbar rise in; a tool that is switched on pops its icon; "Saved" shows a
  check that pops.
- **Admin**: the open tab carries a brand bar, each tab page rises in, stats stagger in (links
  lift like buttons), the signups chart grows, table rows fade in and highlight on hover,
  skeletons while loading.

### Charcoal dark mode, bright colors, organic lines (2026-11-01)

Asked for by the owner: a charcoal background instead of near-black, brighter colored elements
(the contrast on them was too low), organic connection lines, smoother motion, and phones.
- **Charcoal**: paper `#25272b`, surfaces `#2e3136` / `#373a40`, ink `#f5f4ef`, outlines
  `#959ea8` (>= 4.2:1 on every background).
- **Bright colors**: chapter colors in dark mode are bright pastels (`oklch(0.82 0.11 <hue>)`).
  Every colored fill is a **light island**: a rule in `index.css` gives elements with an exact
  `bg-ch-*` class (or `.on-color`, for fills set by inline style) the light-theme text, line and
  surface values, so dark text sits on the bright color (>= 9.4:1). Washes behind light text
  use little color: `--region-mix` (map regions, 30% in dark), `--wash` / `--wash-strong`.
  Icons on a colored tile chosen by a variant use `text-on-color`.
- **Organic lines** (`canvas/organic.ts`): tree lines are smooth curves with a tapered, filled
  body (thick at the parent, thin at the child) and the thin centre line on top carrying the
  arrowhead. Every branch of one kind has the same number of points, so lines morph with the
  cards when the layout changes. Section → block branches sweep in the 30px gap above the
  blocks, then run down the gap beside the column and curl into each block.
- **Nearest sides and arrowheads** (same day, asked for by the owner): every tree line the AI
  builds joins its two cards at the nearest pair of side midpoints (top, right, bottom, left),
  skipping sides that face away and any curve that would run through another card or another
  section's colored area; it leaves and enters squarely, so arrowheads never kink at the card.
  Only when every pair is blocked does the line route around the column as before. Arrowheads
  are drawn by the line itself (a filled, slightly notched triangle, tip on the card's edge),
  not React Flow markers. The side choice is cached per node list and card positions, so
  panning never recomputes it.
- **One bend, no S** (2026-11-03, asked for by the owner): every map line bends one way only.
  A curve whose two handles turn opposite ways is an S; then its first handle moves onto the
  line from the second handle to the start (`oneBend` in `canvas/organic.ts`), so it leans out
  of its parent and still arrives squarely, arrowhead straight into the card. Applied to tree
  lines, their fallbacks and the labelled links; a blocked section line is a bracket that turns
  one way (out of the section's side, down the gap, into the card). Tested on 8,000 random
  side-to-side curves (`tests/unit/organic-edges.test.ts`). Tree-line outlines are sampled at
  20 points per curve for a smoother taper.
- **Smoother motion**: one ease-out curve (`--ease-soft`, quint) and a softer spring; cards glide
  480 ms and their lines morph in step (not while dragging); map camera moves use
  `camera(ms)` from `lib/motion.ts` (eased out, a little longer); no double-tap delay on
  touch controls.
- **Phones**: `cn` does not resolve conflicting classes, so hide things on small screens with
  a variant (`max-sm:hidden`), never a plain `hidden` next to a component's own `inline-flex`.
  The map header moves Export and Add notes into a "More actions" menu below 640px; auth
  links have 44px tap areas.

### Theme switch everywhere, short cards, folded sub-cards, reading order (2026-11-03)

- **Theme switch on every screen**: the map, a study session, a new map and a shared map have a
  one-tap light/dark button (`ThemeButton`: a moon in light mode, a sun in dark; on phones the
  map's More menu has it). **Shift+D** switches anywhere except while typing, with a short note
  (`useThemeShortcut`, mounted in `App`). Switching from "system" picks the opposite of what shows.
- **Short cards**: a card shows its title, its formula and at most two lines of summary. A click
  selects it and opens its details in the side panel; cards no longer grow in place, so the map
  keeps still.
- **Folded sub-cards**: a card with sub-cards has a tab in the bottom corner (clear of the link
  dot in the middle of the edge): "▾ 3" when folded, "▴" when open. Folding is kept per screen
  (`canvasUi.folds`, over the saved `collapsed`), so viewers can fold too. New AI maps start with
  sub-cards folded.
- **Reading order**: each section and card has a small number tag on its top edge ("2", "2.1",
  "2.1.1"; in a book, within the chapter) from `readingNumbers` in `canvas/layout.ts`. Process
  steps keep their step numbers instead.
