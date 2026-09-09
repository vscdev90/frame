/**
 * Feasibility Engine (spec §25).
 *
 * Four axes, each 0–100: budget, program, site and complexity.
 * "The score must never hide the underlying causes" — so every axis
 * returns its reasons, and the UI is expected to show them.
 */

import { constraintValue } from '../data/rules.js';

export function calculateFeasibility({ budget, cost, program, massing, site, constraints, planIssues = [] }) {
  const budgetAxis = scoreBudget(budget, cost);
  const programAxis = scoreProgram(program, massing);
  const siteAxis = scoreSite(massing, site, constraints);
  const complexityAxis = scoreComplexity(massing, planIssues);

  const axes = [budgetAxis, programAxis, siteAxis, complexityAxis];
  // Budget dominates: a design you cannot pay for is not feasible,
  // however elegant it is.
  const overall = Math.round(
    budgetAxis.score * 0.4 + programAxis.score * 0.25 + siteAxis.score * 0.2 + complexityAxis.score * 0.15
  );

  const reasons = axes.flatMap((a) => a.reasons);
  return {
    score: clamp(overall, 0, 100),
    band: band(overall),
    axes: { budget: budgetAxis, program: programAxis, site: siteAxis, complexity: complexityAxis },
    reasons: reasons.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    blocking: reasons.filter((r) => r.severity === 'high')
  };
}

function scoreBudget(budget, cost) {
  const reasons = [];
  const available = budget.construction_budget;
  const mid = cost.construction.mid;
  const ratio = available / Math.max(1, mid);

  // 1.0 → exactly on budget → 75. Above budget scores higher, below drops fast.
  let score = ratio >= 1 ? 75 + Math.min(25, (ratio - 1) * 60) : 75 - Math.min(75, (1 - ratio) * 190);

  if (ratio < 0.8) {
    reasons.push({
      axis: 'budget', severity: 'high',
      message: `The construction budget covers about ${Math.round(ratio * 100)}% of the indicative construction cost.`
    });
  } else if (ratio < 1) {
    reasons.push({
      axis: 'budget', severity: 'medium',
      message: `The design sits slightly above budget: ${Math.round((1 - ratio) * 100)}% short at the midpoint of the range.`
    });
  } else if (ratio > 1.25) {
    reasons.push({
      axis: 'budget', severity: 'low',
      message: 'There is meaningful headroom in the budget — more area or a higher finish level is within reach.'
    });
  } else {
    reasons.push({ axis: 'budget', severity: 'low', message: 'The design fits within the construction budget at the midpoint of the range.' });
  }

  if (cost.construction.high > available) {
    reasons.push({
      axis: 'budget', severity: 'medium',
      message: 'The upper end of the cost range exceeds the budget. Tender results vary; keep the contingency intact.'
    });
  }
  return { name: 'Budget', score: clamp(Math.round(score), 0, 100), reasons, detail: { ratio: Math.round(ratio * 100) / 100 } };
}

function scoreProgram(program, massing) {
  const reasons = [];
  const target = program.areas.gross_target;
  const delivered = massing.gfa;
  const ratio = delivered / Math.max(1, target);

  let score = 100 - Math.min(100, Math.abs(1 - ratio) * 210);
  if (ratio < 0.88) {
    reasons.push({
      axis: 'program', severity: ratio < 0.75 ? 'high' : 'medium',
      message: `The massing delivers ${delivered} m² against a program target of ${target} m². Lower-priority spaces will have to shrink or go.`
    });
  } else if (ratio > 1.12) {
    reasons.push({ axis: 'program', severity: 'low', message: `The massing is larger than the program needs (${delivered} m² vs ${target} m²), which costs money without adding requested rooms.` });
  } else {
    reasons.push({ axis: 'program', severity: 'low', message: 'The massing matches the requested program closely.' });
  }

  const mustArea = program.areas.net_must * 1.28;
  if (delivered < mustArea) {
    score -= 25;
    reasons.push({ axis: 'program', severity: 'high', message: 'The massing is too small to hold the MUST-have spaces at their target sizes.' });
  }
  return { name: 'Program', score: clamp(Math.round(score), 0, 100), reasons, detail: { ratio: Math.round(ratio * 100) / 100 } };
}

