# Examples

Complete answers to copy the shape of. Each JSON block is what you pass to the tool, without the
`draft_id`, `chapter` and `section`. The topics are examples only: write yours from the source.

## An outline (`save_outline`)

The material has three headings, so it has three sections, in the same order.

```json outline
{
  "sections": [
    {
      "title": "Ohm's law",
      "summary": "How current depends on voltage and resistance.",
      "shape": "tree",
      "paragraphs": { "from": 1, "to": 1 },
      "subsections": []
    },
    {
      "title": "Circuits in series",
      "summary": "One path, so resistances add up.",
      "shape": "tree",
      "paragraphs": { "from": 2, "to": 2 },
      "subsections": []
    },
    {
      "title": "Building a parallel circuit",
      "summary": "Four ordered steps from battery to measurement.",
      "shape": "process",
      "paragraphs": { "from": 3, "to": 6 },
      "subsections": []
    }
  ]
}
```

## A section with a formula (`save_section`)

Source: P1 "Ohm's law: the current through a conductor is I = V/R ...", P2 "In a series circuit
the resistances add up, R = R1 + R2, and the same current flows everywhere. Two resistors in
series split the voltage (a voltage divider).", P3 "In a parallel circuit every branch gets the
full voltage; adding a branch lowers the total resistance."

```json section
{
  "blocks": [
    {
      "key": "b1",
      "parent": null,
      "title": "Ohm's law",
      "summary": "Current rises with voltage, falls with resistance.",
      "type": "formula",
      "importance": "core",
      "details": [
        { "kind": "formula", "text": "I = \\frac{V}{R}", "extra": "I = current; V = voltage; R = resistance" },
        { "kind": "bullet", "text": "Holds for ohmic conductors at constant temperature." }
      ],
      "source": [1],
      "added": false
    },
    {
      "key": "b2",
      "parent": null,
      "title": "Series circuits",
      "summary": "One path: resistances add up.",
      "type": "concept",
      "importance": "core",
      "details": [
        { "kind": "formula", "text": "R = R_{1} + R_{2}", "extra": "R = total resistance" },
        { "kind": "bullet", "text": "The same current flows through every part." }
      ],
      "source": [2],
      "added": false
    },
    {
      "key": "b3",
      "parent": "b2",
      "title": "Voltage divider",
      "summary": "Series resistors share the voltage.",
      "type": "example",
      "importance": "supporting",
      "details": [
        { "kind": "bullet", "text": "Each resistor takes a share of V in proportion to R." }
      ],
      "source": [2],
      "added": false
    },
    {
      "key": "b4",
      "parent": null,
      "title": "Parallel circuits",
      "summary": "Many paths, each with the full voltage.",
      "type": "concept",
      "importance": "supporting",
      "details": [
        { "kind": "bullet", "text": "Adding a branch lowers the total resistance." }
      ],
      "source": [3],
      "added": false
    }
  ],
  "relations": [
    { "from": "b1", "to": "b3", "type": "leads_to", "label": "sets each share" }
  ],
  "flashcards": [
    { "block": "b1", "front": "What does Ohm's law say?", "back": "I = V / R" }
  ]
}
```

Notice: four blocks, not ten. "Same current everywhere" is a bullet, not a block. The formula is
the first detail, and each equation appears once. There is one link, and its label says what it
gives. The summaries state what to remember.

## Arabic (`save_section`)

Source: P1 "البناء الضوئي عملية تصنع فيها النباتات غذاءها باستخدام ضوء الشمس. تحدث العملية في
البلاستيدات الخضراء التي تحتوي على الكلوروفيل." P2 "يمتص الكلوروفيل الضوء، ثم يتحد الماء مع ثاني
أكسيد الكربون لتكوين الجلوكوز، ويخرج الأكسجين."

```json section
{
  "blocks": [
    {
      "key": "b1",
      "parent": null,
      "title": "البناء الضوئي",
      "summary": "النبات يصنع غذاءه باستخدام ضوء الشمس.",
      "type": "definition",
      "importance": "core",
      "details": [
        { "kind": "bullet", "text": "تحدث في البلاستيدات الخضراء التي تحتوي على الكلوروفيل." }
      ],
      "source": [1],
      "added": false
    },
    {
      "key": "b2",
      "parent": null,
      "title": "نواتج العملية",
      "summary": "الماء وثاني أكسيد الكربون يكوّنان الجلوكوز والأكسجين.",
      "type": "concept",
      "importance": "supporting",
      "details": [
        { "kind": "bullet", "text": "يمتص الكلوروفيل الضوء أولًا." },
        { "kind": "bullet", "text": "يتحد الماء مع ثاني أكسيد الكربون لتكوين الجلوكوز." },
        { "kind": "bullet", "text": "يخرج الأكسجين." }
      ],
      "source": [2],
      "added": false
    }
  ],
  "relations": [],
  "flashcards": [
    { "block": "b1", "front": "أين يحدث البناء الضوئي؟", "back": "في البلاستيدات الخضراء." }
  ]
}
```

Notice: everything is in Arabic, never romanized, and the short steps are bullets. There are no
relations, because the tree already says it all.

## German vocabulary (`save_section`)

Source: P1 "Der Baum (Plural: die Bäume) wächst im Wald. Der Wald ist eine große Fläche mit vielen
Bäumen."

```json section
{
  "blocks": [
    {
      "key": "b1",
      "parent": null,
      "title": "Wörter zum Wald",
      "summary": "Zwei Grundwörter mit Artikel und Plural.",
      "type": "vocabulary",
      "importance": "core",
      "details": [
        { "kind": "vocab", "text": "Baum", "extra": "wächst im Wald", "article": "der", "plural": "die Bäume" },
        { "kind": "vocab", "text": "Wald", "extra": "große Fläche mit vielen Bäumen", "article": "der" }
      ],
      "source": [1],
      "added": false
    }
  ],
  "relations": [],
  "flashcards": [
    { "block": "b1", "front": "Wie lautet der Plural von Baum?", "back": "die Bäume" }
  ]
}
```

Notice: nouns keep their capital letters, and vocabulary entries carry the article and plural the
source gives. No plural is invented for "Wald", because the source does not give one.
