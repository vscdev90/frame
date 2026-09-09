/**
 * Assistant & AI Critic (spec §29–31).
 *
 * IMPORTANT — what this is, honestly:
 * FRAME's architecture says the LLM handles conversation, explanation
 * and critique, while geometry, cost, constraints and feasibility stay
 * deterministic, and "AI must not be the source of truth for geometry,
 * cost or regulations" (§29).
 *
 * This build runs as a static site with no backend and therefore no
 * model. What is implemented here is the deterministic half: intent
 * matching over the question, and answers composed entirely from
 * computed project data. It never invents a number and never invents a
 * rule. When a language model is added later it slots in as the phrasing
 * layer on top of exactly these facts — the answer contract below is
 * the interface it would fill.
 */

import { analyseChange, WHAT_IFS } from './consequence.js';
import { computeProject } from './pipeline.js';
import { money, area } from '../ui.js';

export const MODES = ['DISCOVER', 'DESIGN', 'CRITIQUE', 'OPTIMIZE', 'EXPLAIN', 'COMPARE', 'SUMMARIZE'];

/** Intent patterns, most specific first. */
const INTENTS = [
  { mode: 'DESIGN', id: 'more_glass', test: /(more|extra|bigger|larger|meer)\s+(glass|glazing|window|glas)/i, whatif: 'more_glass' },
  { mode: 'DESIGN', id: 'less_glass', test: /(less|fewer|smaller|minder)\s+(glass|glazing|window|glas)/i, whatif: 'less_glass' },
  { mode: 'DESIGN', id: 'single_storey', test: /(one|single|1)\s*(storey|story|floor|level|laag)|bungalow|gelijkvloers/i, whatif: 'single_storey' },
  { mode: 'DESIGN', id: 'more_area', test: /(\d+)\s*(m2|m²|square met)|(more|extra)\s+(space|area|room|m2)/i, whatif: 'area_plus_20' },
  { mode: 'DESIGN', id: 'cheaper', test: /(cheap|less money|reduce cost|save|lower the cost|budget down|goedkoper)/i, whatif: 'basic_quality' },
  { mode: 'DESIGN', id: 'better_finish', test: /(better|higher|premium|luxur)\s*(finish|quality|spec)/i, whatif: 'high_quality' },
  { mode: 'EXPLAIN', id: 'why_cost', test: /(why|what).*(cost|expensive|price|duur)|cost.*(come from|made up|breakdown)/i },
  { mode: 'EXPLAIN', id: 'why_feasibility', test: /(why|how).*(feasib|score)|what.*score.*mean/i },
  { mode: 'EXPLAIN', id: 'rules', test: /(rule|zoning|planning|permit|height limit|bestemmingsplan|omgevingsplan|allowed)/i },
  { mode: 'EXPLAIN', id: 'construction', test: /(construction|build|system|timber|clt|concrete|masonry|hsb)/i },
  { mode: 'COMPARE', id: 'compare', test: /(compare|versus|vs\.?|difference between|which.*better)/i },
  { mode: 'CRITIQUE', id: 'critique', test: /(critique|what.*wrong|problem|risk|concern|honest|weak)/i },
  { mode: 'OPTIMIZE', id: 'optimize', test: /(optimi[sz]e|improve|fit.*budget|make it work|best option)/i },
  { mode: 'SUMMARIZE', id: 'summary', test: /(summar|overview|recap|brief|tell me about)/i }
];

/**
 * @returns {{mode, title, body, impacts?, actions?, facts}} an answer
 * composed only from computed project data.
 */
