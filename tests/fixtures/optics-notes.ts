/**
 * The owner's "Physical Optics" notes (2026-11-01), exactly as pasted, and a details reply shaped
 * like the map that came back: equations copied onto many blocks, three equations missing.
 */
export const OPTICS_NOTES = String.raw`Physical Optics & Diffraction
Core Concepts

* Diffraction: The phenomenon where light spreads beyond a narrow path into shadow regions when the wavelength is comparable to or larger than the slit width.
* Fraunhofer Diffraction: A diffraction pattern that occurs when light rays leave the diffracting object in parallel directions.
* Rayleigh's Criterion: The limiting condition of resolution, occurring when the central maximum of one image falls exactly on the first minimum of another.

Single-Slit Diffraction

* The pattern consists of a broad, intense central maximum.
* The central maximum is flanked by narrower secondary maxima (bright bands) and minima (dark bands).
* Each portion of the slit acts as a separate light wave source, causing interference.
* Condition for minima (destructive interference): $\sin\theta_{dark} = m\frac{\lambda}{a}$.
* In this equation, $m = \pm1, \pm2, \pm3...$ and $a$ represents the slit width.
* Intensity equation: $I = I_{max}\left[\frac{\sin(\pi a \sin\theta / \lambda)}{\pi a \sin\theta / \lambda}\right]^2$.

Diffraction Gratings

* Gratings act as parallel light sources, created via parallel grooves on transparent glass (transmission) or reflective materials (reflection).
* Gratings produce sharp principal maxima separated by broad dark areas.
* Condition for maxima (bright fringes): $d\sin\theta_{bright} = m\lambda$.
* In this equation, the integer $m$ represents the order number of the pattern ($0, \pm1, \pm2...$).

Resolution Limits

* The wave nature of light limits an optical system's ability to distinguish closely spaced objects.
* Limiting angle of resolution for a slit (in radians): $\theta_{min} = \frac{\lambda}{a}$.
* Limiting angle of resolution for a circular aperture: $\theta_{min} = 1.22\frac{\lambda}{D}$ (where $D$ is the diameter of the aperture).`

export const DARK = String.raw`\sin\theta_{dark} = m\frac{\lambda}{a}`
export const INTENSITY = String.raw`I = I_{max}\left[\frac{\sin(\pi a \sin\theta / \lambda)}{\pi a \sin\theta / \lambda}\right]^2`

const block = (
  key: string,
  title: string,
  type: 'concept' | 'formula',
  formula: string | null,
  source: number[],
  parent: string | null = null,
) => ({
  key,
  parent,
  title,
  summary: title,
  type,
  importance: 'core' as const,
  details: [
    ...(formula ? [{ kind: 'formula' as const, text: formula }] : []),
    { kind: 'bullet' as const, text: `About ${title.toLowerCase()}.` },
  ],
  source,
  added: false,
})

/** The reply behind the owner's screenshot (one section, nine blocks). */
export function screenshotReply(p: {
  core: number
  slit: number
  gratings: number
  resolution: number
}) {
  return {
    blocks: [
      block('b1', 'Diffraction Definition', 'concept', DARK, [p.core, p.slit]),
      block('b2', 'Fraunhofer Diffraction', 'concept', DARK, [p.core, p.slit], 'b1'),
      block('b3', 'Single-Slit Diffraction Pattern', 'concept', DARK, [p.slit]),
      block('b4', 'Single-Slit Minima Condition', 'formula', DARK, [p.slit], 'b3'),
      block('b5', 'Single-Slit Intensity Equation', 'formula', INTENSITY, [p.slit]),
      block('b6', 'Diffraction Gratings Structure', 'concept', INTENSITY, [p.gratings], 'b5'),
      block('b7', 'Grating Maxima Condition', 'formula', INTENSITY, [p.gratings]),
      block('b8', 'Rayleigh’s Criterion', 'concept', DARK, [p.core, p.resolution], 'b7'),
      block('b9', 'Limiting Angles of Resolution', 'formula', INTENSITY, [p.resolution], 'b7'),
    ],
    relations: [],
    flashcards: [],
  }
}
