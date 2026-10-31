# Project skills for Claude Code

Installed 2026-10-31 at the owner's request, to guide UI work on MyNota. Claude Code loads every
folder here as a skill. Both are MIT-licensed (their `LICENSE` files are kept beside them).

| Skill | Source | Commit |
|---|---|---|
| `ui-ux-pro-max` | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (`.claude/skills/ui-ux-pro-max`) | 9a3f14f |
| `taste-skill` (`design-taste-frontend`) | https://github.com/Leonxlnx/taste-skill (`skills/taste-skill`, without `evals/`) | 12af471 |

How MyNota uses them (see `docs/design-system.md` › "Design review rules"):
- MyNota is an app, so taste-skill's **app-screen** rules (`references/app-screens.md`) apply, not
  its landing-page run.
- ui-ux-pro-max: its accessibility, touch, typography and forms rules, and
  `scripts/search.py "<query>" --domain ux|typography|color|chart` for focused questions.
- Where a rule conflicts with MyNota's decided neo-brutalist notebook style (`CLAUDE.md`), the
  project decision wins unless the owner changes it.

To update: copy the skill folder again from its repository and change the commit above.