export function ask(question, project, evaluation) {
  const q = String(question || '').trim();
  if (!q) return null;

  const intent = INTENTS.find((i) => i.test.test(q));
  const mode = intent?.mode || 'DISCOVER';

  if (intent?.whatif) {
    const spec = WHAT_IFS.find((w) => w.id === intent.whatif);
    const analysis = analyseChange(project, spec.apply(project), spec.label);
    return {
      mode: 'DESIGN',
      title: spec.label,
      body: describeChange(analysis),
      impacts: analysis.impacts,
      analysis,
      actions: [{ id: 'apply', label: 'Apply this change', overrides: spec.apply(project) }],
      facts: analysis.after
    };
  }

  switch (intent?.id) {
    case 'why_cost': return explainCost(evaluation);
    case 'why_feasibility': return explainFeasibility(evaluation);
    case 'rules': return explainRules(evaluation);
    case 'construction': return explainConstruction(evaluation);
    case 'compare': return compareDirections(evaluation);
    case 'critique': return critique(evaluation);
    case 'optimize': return optimise(project, evaluation);
    case 'summary': return summarise(evaluation);
    default: return discover(q, evaluation);
  }
}

function describeChange(analysis) {
  const b = analysis.before, a = analysis.after;
  const dCost = a.construction_mid - b.construction_mid;
  const dir = dCost === 0 ? 'leaves the construction cost unchanged'
    : `${dCost > 0 ? 'adds' : 'saves'} roughly ${money(Math.abs(dCost))} of construction cost`;
  return `That change ${dir} and moves feasibility from ${b.feasibility} to ${a.feasibility} out of 100. Here is everything it touches:`;
}

function explainCost(ev) {
  const c = ev.selected.cost;
  const top = c.items.slice().sort((x, y) => (y.low + y.high) - (x.low + x.high)).slice(0, 3);
  return {
    mode: 'EXPLAIN',
    title: 'Where the cost comes from',
    body: `The indicative construction cost is ${money(c.construction.low)} – ${money(c.construction.high)}, which is ${c.per_m2.low} – ${c.per_m2.high} per m² of gross floor area. It is built up from measured quantities on the current massing — ${area(c.basis.gfa)} of floor area, ${area(c.basis.glazing)} of glazing and ${area(c.basis.closed_facade)} of closed facade — multiplied by rate ranges for ${c.system.toLowerCase()} at a ${c.quality.toLowerCase()} specification. The three largest categories are ${top.map((t) => `${t.label.toLowerCase()} (${money(t.low)} – ${money(t.high)})`).join(', ')}. Professional fees, permits and contingency add ${money(c.soft_total.low)} – ${money(c.soft_total.high)} on top. Overall confidence in this estimate is ${Math.round(c.confidence * 100)}%: quantities come from a massing model, not from a detailed design, so treat the range as a range.`,
    facts: c.basis
  };
}

function explainFeasibility(ev) {
  const f = ev.selected.feasibility;
  const axes = Object.values(f.axes).map((a) => `${a.name.toLowerCase()} ${a.score}`).join(', ');
  return {
    mode: 'EXPLAIN',
    title: `Feasibility ${f.score} / 100 — ${f.band.label.toLowerCase()}`,
    body: `The score combines four axes: ${axes}. Budget weighs heaviest at 40%, because a design you cannot pay for is not feasible however good it looks. The reasons behind the score are listed in full on the right — the score never hides them.`,
    impacts: f.reasons.slice(0, 5).map((r) => ({
      dimension: r.axis.charAt(0).toUpperCase() + r.axis.slice(1),
      direction: r.severity === 'low' ? 'flat' : 'down',
      magnitude: r.severity,
      message: r.message
    })),
    facts: f.axes
  };
}

function explainRules(ev) {
  const lines = ev.rules.map((r) => `${r.description} — ${r.parameter.replace(/_/g, ' ')}: ${r.value}${r.unit === 'ratio' ? ' (ratio)' : ` ${r.unit}`} (${r.rule_id}, confidence ${Math.round(r.confidence * 100)}%)`);
  return {
    mode: 'EXPLAIN',
    title: 'The rules applied to this design',
    body: `FRAME applies ${ev.rules.length} rules to this project, each from the rule store rather than from a model. ${lines.join('. ')}. Every one of these is indicative model data for a generic residential plot, not the omgevingsplan for this address — verify with the municipality before you rely on them.`,
    facts: ev.constraints
  };
}

