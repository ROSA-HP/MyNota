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
- In Arabic UI, the default map layout grows right-to-left.

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
