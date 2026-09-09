/**
 * Planning / Regulatory Engine — rule store (spec §10).
 *
 * Rules live as structured data, never inside prompts or model weights.
 * The assistant may explain a rule, cite it and show its confidence,
 * but it may never invent one: everything the app asserts about
 * regulations comes from this file.
 *
 * Rule shape:
 *   rule_id, jurisdiction, source, category, description,
 *   condition, parameter, value, unit, confidence,
 *   effective_from, effective_until
 *
 * The values below are INDICATIVE DEMO DATA for a generic Dutch
 * residential plot. They are not a substitute for the actual
 * bestemmingsplan / omgevingsplan of a specific address.
 */

export const RULES = [
  {
    rule_id: 'NL-GEN-HEIGHT-01',
    jurisdiction: 'NL / generic residential',
    source: 'Indicative model ruleset (demo data)',
    category: 'height',
    description: 'Maximum building height for a detached dwelling in a residential zone.',
    condition: { zoning: 'residential', building_type: ['detached_house', 'extension'] },
    parameter: 'max_building_height',
    value: 9,
    unit: 'm',
    confidence: 0.55,
    effective_from: '2024-01-01',
    effective_until: null
  },
  {
    rule_id: 'NL-GEN-EAVES-01',
    jurisdiction: 'NL / generic residential',
    source: 'Indicative model ruleset (demo data)',
    category: 'height',
    description: 'Maximum eaves height before the roof plane must start.',
    condition: { zoning: 'residential' },
    parameter: 'max_eaves_height',
    value: 6,
    unit: 'm',
    confidence: 0.5,
    effective_from: '2024-01-01',
    effective_until: null
  },
  {
    rule_id: 'NL-GEN-COVER-01',
    jurisdiction: 'NL / generic residential',
    source: 'Indicative model ruleset (demo data)',
    category: 'coverage',
    description: 'Maximum share of the plot that may be built on.',
    condition: { zoning: 'residential' },
    parameter: 'max_build_coverage',
    value: 0.3,
    unit: 'ratio',
    confidence: 0.5,
    effective_from: '2024-01-01',
    effective_until: null
  },
  {
    rule_id: 'NL-GEN-SETBACK-FRONT-01',
    jurisdiction: 'NL / generic residential',
    source: 'Indicative model ruleset (demo data)',
    category: 'setback',
    description: 'Minimum distance between the front facade and the plot boundary at the street.',
    condition: { zoning: 'residential' },
    parameter: 'setback_front',
    value: 5,
    unit: 'm',
    confidence: 0.45,
    effective_from: '2024-01-01',
    effective_until: null
  },
  {
    rule_id: 'NL-GEN-SETBACK-SIDE-01',
    jurisdiction: 'NL / generic residential',
    source: 'Indicative model ruleset (demo data)',
    category: 'setback',
    description: 'Minimum distance between a side facade and the side plot boundary.',
    condition: { zoning: 'residential' },
    parameter: 'setback_side',
    value: 3,
    unit: 'm',
    confidence: 0.45,
    effective_from: '2024-01-01',
    effective_until: null
  },
  {
    rule_id: 'NL-GEN-SETBACK-REAR-01',
    jurisdiction: 'NL / generic residential',
    source: 'Indicative model ruleset (demo data)',
    category: 'setback',
    description: 'Minimum distance between the rear facade and the rear plot boundary.',
    condition: { zoning: 'residential' },
    parameter: 'setback_rear',
    value: 8,
    unit: 'm',
    confidence: 0.4,
    effective_from: '2024-01-01',
    effective_until: null
  },
  {
    rule_id: 'NL-GEN-FLOORS-01',
    jurisdiction: 'NL / generic residential',
    source: 'Indicative model ruleset (demo data)',
    category: 'massing',
    description: 'Maximum number of full storeys, excluding a roof storey.',
    condition: { zoning: 'residential' },
    parameter: 'max_floors',
    value: 2,
    unit: 'count',
    confidence: 0.5,
    effective_from: '2024-01-01',
    effective_until: null
  },
  {
    rule_id: 'NL-BBL-CEILING-01',
    jurisdiction: 'NL / national',
    source: 'Besluit bouwwerken leefomgeving — indicative interpretation',
    category: 'building_code',
    description: 'Minimum clear ceiling height in a habitable room of a new dwelling.',
    condition: { building_type: ['detached_house', 'extension', 'apartment_conversion'] },
    parameter: 'min_ceiling_height',
    value: 2.6,
    unit: 'm',
    confidence: 0.7,
    effective_from: '2024-01-01',
    effective_until: null
  },
  {
    rule_id: 'NL-BBL-DAYLIGHT-01',
    jurisdiction: 'NL / national',
    source: 'Besluit bouwwerken leefomgeving — indicative interpretation',
    category: 'building_code',
    description: 'Indicative minimum daylight opening as a share of the floor area of a habitable room.',
    condition: { building_type: ['detached_house', 'extension'] },
    parameter: 'min_daylight_ratio',
    value: 0.1,
    unit: 'ratio',
    confidence: 0.6,
    effective_from: '2024-01-01',
    effective_until: null
  },
  {
    rule_id: 'NL-GEN-OUTBUILDING-01',
    jurisdiction: 'NL / generic residential',
    source: 'Indicative model ruleset (demo data)',
    category: 'coverage',
    description: 'Maximum total footprint of outbuildings on a residential plot.',
    condition: { building_type: ['outbuilding'] },
    parameter: 'max_outbuilding_footprint',
    value: 75,
    unit: 'm2',
    confidence: 0.4,
    effective_from: '2024-01-01',
    effective_until: null
  }
];

/** True when a rule's condition matches the given site/project context. */
function matches(rule, context) {
  const c = rule.condition || {};
  if (c.zoning && c.zoning !== context.zoning) return false;
  if (c.building_type && !c.building_type.includes(context.building_type)) return false;
  return true;
}

/**
 * Resolve the rules that apply to a project context into a flat
 * constraint set. Every constraint keeps a reference back to the rule
 * it came from, so the UI can always answer "why?".
 */
export function resolveConstraints(context) {
  const applicable = RULES.filter((r) => matches(r, context));
  const constraints = {};
  for (const rule of applicable) {
    constraints[rule.parameter] = {
      value: rule.value,
      unit: rule.unit,
      confidence: rule.confidence,
      rule_id: rule.rule_id,
      source: rule.source,
      description: rule.description
    };
  }
  return { constraints, applicable };
}

/** Convenience accessor with an explicit fallback, so a missing rule is visible. */
export function constraintValue(constraints, parameter, fallback) {
  return constraints[parameter] ? constraints[parameter].value : fallback;
}