function explainConstruction(ev) {
  const s = ev.selected.construction.selected;
  const ranking = ev.selected.construction.ranking.slice(0, 3);
  return {
    mode: 'EXPLAIN',
    title: `Why ${s.name}`,
    body: `${s.short} ${s.notes} It was ranked first for this design against ${ranking.slice(1).map((r) => r.system.name).join(' and ')}, scoring on span capability (up to ${s.max_span} m), availability (${s.availability}/100), cost factor (${s.cost_factor.toFixed(2)}×) and how well it matches the ${ev.selected.direction.name.toLowerCase()} direction. You can change the system on the Construction panel and every cost line will follow.`,
    facts: s
  };
}

function compareDirections(ev) {
  const rows = ev.directions.map((d) =>
    `${d.direction.name}: ${area(d.massing.gfa)}, ${money(d.cost.total.low)} – ${money(d.cost.total.high)}, feasibility ${d.feasibility.score}`
  );
  const best = ev.directions.slice().sort((a, b) => b.feasibility.score - a.feasibility.score)[0];
  return {
    mode: 'COMPARE',
    title: 'The directions side by side',
    body: `${rows.join('. ')}. On the current budget, ${best.direction.name} scores highest at ${best.feasibility.score}. The full comparison, including glazing, complexity and risk, is on the Compare page.`,
    facts: ev.directions.map((d) => d.summary)
  };
}

/** The critic (spec §31). It has to be able to say the unwelcome thing. */
export function critique(ev) {
  const s = ev.selected;
  const findings = [];

  const budgetRatio = ev.budget.construction_budget / Math.max(1, s.cost.construction.mid);
  if (budgetRatio < 0.92) {
    findings.push({
      severity: 'high',
      dimension: 'Budget',
      message: `This is an attractive option, but it is not a good option for your budget: the construction cost midpoint is ${money(s.cost.construction.mid)} against ${money(ev.budget.construction_budget)} available — about ${Math.round((1 - budgetRatio) * 100)}% short.`
    });
  }
  const programRatio = s.massing.gfa / Math.max(1, ev.program.areas.gross_target);
  if (programRatio < 0.9) {
    findings.push({
      severity: 'medium',
      dimension: 'Program',
      message: `The massing delivers ${area(s.massing.gfa)} against a program asking for ${area(ev.program.areas.gross_target)}. Something in the brief has to give — the lowest-priority spaces are ${ev.program.spaces.filter((x) => x.priority === 'could').map((x) => x.name.toLowerCase()).join(', ') || 'already removed'}.`
    });
  }
  if (s.envelope.glazing_ratio > 0.36) {
    findings.push({
      severity: 'medium',
      dimension: 'Envelope',
      message: `At ${Math.round(s.envelope.glazing_ratio * 100)}% glazing you are buying daylight with cost, summer heat and structural work. External shading is no longer optional on the south facade.`
    });
  }
  if (s.complexity > 55) {
    findings.push({
      severity: 'medium',
      dimension: 'Complexity',
      message: `Geometry complexity scores ${s.complexity}/100. Every corner and level change is priced twice: once by the builder and once by the detailer. A simpler massing would buy back quality elsewhere.`
    });
  }
  for (const issue of s.plan_issues.filter((i) => i.severity === 'high').slice(0, 2)) {
    findings.push({ severity: 'high', dimension: 'Layout', message: issue.message });
  }
  const coverage = s.massing.footprint.area / ev.site.plot_area;
  const maxCoverage = ev.constraints.max_build_coverage?.value ?? 0.3;
  if (coverage > maxCoverage * 0.92) {
    findings.push({
      severity: coverage > maxCoverage ? 'high' : 'medium',
      dimension: 'Planning',
      message: `The footprint uses ${Math.round((coverage / maxCoverage) * 100)}% of the indicative build-coverage allowance. There is little room left for an outbuilding or a later extension.`
    });
  }
  if (!findings.length) {
    findings.push({
      severity: 'low',
      dimension: 'Overall',
      message: 'Nothing in the current design conflicts with the budget, the program or the indicative rules. That is a good position to take to an architect.'
    });
  }

  return {
    mode: 'CRITIQUE',
    title: 'An honest read of this design',
    body: 'FRAME is meant to tell you the unwelcome thing early, while changing it is still cheap.',
    impacts: findings.map((f) => ({
      dimension: f.dimension,
      direction: f.severity === 'low' ? 'flat' : 'down',
      magnitude: f.severity,
      message: f.message
    })),
    facts: findings
  };
}

