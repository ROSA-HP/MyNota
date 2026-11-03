import { OPTICS_NOTES } from './optics-notes'

/**
 * Varied notes for the mapping-integrity tests (2026-11-03): different subjects, languages and
 * shapes of text (bullets with blank lines, lines without blank lines, one long pasted block,
 * Unicode and LaTeX formulas, a timeline with dates that are not formulas).
 */
export interface MappingInput {
  name: string
  lang: 'en' | 'ar' | 'de'
  text: string
  /** Equations that must end up on the map, as the formula net finds them. */
  equations: number
}

export const INPUTS: MappingInput[] = [
  { name: 'physical optics (LaTeX, bullets)', lang: 'en', text: OPTICS_NOTES, equations: 5 },
  {
    name: 'chemistry (Unicode formulas, no blank lines)',
    lang: 'en',
    equations: 4,
    text: `Thermodynamics of Reactions
Gibbs free energy decides whether a reaction happens on its own.
The relation is ΔG = ΔH − TΔS where T is the absolute temperature.
A negative free energy change means the reaction is spontaneous.
Ideal Gases
Gas particles move randomly and collide elastically with the container walls.
The ideal gas law is PV = nRT for a fixed amount of gas.
Real gases deviate at high pressure and low temperature.
Acids and Bases
Acidity is measured on a logarithmic scale from zero to fourteen.
pH = −log[H⁺] gives the acidity of a solution.
Pure water at room temperature has pH = 7, which is neutral.
Buffers resist changes in acidity when small amounts of acid are added.
Kinetics
The rate constant follows the Arrhenius equation k = A·e^(−Ea/RT) for most reactions.
Catalysts lower the activation energy without being consumed.`,
  },
  {
    name: 'history timeline (dates, no formulas)',
    lang: 'en',
    equations: 0,
    text: `The French Revolution

1789: The Estates-General meets in Versailles and the Third Estate forms the National Assembly.

1789: Parisians storm the Bastille fortress on the fourteenth of July.

1792: The monarchy is abolished and France becomes a republic.

1793–1794: The Reign of Terror executes thousands of suspected enemies of the revolution.

1799: Napoleon Bonaparte seizes power in the coup of eighteen Brumaire.

Causes

* Heavy taxation burdened the common people while the nobility paid little.
* Enlightenment ideas questioned the divine right of kings.
* Bread prices rose sharply after poor harvests.`,
  },
  {
    name: 'Arabic biology with a formula',
    lang: 'ar',
    equations: 1,
    text: `الخلية

* الخلية هي الوحدة الأساسية لبناء جميع الكائنات الحية.
* تحتوي الخلية النباتية على جدار خلوي وبلاستيدات خضراء.
* تحتوي الخلية الحيوانية على غشاء خلوي مرن دون جدار.

البناء الضوئي

* تصنع النباتات غذاءها باستخدام ضوء الشمس والماء وثاني أكسيد الكربون.
* المعادلة العامة: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂ ويمكن كتابة النسبة n = m/M لحساب عدد المولات.
* يحدث البناء الضوئي داخل البلاستيدات الخضراء في أوراق النبات.`,
  },
  {
    name: 'German physics with E = mc²',
    lang: 'de',
    equations: 2,
    text: `Relativitätstheorie

* Die Lichtgeschwindigkeit ist in jedem Bezugssystem gleich groß.
* Masse und Energie sind äquivalent: E = mc² verbindet beide Größen.
* Bewegte Uhren laufen langsamer, dieser Effekt heißt Zeitdilatation.

Kraft und Bewegung

* Das zweite newtonsche Gesetz lautet F = m·a für konstante Masse.
* Die Trägheit beschreibt den Widerstand eines Körpers gegen Bewegungsänderungen.`,
  },
  {
    name: 'one long pasted block (PDF copy)',
    lang: 'en',
    equations: 1,
    text:
      'Photosynthesis converts light energy into chemical energy stored in glucose molecules. ' +
      'It takes place in the chloroplasts, which contain the green pigment chlorophyll. ' +
      'The light-dependent reactions occur in the thylakoid membranes and produce ATP and NADPH. ' +
      'Water molecules are split during these reactions, releasing oxygen as a by-product. ' +
      'The Calvin cycle takes place in the stroma and uses carbon dioxide to build sugars. ' +
      'The enzyme RuBisCO fixes carbon dioxide onto ribulose bisphosphate. ' +
      'The overall efficiency can be written as η = E_out / E_in for the captured light. ' +
      'Plants in hot climates use C4 or CAM pathways to reduce water loss. ' +
      'Stomata open and close to balance gas exchange against transpiration. ' +
      'Light intensity, temperature and carbon dioxide concentration all limit the rate. ' +
      'Each factor can become the limiting factor depending on the conditions. ' +
      'Without photosynthesis, almost all food chains on Earth would collapse.',
  },
]