function scoreSite(massing, site, constraints) {
  const reasons = [];
  let score = 100;

  const plotArea = site.plot_area || 500;
  const maxCoverage = constraintValue(constraints, 'max_build_coverage', 0.3);
  const coverage = massing.footprint.area / plotArea;
  const coverageUse = coverage / maxCoverage;

  if (coverageUse > 1) {
    score -= 45;
    reasons.push({ axis: 'site', severity: 'high', message: `The footprint exceeds the indicative build-coverage limit (${Math.round(coverage * 100)}% against ${Math.round(maxCoverage * 100)}% allowed).` });
  } else if (coverageUse > 0.9) {
    score -= 15;
    reasons.push({ axis: 'site', severity: 'medium', message: `The footprint uses ${Math.round(coverageUse * 100)}% of the permitted build coverage, leaving little room to grow.` });
  } else {
    reasons.push({ axis: 'site', severity: 'low', message: `The footprint uses ${Math.round(coverageUse * 100)}% of the permitted build coverage.` });
  }

  const maxHeight = constraintValue(constraints, 'max_building_height', 9);
  if (massing.height > maxHeight) {
    score -= 40;
    reasons.push({ axis: 'site', severity: 'high', message: `Building height of ${massing.height} m exceeds the indicative maximum of ${maxHeight} m.` });
  } else if (massing.height > maxHeight - 0.6) {
    score -= 8;
    reasons.push({ axis: 'site', severity: 'medium', message: 'The building is close to the maximum permitted height; little tolerance remains for the roof build-up.' });
  }

  const gardenLeft = plotArea - massing.footprint.area;
  if (gardenLeft < 80) {
    score -= 12;
    reasons.push({ axis: 'site', severity: 'medium', message: `Only ${Math.round(gardenLeft)} m² of open plot remains around the building.` });
  }

  reasons.push({
    axis: 'site', severity: 'medium',
    message: 'Site rules are indicative model data, not the omgevingsplan for this address. Verify with the municipality before relying on them.'
  });
  return { name: 'Site', score: clamp(Math.round(score), 0, 100), reasons, detail: { coverage: Math.round(coverage * 1000) / 10 } };
}

function scoreComplexity(massing, planIssues) {
  const reasons = [];
  let score = 100;

  const facadeRatio = massing.facade_area / Math.max(1, massing.gfa);
  if (facadeRatio > 1.05) {
    score -= 22;
    reasons.push({ axis: 'complexity', severity: 'medium', message: `The design has a lot of facade per m² of floor area (${facadeRatio.toFixed(2)}), which raises both cost and heat loss.` });
  }
  if (massing.courtyard) {
    score -= 14;
    reasons.push({ axis: 'complexity', severity: 'medium', message: 'The courtyard adds internal corners: more detailing, more risk of water ingress, more cost.' });
  }
  if (massing.floors >= 3) {
    score -= 12;
    reasons.push({ axis: 'complexity', severity: 'medium', message: 'Three storeys add a second stair run and stricter fire and structural requirements.' });
  }
  const high = planIssues.filter((i) => i.severity === 'high').length;
  const medium = planIssues.filter((i) => i.severity === 'medium').length;
  score -= high * 12 + medium * 4;
  if (high) reasons.push({ axis: 'complexity', severity: 'high', message: `${high} space${high > 1 ? 's' : ''} in the layout cannot meet a basic requirement yet.` });
  if (score > 85) reasons.push({ axis: 'complexity', severity: 'low', message: 'The geometry is straightforward to build and to price.' });

  return { name: 'Complexity', score: clamp(Math.round(score), 0, 100), reasons, detail: { facade_ratio: Math.round(facadeRatio * 100) / 100 } };
}

export function band(score) {
  if (score >= 80) return { id: 'strong', label: 'Strong', tone: 'good' };
  if (score >= 65) return { id: 'workable', label: 'Workable', tone: 'good' };
  if (score >= 50) return { id: 'tight', label: 'Tight', tone: 'warn' };
  if (score >= 35) return { id: 'strained', label: 'Strained', tone: 'warn' };
  return { id: 'unrealistic', label: 'Unrealistic', tone: 'bad' };
}

/** Risk register for the design brief (spec §38). */
export function collectRisks(feasibility, cost, massing, planIssues) {
  const risks = [];
  for (const r of feasibility.reasons) {
    if (r.severity === 'high' || r.severity === 'medium') {
      risks.push({ category: r.axis, severity: r.severity, description: r.message });
    }
  }
  if (cost.confidence < 0.55) {
    risks.push({ category: 'cost', severity: 'medium', description: `Cost confidence is ${Math.round(cost.confidence * 100)}%. The range is wide because quantities come from massing, not from a detailed design.` });
  }
  for (const i of planIssues.filter((x) => x.severity === 'high')) {
    risks.push({ category: 'layout', severity: 'high', description: i.message });
  }
  return risks;
}

function severityRank(s) { return s === 'high' ? 3 : s === 'medium' ? 2 : 1; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
