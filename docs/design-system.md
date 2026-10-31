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

The owner found the dark theme poor; it was an inverted light theme. Now (tokens in
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
