/**
 * Construction Engine — system library (spec §21).
 *
 * Each system carries the properties the rest of the app reasons with:
 * cost, speed, carbon, thermal, acoustic, fire, structure, span,
 * weight, complexity and availability. Scores are 0–100 unless noted.
 */

export const CONSTRUCTION_SYSTEMS = [
  {
    id: 'hsb',
    name: 'Timber frame (HSB)',
    short: 'Prefabricated timber stud walls with a lightweight floor system.',
    cost_factor: 1.0,
    speed: 85,
    carbon: 70,
    thermal: 80,
    acoustic: 55,
    fire: 60,
    structural: 65,
    max_span: 6.0,
    weight: 'light',
    complexity: 35,
    availability: 90,
    notes: 'Fast on site and thermally efficient. Long spans and heavy point loads need extra structure.'
  },
  {
    id: 'masonry',
    name: 'Masonry / calcium silicate + concrete floors',
    short: 'Load-bearing calcium silicate inner leaf, brick outer leaf, concrete floors.',
    cost_factor: 1.08,
    speed: 50,
    carbon: 35,
    thermal: 65,
    acoustic: 90,
    fire: 90,
    structural: 85,
    max_span: 7.2,
    weight: 'heavy',
    complexity: 45,
    availability: 95,
    notes: 'Robust, quiet and familiar to every Dutch contractor. Slower and heavier on the foundation.'
  },
  {
    id: 'concrete',
    name: 'Concrete structure',
    short: 'Cast or prefabricated concrete walls and floors.',
    cost_factor: 1.2,
    speed: 45,
    carbon: 20,
    thermal: 55,
    acoustic: 95,
    fire: 95,
    structural: 95,
    max_span: 9.0,
    weight: 'heavy',
    complexity: 60,
    availability: 85,
    notes: 'Enables large openings and cantilevers. Highest embodied carbon and cost.'
  },
  {
    id: 'clt',
    name: 'Timber / CLT',
    short: 'Cross-laminated timber panels, exposed or clad.',
    cost_factor: 1.22,
    speed: 90,
    carbon: 90,
    thermal: 78,
    acoustic: 60,
    fire: 70,
    structural: 80,
    max_span: 7.5,
    weight: 'light',
    complexity: 55,
    availability: 60,
    notes: 'Very fast erection and a low carbon footprint. Fewer contractors, so pricing varies.'
  },
  {
    id: 'hybrid',
    name: 'Hybrid (concrete base + timber upper)',
    short: 'Concrete ground floor and core with a timber-framed upper storey.',
    cost_factor: 1.12,
    speed: 65,
    carbon: 55,
    thermal: 75,
    acoustic: 75,
    fire: 80,
    structural: 88,
    max_span: 8.0,
    weight: 'medium',
    complexity: 65,
    availability: 70,
    notes: 'Buys open ground-floor spans without carrying concrete all the way up.'
  }
];

export function getSystem(id) {
  return CONSTRUCTION_SYSTEMS.find((s) => s.id === id) || CONSTRUCTION_SYSTEMS[0];
}

/**
 * Deterministic recommendation: score every system against the design
 * direction, the required span and the client's priorities.
 */
export function recommendSystem({ maxSpan = 5.5, dna = [], budgetPressure = 0.5, sustainability = 0.5 }) {
  const scored = CONSTRUCTION_SYSTEMS.map((s) => {
    let score = 50;
    if (s.max_span >= maxSpan) score += 20;
    else score -= (maxSpan - s.max_span) * 18;
    score += (s.availability - 70) * 0.2;
    score -= (s.cost_factor - 1) * 100 * budgetPressure * 1.4;
    score += (s.carbon - 50) * 0.3 * sustainability;
    if (dna.includes('light') && s.weight === 'light') score += 8;
    if (dna.includes('heavy') && s.weight === 'heavy') score += 8;
    if (dna.includes('natural') && (s.id === 'clt' || s.id === 'hsb')) score += 6;
    if (dna.includes('expressive') && s.structural > 85) score += 5;
    return { system: s, score: Math.round(score) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
