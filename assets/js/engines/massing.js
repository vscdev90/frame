/**
 * Massing Engine (spec §17).
 *
 * Inputs: site + constraints + program + design direction.
 * Method: generate many candidates internally, discard invalid ones,
 * score what remains, and present the strongest three.
 *
 * Nothing here is random. The candidate grid is fixed, so the same
 * project always produces the same massing.
 */

import { constraintValue } from '../data/rules.js';

const FLOOR_HEIGHT = 3.0;      // structural floor-to-floor
const CLEAR_HEIGHT = 2.6;      // matches the building-code rule
const ROOF_EXTRA = { flat: 0.4, gable: 2.6, mono: 1.6 };

/**
 * Generate, filter, score and rank massing candidates.
 * Returns { candidates, rejected } where candidates are the top three.
 */
export function generateMassing({ site, constraints, targetGfa, direction }) {
  const plotArea = site.plot_area || 500;
  const maxCoverage = constraintValue(constraints, 'max_build_coverage', 0.3);
  const maxHeight = constraintValue(constraints, 'max_building_height', 9);
  const maxFloorsRule = constraintValue(constraints, 'max_floors', 2);
  const setbackSide = constraintValue(constraints, 'setback_side', 3);
  const setbackFront = constraintValue(constraints, 'setback_front', 5);
  const setbackRear = constraintValue(constraints, 'setback_rear', 8);

  const maxFootprint = plotArea * maxCoverage;
  const buildable = buildableEnvelope(site, { setbackSide, setbackFront, setbackRear });

  const candidates = [];
  const rejected = [];

  // Deterministic candidate grid: widths, depths, floor counts, roofs.
  const widths = range(6, Math.min(18, buildable.width), 0.4);
  const floorOptions = [1, 2, 3].filter((f) => f <= Math.max(1, Math.round(maxFloorsRule + 0.9)));
  const roofOptions = direction.roof === 'gable' ? ['gable'] : ['flat', 'mono'];

  for (const floors of floorOptions) {
    for (const width of widths) {
      const footprintNeeded = targetGfa / floors;
      const depth = round1(footprintNeeded / width);
      for (const roof of roofOptions) {
        const cand = buildCandidate({ width, depth, floors, roof, direction, site });

        const reason = validate(cand, {
          buildable, maxFootprint, maxHeight, maxFloorsRule
        });
        if (reason) {
          rejected.push({ ...cand, rejected_because: reason });
          continue;
        }
        cand.score = scoreCandidate(cand, { targetGfa, direction, plotArea, maxFootprint });
        candidates.push(cand);
      }
    }
  }

  candidates.sort((a, b) => b.score.total - a.score.total);

  // Present distinct options, not three candidates 20 cm apart.
  const distinct = [];
  for (const c of candidates) {
    const tooSimilar = distinct.some(
      (d) => d.floors === c.floors && d.roof === c.roof && Math.abs(d.footprint.width - c.footprint.width) < 1.6
    );
    if (!tooSimilar) distinct.push(c);
    if (distinct.length >= 3) break;
  }

  return {
    candidates: distinct.length ? distinct : candidates.slice(0, 3),
    generated: candidates.length + rejected.length,
    valid: candidates.length,
    rejected: summariseRejections(rejected),
    envelope: { ...buildable, max_footprint: round1(maxFootprint), max_height: maxHeight }
  };
}

function buildableEnvelope(site, s) {
  // Treat the plot as a rectangle derived from its area and frontage.
  const plotArea = site.plot_area || 500;
  const frontage = site.frontage || Math.max(12, Math.sqrt(plotArea * 0.55));
  const plotDepth = plotArea / frontage;
  return {
    width: round1(Math.max(4, frontage - 2 * s.setbackSide)),
    depth: round1(Math.max(5, plotDepth - s.setbackFront - s.setbackRear)),
    plot_width: round1(frontage),
    plot_depth: round1(plotDepth),
    setbacks: s
  };
}