/** OPTIMIZE: search the what-if space for the change that helps most. */
function optimise(project, ev) {
  const results = WHAT_IFS
    .filter((w) => w.id !== 'budget_plus_50k' && w.id !== 'budget_minus_50k')
    .map((w) => {
      const after = computeProject(project, w.apply(project));
      return {
        label: w.label,
        id: w.id,
        overrides: w.apply(project),
        feasibility: after.selected.feasibility.score,
        delta: after.selected.feasibility.score - ev.selected.feasibility.score,
        cost: after.selected.cost.construction.mid
      };
    })
    .sort((a, b) => b.delta - a.delta);

  const best = results[0];
  const helpful = results.filter((r) => r.delta > 0);

  return {
    mode: 'OPTIMIZE',
    title: helpful.length ? 'The changes that would help most' : 'No single change improves this design',
    body: helpful.length
      ? `Running every available change through the full pipeline: ${helpful.slice(0, 3).map((r) => `${r.label.replace(/^What if /i, '').replace(/\?$/, '')} (+${r.delta} feasibility)`).join(', ')}. The strongest is "${best.label}".`
      : 'Every available change either leaves feasibility where it is or lowers it. The constraint is the relationship between the program and the budget, not the design detailing — either the program shrinks or the budget grows.',
    impacts: results.slice(0, 5).map((r) => ({
      dimension: r.label.replace(/^What if /i, '').replace(/\?$/, ''),
      direction: r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : 'flat',
      magnitude: Math.abs(r.delta) > 8 ? 'large' : 'moderate',
      message: `Feasibility ${r.delta >= 0 ? '+' : ''}${r.delta}, construction cost ${money(r.cost)}.`,
      positive: r.delta > 0
    })),
    actions: helpful.length ? [{ id: 'apply', label: `Apply: ${best.label}`, overrides: best.overrides }] : [],
    facts: results
  };
}

function summarise(ev) {
  const s = ev.selected;
  return {
    mode: 'SUMMARIZE',
    title: 'Where this project stands',
    body: `A ${s.massing.floors}-storey ${s.direction.name.toLowerCase()} design of ${area(s.massing.gfa)} on a ${area(ev.site.plot_area)} plot, in ${s.construction.selected.name.toLowerCase()}, at ${money(s.cost.total.low)} – ${money(s.cost.total.high)} including fees and contingency against a ${money(ev.budget.total)} budget. Feasibility ${s.feasibility.score}/100 (${s.feasibility.band.label.toLowerCase()}). ${s.risks.filter((r) => r.severity === 'high').length} issues need attention before this becomes a brief.`,
    facts: s.summary
  };
}

function discover(q, ev) {
  return {
    mode: 'DISCOVER',
    title: 'Not something this build can answer yet',
    body: `This prototype answers from computed project data only — it has no language model behind it, so it will not guess. It can explain the cost build-up, the feasibility score, the rules applied, and the construction system; critique the design; compare the directions; optimise towards the budget; and run what-if changes such as more or less glass, one storey, extra area or a different finish level. Try one of those, or use the what-if buttons below.`,
    facts: { question: q, available_modes: MODES }
  };
}

/** Suggestions offered under the ask bar. */
export const SUGGESTIONS = [
  'What if I want more glass on the garden side?',
  'Why does it cost this much?',
  'What if I choose one storey?',
  'Be honest — what is wrong with this design?',
  'How do I get this within budget?',
  'Which rules apply to this plot?'
];
