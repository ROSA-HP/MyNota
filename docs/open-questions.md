# Open questions

Ask the user about each item when the work reaches it. Move answered items into the relevant doc.

| Question | Needed by |
|---|---|
| Final brand color and logo for MyNota | Phase 7 branding (decided 2026-10-30: keep teal `#0D9488` and the temporary logo until then) |
| Hosting for the web app (Vercel, Netlify, Cloudflare Pages) | Before the first deploy (still open after Phase 2) |
| Layout engine: Phase 2 uses a small custom top-down layout instead of ELK.js (ELK can't stack a section's blocks in a column under it without heavy tuning). Keep it, and bring in ELK for Phase 3's book maps / alternative styles? | Phase 3 (awaiting approval) |
| Visual mockups of home and study session | Before Phase 4 UI work |
| Which providers block direct browser calls, and is a pass-through Edge Function needed for them? | Phase 3 |
| Storage quota per user (MB, number of maps) | Phase 3 |
| Yjs sync: Supabase Realtime or a dedicated sync server? Decide in a technical spike | Before Phase 6 |