function buildCandidate({ width, depth, floors, roof, direction, site }) {
  const footprint = round1(width * depth);
  const gfa = round1(footprint * floors);
  const height = round1(floors * FLOOR_HEIGHT + (ROOF_EXTRA[roof] || 0.4));
  const courtyard = direction.courtyard && footprint > 110
    ? { width: round1(Math.min(width * 0.34, 6)), depth: round1(Math.min(depth * 0.3, 6)) }
    : null;
  const courtyardArea = courtyard ? courtyard.width * courtyard.depth : 0;

  const perimeter = 2 * (width + depth) + (courtyard ? 2 * (courtyard.width + courtyard.depth) : 0);
  const facadeArea = round1(perimeter * floors * FLOOR_HEIGHT);
  const roofArea = round1((footprint - courtyardArea) * (roof === 'gable' ? 1.22 : roof === 'mono' ? 1.06 : 1.0));

  return {
    id: `${floors}f-${width.toFixed(1)}x${depth.toFixed(1)}-${roof}${courtyard ? '-ct' : ''}`,
    building_type: 'detached_house',
    floors,
    floor_height: FLOOR_HEIGHT,
    clear_height: CLEAR_HEIGHT,
    footprint: { width: round1(width), depth: round1(depth), area: round1(footprint - courtyardArea) },
    courtyard,
    roof,
    height,
    orientation: site.orientation || 'north_south',
    gfa: round1(gfa - courtyardArea * floors * 0.5),
    facade_area: facadeArea,
    roof_area: roofArea,
    perimeter: round1(perimeter)
  };
}

function validate(c, limits) {
  if (c.footprint.depth < 5) return 'Depth below a workable minimum of 5 m';
  if (c.footprint.depth > limits.buildable.depth) return 'Exceeds the buildable depth after setbacks';
  if (c.footprint.width > limits.buildable.width) return 'Exceeds the buildable width after setbacks';
  if (c.footprint.width * c.footprint.depth > limits.maxFootprint) return 'Exceeds the maximum build coverage';
  if (c.height > limits.maxHeight) return 'Exceeds the maximum building height';
  if (c.floors > limits.maxFloorsRule + 1) return 'Exceeds the maximum number of storeys';
  const ratio = c.footprint.width / c.footprint.depth;
  if (ratio > 3.4 || ratio < 0.28) return 'Proportion is impractical to plan';
  return null;
}

/**
 * Score on four transparent axes so the UI can explain the ranking
 * instead of presenting a black-box number.
 */
function scoreCandidate(c, { targetGfa, direction, plotArea, maxFootprint }) {
  // Program fit: how close the gross floor area lands to the target.
  const fit = 100 - Math.min(100, (Math.abs(c.gfa - targetGfa) / targetGfa) * 260);

  // Direction fit: does the shape express the chosen DNA?
  let dirFit = 60;
  const idealFloors = direction.floors_bias;
  dirFit -= Math.abs(c.floors - idealFloors) * 16;
  if (direction.dna.includes('horizontal') && c.floors <= 2) dirFit += 14;
  if (direction.dna.includes('vertical') && c.floors >= 3) dirFit += 18;
  if (direction.dna.includes('compact') && c.footprint.area < maxFootprint * 0.7) dirFit += 12;
  if (direction.courtyard && c.courtyard) dirFit += 18;
  if (direction.roof === 'gable' && c.roof === 'gable') dirFit += 10;

  // Efficiency: facade area per m² of floor area drives both cost and heat loss.
  const facadeRatio = c.facade_area / Math.max(1, c.gfa);
  const efficiency = 100 - Math.min(100, Math.max(0, (facadeRatio - 0.75) * 110));

  // Site: how much garden is left over.
  const gardenLeft = 1 - c.footprint.area / plotArea;
  const siteScore = Math.min(100, gardenLeft * 145);

  const total = Math.round(fit * 0.36 + dirFit * 0.26 + efficiency * 0.22 + siteScore * 0.16);
  return {
    total: clamp(total, 0, 100),
    program_fit: clamp(Math.round(fit), 0, 100),
    direction_fit: clamp(Math.round(dirFit), 0, 100),
    efficiency: clamp(Math.round(efficiency), 0, 100),
    site: clamp(Math.round(siteScore), 0, 100),
    facade_ratio: Math.round(facadeRatio * 100) / 100
  };
}

function summariseRejections(rejected) {
  const counts = {};
  for (const r of rejected) counts[r.rejected_because] = (counts[r.rejected_because] || 0) + 1;
  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function range(from, to, step) {
  const out = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 10) / 10);
  return out;
}
function round1(v) { return Math.round(v * 10) / 10; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
