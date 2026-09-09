/**
 * Design Directions (spec §15) and Design DNA (spec §16).
 *
 * A direction is a strategy, not a picture. It carries the DNA that
 * steers massing, glazing and construction downstream, plus the honest
 * list of what it costs you.
 */

export const DNA_DESCRIPTORS = [
  'compact', 'open', 'private', 'horizontal', 'vertical', 'heavy',
  'light', 'natural', 'minimal', 'expressive', 'traditional', 'contemporary'
];

/**
 * The library of directions. Each one is a parametric recipe:
 * area_factor scales the target program, glazing_ratio drives the
 * envelope engine, footprint_ratio and floors_bias drive massing.
 */
const DIRECTION_LIBRARY = [
  {
    id: 'compact',
    name: 'Compact',
    subtitle: 'Efficient & elegant',
    description: 'A smart and efficient design with a strong spatial quality. Ideal for a balanced budget.',
    dna: ['compact', 'minimal', 'contemporary', 'light'],
    area_factor: 0.9,
    glazing_ratio: 0.22,
    footprint_ratio: 0.55,
    floors_bias: 2,
    roof: 'flat',
    complexity: 25,
    advantages: ['Efficient footprint', 'Lower construction costs', 'Surprisingly spacious', 'Fits well within zoning rules'],
    disadvantages: ['Less generous circulation', 'Fewer oversized rooms'],
    risks: ['Storage can become tight if the program grows later']
  },
  {
    id: 'garden',
    name: 'Garden',
    subtitle: 'Open & connected',
    description: 'A horizontal volume that opens fully to the garden, with living spaces along the south facade.',
    dna: ['open', 'horizontal', 'light', 'contemporary'],
    area_factor: 1.05,
    glazing_ratio: 0.38,
    footprint_ratio: 0.78,
    floors_bias: 1.4,
    roof: 'flat',
    complexity: 45,
    advantages: ['Strong garden connection', 'Excellent daylight', 'Living spaces on one level'],
    disadvantages: ['Larger footprint uses more of the plot', 'Glazing raises cost and solar load'],
    risks: ['Summer overheating without shading', 'Build coverage may approach the zoning limit']
  },
  {
    id: 'courtyard',
    name: 'Courtyard',
    subtitle: 'Private & peaceful',
    description: 'The volume wraps an outdoor room, giving privacy on an exposed plot without closing off the light.',
    dna: ['private', 'horizontal', 'natural', 'expressive'],
    area_factor: 1.0,
    glazing_ratio: 0.34,
    footprint_ratio: 0.85,
    floors_bias: 1.2,
    roof: 'flat',
    courtyard: true,
    complexity: 65,
    advantages: ['Privacy on all sides', 'Sheltered outdoor space', 'Daylight from two directions in every room'],
    disadvantages: ['More facade per m² of floor area', 'Higher construction cost'],
    risks: ['Detailing around the courtyard corners is unforgiving', 'Large footprint on a small plot']
  },
  {
    id: 'stacked',
    name: 'Stacked',
    subtitle: 'Vertical & compact',
    description: 'A small footprint stacked over three levels, leaving the maximum amount of plot as garden.',
    dna: ['vertical', 'compact', 'contemporary', 'minimal'],
    area_factor: 0.98,
    glazing_ratio: 0.26,
    footprint_ratio: 0.42,
    floors_bias: 2.8,
    roof: 'flat',
    complexity: 50,
    advantages: ['Largest remaining garden', 'Small foundation area', 'Views from the upper level'],
    disadvantages: ['More stairs in daily use', 'Circulation costs floor area on every level'],
    risks: ['Height may exceed the local maximum', 'Less suitable for ageing in place']
  },
  {
    id: 'spacious',
    name: 'Spacious',
    subtitle: 'Generous & calm',
    description: 'Larger rooms and higher ceilings throughout, accepting a higher cost for a more generous house.',
    dna: ['open', 'horizontal', 'expressive', 'contemporary'],
    area_factor: 1.22,
    glazing_ratio: 0.32,
    footprint_ratio: 0.72,
    floors_bias: 1.8,
    roof: 'flat',
    complexity: 40,
    advantages: ['Generous room sizes', 'Higher ceilings', 'Room for the program to grow'],
    disadvantages: ['Clearly the most expensive direction', 'Higher energy demand'],
    risks: ['Likely to exceed a tight construction budget']
  },
  {
    id: 'traditional',
    name: 'Pitched',
    subtitle: 'Familiar & robust',
    description: 'A conventional gable-roofed volume: the most predictable to price, permit and build.',
    dna: ['traditional', 'heavy', 'compact'],
    area_factor: 0.95,
    glazing_ratio: 0.2,
    footprint_ratio: 0.6,
    floors_bias: 1.8,
    roof: 'gable',
    complexity: 20,
    advantages: ['Easiest to permit', 'Every contractor can price it', 'Usable roof volume'],
    disadvantages: ['Less spatial drama', 'Roof storey has sloping walls'],
    risks: ['Roof storey area counts differently in some municipalities']
  }
];

/**
 * Select 3–5 directions that genuinely make sense for this project.
 * Deterministic: the same inputs always produce the same set and order.
 */
export function generateDirections(context) {
  const {
    plot_area = 500,
    budget_pressure = 0.5,   // 0 = comfortable, 1 = very tight
    max_floors = 2,
    privacy_need = 0.4,
    garden_priority = 0.5,
    single_storey = false
  } = context;

  const scored = DIRECTION_LIBRARY.map((d) => {
    let score = 50;

    // Budget pressure pushes towards efficient directions.
    score -= (d.area_factor - 1) * 100 * budget_pressure * 1.1;
    score -= (d.complexity - 35) * 0.35 * budget_pressure;

    // Plot size gates the footprint-hungry directions.
    const neededFootprint = plot_area * 0.3 * d.footprint_ratio;
    if (plot_area < 350 && d.footprint_ratio > 0.75) score -= 22;
    if (plot_area > 700 && d.footprint_ratio > 0.7) score += 8;
    if (neededFootprint < 40) score -= 10;

    // Height limits gate the stacked direction.
    if (d.floors_bias > max_floors + 0.5) score -= 30;
    if (single_storey && d.floors_bias > 1.5) score -= 40;
    if (single_storey && d.floors_bias <= 1.5) score += 15;

    // Client priorities.
    score += privacy_need * (d.dna.includes('private') ? 22 : 0);
    score += garden_priority * (d.dna.includes('open') ? 16 : 0);
    score -= privacy_need * (d.glazing_ratio > 0.35 ? 8 : 0);

    return { ...d, score: Math.round(score) };
  });

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Always present a spread, never three variations of the same idea:
  // take the best, then prefer directions with different DNA.
  const chosen = [scored[0]];
  for (const cand of scored.slice(1)) {
    if (chosen.length >= 3) break;
    const overlap = chosen.some((c) => sharedDna(c.dna, cand.dna) >= 3);
    if (!overlap) chosen.push(cand);
  }
  // Fill up to three if the DNA filter was too strict.
  for (const cand of scored.slice(1)) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(cand)) chosen.push(cand);
  }
  return chosen;
}

function sharedDna(a, b) {
  return a.filter((x) => b.includes(x)).length;
}

export function getDirection(id) {
  return DIRECTION_LIBRARY.find((d) => d.id === id) || DIRECTION_LIBRARY[0];
}

export { DIRECTION_LIBRARY };
