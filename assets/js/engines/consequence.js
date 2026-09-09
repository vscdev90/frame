/**
 * Design Consequence Engine (spec §23) and What-if (spec §26).
 *
 * The product's core differentiator: every significant change triggers
 * an impact analysis. Because the pipeline is deterministic and pure,
 * a consequence is simply the diff between two full evaluations.
 */

import { computeProject } from './pipeline.js';
import { formatMoney } from './cost.js';

/** The what-if scenarios offered in the UI. Each is a pure override. */
export const WHAT_IFS = [
  {
    id: 'budget_minus_50k',
    label: 'What if I have €50k less?',
    apply: (p) => ({ budget: { total: Math.max(100000, (p.budget?.total ?? 500000) - 50000) } })
  },
  {
    id: 'budget_plus_50k',
    label: 'What if I have €50k more?',
    apply: (p) => ({ budget: { total: (p.budget?.total ?? 500000) + 50000 } })
  },
  {
    id: 'area_plus_20',
    label: 'What if I want 20 m² more?',
    apply: (p) => ({
      program_answers: { ...(p.program_answers || {}), extra_area: ((p.program_answers?.extra_area) || 0) + 20 }
    })
  },
  {
    id: 'single_storey',
    label: 'What if I choose one storey?',
    apply: (p) => ({ program_answers: { ...(p.program_answers || {}), singleStorey: true } })
  },
  {
    id: 'more_glass',
    label: 'What if I want more glass?',
    apply: (p) => ({ envelope: { ...(p.envelope || {}), glazing_ratio: Math.min(0.6, glazingOf(p) + 0.12) } })
  },
  {
    id: 'less_glass',
    label: 'What if I use less glass?',
    apply: (p) => ({ envelope: { ...(p.envelope || {}), glazing_ratio: Math.max(0.1, glazingOf(p) - 0.1) } })
  },
  {
    id: 'high_quality',
    label: 'What if I finish it to a higher standard?',
    apply: () => ({ quality: 'high' })
  },
  {
    id: 'basic_quality',
    label: 'What if I accept a basic finish?',
    apply: () => ({ quality: 'basic' })
  }
];

function glazingOf(p) {
  return p.envelope?.glazing_ratio ?? 0.28;
}

/**
 * Run a change against the project and report what it does — not only
 * to cost, but to daylight, comfort, structure and feasibility.
 */
export function analyseChange(project, overrides, label = 'Change') {
  const before = computeProject(project);
  const after = computeProject(project, overrides);
  return {
    label,
    overrides,
    before: snapshot(before),
    after: snapshot(after),
    impacts: diffImpacts(before, after),
    evaluation: after
  };
}

function snapshot(result) {
  const s = result.selected;
  return {
    direction: s.direction.name,
    gfa: s.massing.gfa,
    floors: s.massing.floors,
    height: s.massing.height,
    footprint: s.massing.footprint.area,
    glazing: s.envelope.glazed_area,
    glazing_ratio: s.envelope.glazing_ratio,
    cost_low: s.cost.total.low,
    cost_high: s.cost.total.high,
    construction_mid: s.cost.construction.mid,
    feasibility: s.feasibility.score,
    system: s.construction.selected.name,
    budget: result.budget.construction_budget
  };
}

/**
 * The qualitative half of the engine: physical consequences that do not
 * show up in a cost total. Derived from the geometry diff, with fixed
 * thresholds so the same change always reports the same consequences.
 */
