/**
 * Cost Engine (spec §24).
 *
 * Quantities come from the geometry, rates come from the rate library,
 * and every line keeps its own confidence and stated assumption.
 * The output is a range. Never a single number pretending to be a price.
 */

import { UNIT_RATES, SOFT_COSTS, QUALITY_LEVELS, complexitySurcharge } from '../data/costModel.js';
import { getSystem } from '../data/construction.js';

export function calculateCost({ massing, model, site, constructionSystemId, quality = 'standard', glazedArea }) {
  const system = getSystem(constructionSystemId);
  const q = QUALITY_LEVELS[quality] || QUALITY_LEVELS.standard;
  const surcharge = 1 + complexitySurcharge(massingComplexity(massing));

  const gfa = massing.gfa;
  const footprint = massing.footprint.area;
  const roofArea = massing.roof_area;
  const glass = glazedArea;
  const closedFacade = Math.max(0, massing.facade_area - glass);
  const plotArea = site.plot_area || 500;

  const quantities = {
    foundation: footprint,
    structure: gfa,
    floors: gfa,
    roof: roofArea,
    facade: closedFacade,
    glazing: glass,
    services: gfa,
    finishing: gfa,
    siteworks: plotArea
  };

  // Which categories the construction system and the quality level touch.
  const systemSensitive = new Set(['structure', 'floors', 'roof', 'facade']);
  const qualitySensitive = new Set(['finishing', 'glazing', 'facade']);
  const complexitySensitive = new Set(['structure', 'facade', 'roof']);

  const items = Object.entries(UNIT_RATES).map(([key, rate]) => {
    const qty = Math.round(quantities[key] * 10) / 10;
    let lowRate = rate.low;
    let highRate = rate.high;
    if (systemSensitive.has(key)) { lowRate *= system.cost_factor; highRate *= system.cost_factor; }
    if (qualitySensitive.has(key)) { lowRate *= q.factor; highRate *= q.factor; }
    if (complexitySensitive.has(key)) { lowRate *= surcharge; highRate *= surcharge; }
    return {
      category: key,
      label: rate.label,
      quantity: qty,
      unit: rate.unit,
      unit_low: Math.round(lowRate),
      unit_high: Math.round(highRate),
      low: Math.round(qty * lowRate),
      high: Math.round(qty * highRate),
      confidence: rate.confidence,
      assumption: rate.assumption
    };
  });

  const constructionLow = items.reduce((a, i) => a + i.low, 0);
  const constructionHigh = items.reduce((a, i) => a + i.high, 0);

  const soft = Object.entries(SOFT_COSTS).map(([key, s]) => ({
    category: key,
    label: s.label,
    percentage_low: s.low,
    percentage_high: s.high,
    low: Math.round(constructionLow * s.low),
    high: Math.round(constructionHigh * s.high),
    confidence: s.confidence,
    assumption: s.assumption
  }));

  const softLow = soft.reduce((a, i) => a + i.low, 0);
  const softHigh = soft.reduce((a, i) => a + i.high, 0);

  const totalLow = constructionLow + softLow;
  const totalHigh = constructionHigh + softHigh;

  // Overall confidence is the quantity-weighted mean of the line confidences.
  const weighted = items.reduce((a, i) => a + i.confidence * (i.low + i.high), 0);
  const weight = items.reduce((a, i) => a + (i.low + i.high), 0);

  return {
    items,
    soft,
    construction: { low: constructionLow, high: constructionHigh, mid: Math.round((constructionLow + constructionHigh) / 2) },
    soft_total: { low: softLow, high: softHigh },
    total: { low: totalLow, high: totalHigh, mid: Math.round((totalLow + totalHigh) / 2) },
    per_m2: {
      low: Math.round(constructionLow / Math.max(1, gfa)),
      high: Math.round(constructionHigh / Math.max(1, gfa))
    },
    confidence: Math.round((weighted / Math.max(1, weight)) * 100) / 100,
    system: system.name,
    quality: q.label,
    basis: {
      gfa, footprint, roof_area: roofArea, glazing: glass, closed_facade: Math.round(closedFacade),
      plot_area: plotArea, complexity_surcharge: Math.round((surcharge - 1) * 1000) / 10
    }
  };
}

/** Geometry complexity, expressed 0–100, feeding the cost surcharge. */
export function massingComplexity(massing) {
  let c = 15;
  c += (massing.floors - 1) * 8;
  if (massing.courtyard) c += 22;
  if (massing.roof === 'gable') c += 6;
  if (massing.roof === 'mono') c += 10;
  const facadeRatio = massing.facade_area / Math.max(1, massing.gfa);
  c += Math.max(0, (facadeRatio - 0.8) * 40);
  return Math.max(0, Math.min(100, Math.round(c)));
}

export function formatRange(low, high) {
  return `${formatMoney(low)} – ${formatMoney(high)}`;
}

export function formatMoney(v) {
  if (v >= 1000000) return `€ ${(v / 1000000).toFixed(2)}M`;
  if (v >= 1000) return `€ ${Math.round(v / 1000)}k`;
  return `€ ${Math.round(v)}`;
}
