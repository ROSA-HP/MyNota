# Mapping rules

These are the rules MyNota's own build follows (prompts `outline.v2` and `details.v6`). The tools
enforce the hard limits and report the rest. The reasons are given so you can use judgment when a
source does not fit neatly.

## Outline (`save_outline`)

- **Headings first.** When the material has headings, make one section per heading, in the same
  order, using the heading as the title (shortened to 2-6 words if needed). Students recognise
  their own book's structure. Merge a heading into the next only when it has a single short point.
- **Without headings**, follow the logical structure of the content.
- 3 to 7 sections when the material allows it (7 is the hard limit); very short material may have
  fewer.
- Title: 2-6 words, no full sentences. Summary: one line, at most 15 words.
- Each section gives its paragraph range. Every paragraph belongs to exactly one section; a heading
  paragraph belongs to the section it names. Ranges must not overlap.
- `subsections` are optional orientation for you. They are not stored as nodes.

### Shapes

Choose the shape that matches how the content really behaves. It changes how the section is drawn.

| Shape | Use when |
|---|---|
| process | 3 or more ordered steps |
| timeline | 3 or more items with dates |
| comparison | 2-4 parallel items sharing the same attributes |
| cause_effect | A chain of causes and results |
| tree | Everything else |

## Blocks (`save_section`)

### Structure: simple for the reader

- **3 to 6 main ideas**: the top-level blocks (`parent: null`). Each has at most 4 sub-blocks, and
  a sub-block has no sub-blocks of its own unless that is essential.
- **A small point is a bullet, not a block.** A fact, a property, a number or one item of a list
  goes inside the block it belongs to. Give a point its own block only when it needs its own
  explanation. Blocks that are too small get folded into their parent anyway.
- About 6 to 14 blocks for a section; fewer when the section is short.
- Order blocks the way a student should read them: basics first, then what builds on them. List
  parents before their children.
- A process or a timeline keeps its steps or events in order at the top level (more than 6 is
  fine there). In a process, order blocks as steps; in a timeline every block needs a date; in a
  comparison every compared item uses the same attributes.
- Do not make blocks for ideas that belong to another section. If this section only mentions one,
  a short bullet is enough.

Hard limits: 40 blocks per section, 7 children per block, 12 details per block.

### Each block

