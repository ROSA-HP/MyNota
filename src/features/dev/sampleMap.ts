import { makeNode, makeRelation } from '@/ai/pipeline/convert'
import type { DetailBlock, MapRow, NodeRow, RelationRow } from '@/lib/database.types'

/**
 * A sample notes map (Physical Optics, the owner's own test topic) for the development canvas
 * playground and canvas tests: sections, nested blocks, formulas and relations, as a good AI
 * answer should look. Not used in production.
 */
export const SAMPLE_MAP_ID = '0d6c8f7e-1b2a-4c3d-9e8f-7a6b5c4d3e2f'

type Spec = {
  title: string
  summary: string
  type: NodeRow['type']
  importance?: NodeRow['importance']
  details?: DetailBlock[]
  children?: Spec[]
}

const f = (latex: string, variables?: string): DetailBlock => ({
  kind: 'formula',
  latex,
  variables,
})
const b = (text: string): DetailBlock => ({ kind: 'bullet', text })

const SECTIONS: Array<{ title: string; summary: string; blocks: Spec[] }> = [
  {
    title: 'Core Concepts',
    summary: 'What diffraction is and how resolution is limited',
    blocks: [
      {
        title: 'Diffraction',
        summary: 'Light spreads into shadow regions when the slit is about one wavelength wide.',
        type: 'definition',
        importance: 'core',
        details: [
          b('Happens when λ is comparable to or larger than the slit width'),
          b('A sign of the wave nature of light'),
        ],
        children: [
          {
            title: 'Fraunhofer Diffraction',
            summary: 'Pattern formed when rays leave the object in parallel directions.',
            type: 'concept',
            details: [b('Far-field case: screen far away or a lens focuses parallel rays')],
          },
        ],
      },
      {
        title: "Rayleigh's Criterion",
        summary:
          'Two images are just resolved when one maximum falls on the other’s first minimum.',
        type: 'definition',
        importance: 'core',
        details: [b('The limiting condition of resolution')],
      },
    ],
  },
  {
    title: 'Single-Slit Diffraction',
    summary: 'A broad central maximum with weaker bands around it',
    blocks: [
      {
        title: 'Single-Slit Pattern',
        summary: 'Broad bright centre, narrower secondary maxima and dark minima on each side.',
        type: 'concept',
        details: [
          b('Each part of the slit acts as its own source of waves'),
          b('These waves interfere'),
        ],
        children: [
          {
            title: 'Minima Condition',
            summary: 'Dark fringes where waves from the slit cancel out.',
            type: 'formula',
            importance: 'core',
            details: [
              f('\\sin\\theta_{dark} = m\\frac{\\lambda}{a}', 'm = ±1, ±2, ±3 …; a = slit width'),
            ],
          },
          {
            title: 'Intensity Formula',
            summary: 'How bright the pattern is at each angle.',
            type: 'formula',
            details: [
              f(
                'I = I_{max}\\left[\\frac{\\sin(\\pi a \\sin\\theta / \\lambda)}{\\pi a \\sin\\theta / \\lambda}\\right]^2',
                'I_max = intensity of the central maximum',
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Diffraction Gratings',
    summary: 'Many parallel slits give sharp bright lines',
    blocks: [
      {
        title: 'Diffraction Grating',
        summary: 'Parallel grooves on glass or a mirror act as many parallel light sources.',
        type: 'concept',
        details: [
          b('Transmission gratings: grooves on transparent glass'),
          b('Reflection gratings: grooves on reflective material'),
          b('Sharp principal maxima separated by broad dark areas'),
        ],
        children: [
          {
            title: 'Grating Maxima Condition',
            summary: 'Bright fringes where the path difference is a whole number of wavelengths.',
            type: 'formula',
            importance: 'core',
            details: [
              f(
                'd\\sin\\theta_{bright} = m\\lambda',
                'm = order number: 0, ±1, ±2 …; d = groove spacing',
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Resolution Limits',
    summary: 'The wave nature of light limits how close objects can be told apart',
    blocks: [
      {
        title: 'Limiting Angle (Slit)',
        summary: 'Smallest angle at which a slit can separate two sources.',
        type: 'formula',
        details: [f('\\theta_{min} = \\frac{\\lambda}{a}', 'in radians')],
      },
      {
        title: 'Limiting Angle (Circular Aperture)',
        summary: 'The same limit for a round opening such as a lens or the eye.',
        type: 'formula',
        importance: 'core',
        details: [f('\\theta_{min} = 1.22\\frac{\\lambda}{D}', 'D = diameter of the aperture')],
      },
    ],
  },
]

// As the AI returned the owner's real map: one section, nine blocks, no grouping. Tests that a
// flat list spreads over columns instead of one long line.
SECTIONS.push({
  title: 'Diffraction and Resolution (flat)',
  summary: 'Nine blocks without sub-blocks',
  blocks: [
    'Diffraction Definition',
    'Fraunhofer Pattern',
    'Single-Slit Pattern Shape',
    'Single-Slit Minima',
    'Single-Slit Intensity',
    'Diffraction Gratings Overview',
    'Grating Maxima',
    "Rayleigh's Limit",
    'Limiting Angle of Resolution',
  ].map((title, i) => ({
    title,
    summary: 'A short summary line about this idea from the notes.',
    type: i % 3 === 1 ? 'formula' : 'concept',
    importance: i % 2 ? 'core' : 'supporting',
    details: i % 3 === 1 ? [f('d\\sin\\theta = m\\lambda')] : [],
  })),
})

export function sampleMap(): { map: MapRow; nodes: NodeRow[]; relations: RelationRow[] } {
  const now = new Date().toISOString()
  const map = {
    id: SAMPLE_MAP_ID,
    owner_id: '',
    subject_id: null,
    type: 'notes',
    title: 'Physical Optics',
    cover_color: 'yellow',
    languages: ['en'],
    link_access: 'off',
    link_expires_at: null,
    created_at: now,
    updated_at: now,
  } as unknown as MapRow // only the fields the canvas reads
  const root = makeNode({
    map_id: SAMPLE_MAP_ID,
    level: 'chapter',
    title: 'Physical Optics',
    importance: 'core',
  })
  const nodes: NodeRow[] = [root]
  const byTitle = new Map<string, NodeRow>()
  const colors = ['yellow', 'sky', 'mint', 'lavender'] as const
  SECTIONS.forEach((s, i) => {
    const sec = makeNode({
      map_id: SAMPLE_MAP_ID,
      level: 'section',
      parent_id: root.id,
      sort_order: i,
      title: s.title,
      summary: s.summary,
      color: colors[i % colors.length],
    })
    nodes.push(sec)
    const add = (spec: Spec, parent: string, order: number) => {
      const n = makeNode({
        map_id: SAMPLE_MAP_ID,
        level: 'block',
        parent_id: parent,
        sort_order: order,
        title: spec.title,
        summary: spec.summary,
        type: spec.type,
        importance: spec.importance ?? 'supporting',
        details: spec.details ?? [],
      })
      nodes.push(n)
      byTitle.set(spec.title, n)
      spec.children?.forEach((c, j) => add(c, n.id, j))
    }
    s.blocks.forEach((spec, j) => add(spec, sec.id, j))
  })
  const rel = (from: string, to: string, type: RelationRow['type'], label: string) => {
    const a = byTitle.get(from)
    const z = byTitle.get(to)
    return a && z
      ? [makeRelation({ map_id: SAMPLE_MAP_ID, from_node: a.id, to_node: z.id, type, label })]
      : []
  }
  const relations = [
    ...rel('Single-Slit Pattern', 'Diffraction', 'example_of', 'case of'),
    ...rel('Diffraction Grating', 'Diffraction', 'example_of', 'case of'),
    ...rel("Rayleigh's Criterion", 'Limiting Angle (Circular Aperture)', 'leads_to', 'sets'),
    ...rel('Minima Condition', 'Limiting Angle (Slit)', 'leads_to', 'gives'),
  ]
  return { map, nodes, relations }
}
