/**
 * The compute pipeline.
 *
 * One pure function from project data to a full evaluation. It is the
 * spine of the event architecture in spec §36:
 *   WINDOW_CHANGED → GEOMETRY_CHANGED → QUANTITY_CHANGED →
 *   COST_CHANGED → FEASIBILITY_CHANGED
 * Because the whole chain is deterministic and cheap, the app simply
 * re-runs it on every change instead of maintaining fragile caches.
 */

import { resolveConstraints } from '../data/rules.js';
import { buildProgram } from './program.js';
import { generateDirections, getDirection } from './directions.js';
import { generateMassing } from './massing.js';
import { buildModel, glazedArea } from './geometry.js';
import { generateFloorplans, checkPlan } from './layout.js';
import { calculateCost, massingComplexity } from './cost.js';
import { calculateFeasibility, collectRisks } from './feasibility.js';
import { recommendSystem, getSystem } from '../data/construction.js';

/** Split a total project budget into its parts (spec §14). */
export function splitBudget(project) {
  const total = project.budget?.total ?? 500000;
  const professionalPct = 0.125;
  const feesPct = 0.03;
  const contingencyPct = 0.085;
  const constructionShare = 1 / (1 + professionalPct + feesPct + contingencyPct);
  const construction = Math.round(total * constructionShare);
  return {
    total,
    construction_budget: construction,
    professional: Math.round(construction * professionalPct),
    fees: Math.round(construction * feesPct),
    contingency: Math.round(construction * contingencyPct)
  };
}

/**
 * Evaluate a project. `overrides` lets the what-if engine run the same
 * pipeline against a modified copy without touching the saved project.
 */
export function computeProject(project, overrides = {}) {
  const p = mergeOverrides(project, overrides);

  const site = normaliseSite(p.site);
  const context = { zoning: site.zoning || 'residential', building_type: p.building_type || 'detached_house' };
  const { constraints, applicable } = resolveConstraints(context);

  const program = buildProgram(p.program_answers);
  const budget = splitBudget(p);

  // Budget pressure: how tight the money is against a naive first estimate
  // of construction cost for the requested program.
  const naiveCost = program.areas.gross_target * 2350;
  const budgetPressure = clamp(1 - budget.construction_budget / Math.max(1, naiveCost), 0, 1);

  const directions = generateDirections({
    plot_area: site.plot_area,
    budget_pressure: budgetPressure,
    max_floors: constraints.max_floors?.value ?? 2,
    privacy_need: p.priorities?.privacy ?? 0.4,
    garden_priority: p.priorities?.garden ?? 0.5,
    single_storey: !!p.program_answers?.singleStorey
  });

  // Evaluate every offered direction so the comparison view is real,
  // not a re-run of the selected one with different labels.
  const evaluated = directions.map((d) => evaluateDirection({ direction: d, p, site, constraints, program, budget }));

  const selectedId = p.selected_direction && evaluated.some((e) => e.direction.id === p.selected_direction)
    ? p.selected_direction
    : evaluated[0].direction.id;
  const selected = evaluated.find((e) => e.direction.id === selectedId);

  return {
    site,
    constraints,
    rules: applicable,
    program,
    budget,
    budget_pressure: Math.round(budgetPressure * 100) / 100,
    directions: evaluated,
    selected,
    selected_direction_id: selectedId
  };
}

/** Run one design direction all the way to a feasibility score. */
function evaluateDirection({ direction, p, site, constraints, program, budget }) {
  const targetGfa = Math.max(45, program.areas.gross_target * direction.area_factor);

  const massingResult = generateMassing({ site, constraints, targetGfa, direction });
  const variantIndex = clamp(p.massing_variant ?? 0, 0, massingResult.candidates.length - 1);
  const massing = massingResult.candidates[variantIndex] || massingResult.candidates[0];

  const glazingRatio = clamp(
    p.envelope?.glazing_ratio ?? direction.glazing_ratio,
    0.08, 0.6
  );
  const envelope = {
    glazing_ratio: glazingRatio,
    south_bias: direction.dna.includes('open') ? 1.6 : 1.0
  };

  const model = buildModel(massing, site, envelope);
  const glass = glazedArea(model);
  const floorplans = generateFloorplans({ program, massing, model });
  const planIssues = checkPlan(floorplans);

  const maxSpan = Math.min(massing.footprint.width, massing.footprint.depth) * (direction.dna.includes('open') ? 0.9 : 0.6);
  const systemRanking = recommendSystem({
    maxSpan,
    dna: direction.dna,
    budgetPressure: clamp(1 - budget.construction_budget / Math.max(1, targetGfa * 2350), 0, 1),
    sustainability: p.priorities?.sustainability ?? 0.5
  });
  const systemId = p.construction_system || systemRanking[0].system.id;

  const cost = calculateCost({
    massing, model, site,
    constructionSystemId: systemId,
    quality: p.quality || 'standard',
    glazedArea: glass
  });

  const feasibility = calculateFeasibility({
    budget, cost, program, massing, site, constraints, planIssues
  });

  const risks = collectRisks(feasibility, cost, massing, planIssues);

  return {
    direction,
    massing,
    massing_alternatives: massingResult.candidates,
    massing_stats: { generated: massingResult.generated, valid: massingResult.valid, rejected: massingResult.rejected },
    envelope: { ...envelope, glazed_area: glass, closed_facade: Math.round(massing.facade_area - glass), openings: model.openings.length },
    model,
    floorplans,
    plan_issues: planIssues,
    construction: { selected: getSystem(systemId), ranking: systemRanking },
    cost,
    feasibility,
    risks,
    complexity: massingComplexity(massing),
    summary: {
      gfa: massing.gfa,
      footprint: massing.footprint.area,
      floors: massing.floors,
      height: massing.height,
      cost_low: cost.total.low,
      cost_high: cost.total.high,
      construction_low: cost.construction.low,
      construction_high: cost.construction.high,
      feasibility: feasibility.score
    }
  };
}

function normaliseSite(site = {}) {
  const plotArea = site.plot_area || 500;
  const frontage = site.frontage || Math.max(12, Math.round(Math.sqrt(plotArea * 0.55)));
  return {
    address: site.address || 'Address not set',
    plot_area: plotArea,
    frontage,
    plot_width: frontage,
    plot_depth: Math.round((plotArea / frontage) * 10) / 10,
    orientation: site.orientation || 'north_south',
    zoning: site.zoning || 'residential',
    setback_front: 5,
    lat: site.lat,
    lon: site.lon
  };
}

function mergeOverrides(project, overrides) {
  const out = { ...project };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = { ...(project[key] || {}), ...value };
    } else {
      out[key] = value;
    }
  }
  return out;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