- `key`: short and unique in the section (`b1`, `b2`, ...).
- `title`: 2-5 words, naming the idea.
- `summary`: one line, at most 10 words. The card shows only the title, the formula and this line,
  and everything else opens on click, so write the thing to remember ("Current rises with voltage,
  falls with resistance"), never a description of the block ("This explains Ohm's law").
- `type`: see below.
- `importance`: `core`, `supporting` or `extra`. About a third are core: what a student cannot
  understand the rest without. If everything is core, nothing stands out.
- `details`: short bullets. Use the source's own terms.
- `source`: the paragraph numbers this block comes from, as integers (P7 is 7), inside this
  section. Every block cites its paragraphs; this is what lets a student check it against the book.
- `added`: `true` only if you included something not in the source, with `added_reason`. Never
  invent facts. If the source is unclear, keep it unclear and say so.
- `parent`: the key of the main idea it explains, or `null`.

### Block types

| Type | Use when |
|---|---|
| definition | The text defines or names a term |
| concept | A main idea that needs explaining |
| process_step | Part of an ordered sequence |
| event | Something tied to a date or period |
| person | A person and their contribution |
| formula | An equation or rule with variables |
| example | A concrete illustration of another block |
| comparison | Two or more things contrasted |
| key_fact | A number, rule, or fact to memorize |
| warning | A common mistake, exception, or caution |
| vocabulary | A term to learn, with meaning and translation |

### Details

Each detail is `{"kind", "text"}`, with an optional `"extra"`:

| kind | text | extra |
|---|---|---|
| bullet | One short point | |
| text | A short plain sentence | |
| example | The example | Its translation, if any |
| vocab | The term | Its meaning. May add `article` and `plural` |
| formula | The formula, in LaTeX | What every symbol means |
| question | A question | Its answer |
| cloze | A sentence with the gap as `{{word}}` | |

### Formulas: each one exactly once, none left out

Models lose formulas more than anything else, and a map without its equations is useless for a
science student.

- Every equation in the paragraphs becomes a formula detail in exactly **one** block: the block
  about that equation. An equation is anything with =, ≈, ≤, ≥ or ∝ between symbols, whether plain
  text, Unicode symbols (θ, λ, ², ₀) or LaTeX. Plain values such as m = ±1 are not formulas.
- Never copy an equation onto a second block: a card shows its first formula, so a copy hides the
  right one. If a block in another branch applies it, link **from** the formula block **to** that
  block (`leads_to`), with a label saying what the equation gives there ("sets dark fringes").
- A block's formula must be its own: a grating block shows the grating equation, never the
  single-slit one.
- Never write an equation only inside a bullet, summary or title. A bullet may explain it; the
  formula detail holds it.
- A block about an equation, law or condition has type `formula`. Its **first** detail is the
  formula, with every symbol explained in `extra` ("m = order number; a = slit width").
- Write valid KaTeX: `\frac{a}{b}`, `\sin\theta`, `\lambda`, subscripts and superscripts in braces
  (`\theta_{min}`, `x^{2}`). One formula per detail.
- **In JSON every backslash is written twice**: `"text": "a\\sin\\theta = m\\lambda"`. A single
  backslash silently turns `\theta` into a tab and `\frac` into a form feed.

### Relations: few, and each one worth an arrow

Every relation is an arrow a student has to read, so each must teach something the tree does not.

- At most 3 per section, and none when the tree already says it all.
- Good reasons: a formula block `leads_to` a block in another branch that applies it, a cause
  `causes` its effect in another branch, one idea is a `prerequisite` of another, `contrasts_with`
  for opposites, a special case is an `example_of`.
- Never link a parent and child, a block and anything under it, or two blocks that are simply side
  by side. Never use `related`.
- `type` is one of: causes, leads_to, part_of, example_of, contrasts_with, prerequisite, analogy,
  derived_from, related.
- `label`: 2-4 specific words in the block's language, saying what flows along the arrow: "sets
  dark fringes", "limits resolution", "raises the pressure". Never a vague label ("related", "see
  also", "linked", or the type's own words).

### Flashcards

Make cards for definitions, key facts, formulas and vocabulary: `{"block", "front", "back"}`, using
the block's key. The front is a question or a term; the back is a short answer. Ask what a student
would really be tested on, in a way that makes them recall it, not a yes-or-no question.

## Language

- Write everything in the source's language, unless the draft has an `explanation_language`: then
  titles stay in the source language and summaries and details use the other.
- **Arabic**: keep diacritics where the source has them; never romanize.
- **German**: keep noun capitalization; vocabulary entries include article and plural (der Baum,
  die Bäume).
- Mixed-language notes: keep each part in its own language.

## Notes mode

Used when the material is someone's own lecture notes: possibly out of order, repetitive, with
abbreviations and gaps.

- Keep their headings as sections. Without headings, create clear section titles and group by
  topic; ranges stay consecutive, so a section may be broad when the notes jump around.
- Fix the order: arrange blocks in a logical teaching order, not the order they were written.
- Merge repeated points into one block that cites all of their paragraphs.
- Expand abbreviations only when the meaning is certain.
- Fill gaps only as clearly marked additions: `added: true` with a short `added_reason`.

## Detail levels

- **brief**: only the essential blocks, 1-3 short bullets each.
- **standard**: the rules above.
- **detailed**: cover every point in the source, still with short bullets.

## Links between sections or chapters (`save_links`)

Use the refs from `list_blocks`. Find what a good teacher would point out across parts of the book:
one concept causes another, one is a prerequisite for another, two are easily confused, one is an
example of another. Only links that really help understanding. Each has a `type`, a 2-4 word
`label` and a `confidence` of `high` or `medium`; skip anything lower.

## Self-check before every `save_section`

1. Every point in the section's paragraphs is in a block's title, summary or bullets.
2. Every equation is a formula detail exactly once, first in its block.
3. 3-6 main blocks, at most 4 sub-blocks each, small points are bullets.
4. Titles 2-5 words, summaries at most 10 words.
5. At most 3 relations, none vague, none between a parent and its child.
6. No block repeats an idea that belongs to another section.