function diffImpacts(before, after) {
  const b = before.selected;
  const a = after.selected;
  const impacts = [];

  const push = (dimension, direction, message, magnitude = 'moderate') =>
    impacts.push({ dimension, direction, magnitude, message });

  const dCost = a.cost.construction.mid - b.cost.construction.mid;
  if (Math.abs(dCost) > 2000) {
    push('Cost', dCost > 0 ? 'up' : 'down',
      `Indicative construction cost ${dCost > 0 ? 'rises' : 'falls'} by about ${formatMoney(Math.abs(dCost))} at the midpoint.`,
      Math.abs(dCost) > 40000 ? 'large' : 'moderate');
  }

  const dGfa = a.massing.gfa - b.massing.gfa;
  if (Math.abs(dGfa) > 1) {
    push('Floor area', dGfa > 0 ? 'up' : 'down',
      `Gross floor area changes by ${dGfa > 0 ? '+' : ''}${Math.round(dGfa * 10) / 10} m².`);
  }

  const dGlass = a.envelope.glazed_area - b.envelope.glazed_area;
  if (Math.abs(dGlass) > 1) {
    const up = dGlass > 0;
    push('Daylight', up ? 'up' : 'down',
      `${up ? 'More' : 'Less'} glazed area (${up ? '+' : ''}${Math.round(dGlass)} m²) means ${up ? 'better daylight and a stronger garden connection' : 'less daylight, but a calmer, cheaper facade'}.`);
    push('Solar gain', up ? 'up' : 'down',
      up
        ? 'Summer solar load increases. External shading on the south facade becomes necessary rather than optional.'
        : 'Summer solar load drops, reducing the need for external shading.');
    push('Energy', up ? 'down' : 'up',
      up
        ? 'Winter heat loss increases: glass insulates worse than a closed facade, so the heating demand rises.'
        : 'Winter heat loss decreases, improving the energy balance.');
    if (up && a.envelope.glazing_ratio > 0.4) {
      push('Structure', 'up',
        'Above roughly 40% glazing the facade stops carrying load. Expect steel or a heavier frame at the openings.', 'large');
    }
  }

  if (a.massing.floors !== b.massing.floors) {
    const up = a.massing.floors > b.massing.floors;
    push('Massing', up ? 'up' : 'down',
      `The design moves from ${b.massing.floors} to ${a.massing.floors} storey${a.massing.floors > 1 ? 's' : ''}.`, 'large');
    push('Site', up ? 'down' : 'up',
      up
        ? 'A smaller footprint leaves more garden and a smaller foundation.'
        : 'A larger footprint takes more of the plot and more foundation area.');
    push('Accessibility', up ? 'down' : 'up',
      up ? 'More stairs in daily use; less suitable for ageing in place.' : 'Fewer stairs: everything on one level is easier to live with long term.');
  }

  if (a.construction.selected.id !== b.construction.selected.id) {
    push('Construction', 'change',
      `Recommended system changes from ${b.construction.selected.name} to ${a.construction.selected.name}.`, 'large');
  }

  const dFeas = a.feasibility.score - b.feasibility.score;
  if (Math.abs(dFeas) >= 2) {
    push('Feasibility', dFeas > 0 ? 'up' : 'down',
      `Feasibility ${dFeas > 0 ? 'improves' : 'drops'} from ${b.feasibility.score} to ${a.feasibility.score} out of 100.`,
      Math.abs(dFeas) > 12 ? 'large' : 'moderate');
  }

  const bFit = b.cost.construction.mid <= before.budget.construction_budget;
  const aFit = a.cost.construction.mid <= after.budget.construction_budget;
  if (bFit !== aFit) {
    push('Budget', aFit ? 'up' : 'down',
      aFit ? 'The design now fits within the construction budget.' : 'The design no longer fits within the construction budget.', 'large');
  }

  if (!impacts.length) push('No effect', 'flat', 'This change does not measurably affect the current design.');
  return impacts;
}

/**
 * Scenario Comparison (spec §27): Conservative / Balanced / Ambitious,
 * generated from one project so the three are genuinely comparable.
 */
export const SCENARIOS = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'Protect the budget. Sober specification, restrained glazing, simple geometry.',
    overrides: (p) => ({ quality: 'basic', envelope: { glazing_ratio: Math.max(0.14, glazingOf(p) - 0.08) } })
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'The current design as it stands: a mid-range specification with the chosen direction.',
    overrides: () => ({})
  },
  {
    id: 'ambitious',
    name: 'Ambitious',
    description: 'Spend where it shows: higher finish level and a more generous glazed facade.',
    overrides: (p) => ({ quality: 'high', envelope: { glazing_ratio: Math.min(0.5, glazingOf(p) + 0.08) } })
  }
];

export function compareScenarios(project) {
  return SCENARIOS.map((s) => {
    const result = computeProject(project, s.overrides(project));
    const sel = result.selected;
    return {
      scenario: s,
      area: sel.massing.gfa,
      cost: sel.cost.total,
      construction: sel.construction.selected.name,
      glazing: sel.envelope.glazed_area,
      glazing_ratio: sel.envelope.glazing_ratio,
      complexity: sel.complexity,
      quality: sel.cost.quality,
      feasibility: sel.feasibility.score,
      risk: sel.risks.filter((r) => r.severity === 'high').length,
      result
    };
  });
}

/** Budget slider: sweep the budget and report where the design space changes. */
export function budgetSweep(project, from, to, steps = 9) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const total = Math.round(from + ((to - from) * i) / (steps - 1));
    const result = computeProject(project, { budget: { total } });
    out.push({
      total,
      feasibility: result.selected.feasibility.score,
      gfa: result.selected.massing.gfa,
      cost_mid: result.selected.cost.construction.mid,
      fits: result.selected.cost.construction.mid <= result.budget.construction_budget
    });
  }
  return out;
}
