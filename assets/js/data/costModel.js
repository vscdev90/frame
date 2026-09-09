/**
 * Cost Engine — unit rate library (spec §24).
 *
 * Every rate is a LOW–HIGH range with a confidence and a stated
 * assumption. The product rule is: ranges, never false precision.
 *
 * Rates are indicative Dutch new-build residential levels, 2026,
 * excluding VAT and excluding land. They are demo data: a quantity
 * surveyor's figure for a real project will differ.
 */

export const BASE_YEAR = 2026;
export const CURRENCY = 'EUR';

/**
 * €/m² gross floor area unless the unit says otherwise.
 * Calibrated so a standard-quality timber-frame house lands around
 * € 2,000 – 2,650 per m² of gross floor area, construction only.
 */
export const UNIT_RATES = {
  foundation: {
    label: 'Foundation',
    unit: 'm2_footprint',
    low: 300,
    high: 370,
    confidence: 0.55,
    assumption: 'Piled foundation on typical Dutch soft soil, no special ground conditions.'
  },
  structure: {
    label: 'Structure',
    unit: 'm2_gfa',
    low: 380,
    high: 470,
    confidence: 0.6,
    assumption: 'Load-bearing walls and floors for the selected construction system.'
  },
  floors: {
    label: 'Floors',
    unit: 'm2_gfa',
    low: 100,
    high: 130,
    confidence: 0.6,
    assumption: 'Floor build-up including screed and underfloor heating provision.'
  },
  roof: {
    label: 'Roof',
    unit: 'm2_roof',
    low: 240,
    high: 300,
    confidence: 0.55,
    assumption: 'Insulated roof build-up with standard covering and rainwater goods.'
  },
  facade: {
    label: 'Facade (closed)',
    unit: 'm2_closed_facade',
    low: 320,
    high: 410,
    confidence: 0.5,
    assumption: 'Insulated cavity or timber-frame facade with a mid-range cladding.'
  },
  glazing: {
    label: 'Windows & glazed facade',
    unit: 'm2_glazing',
    low: 850,
    high: 1150,
    confidence: 0.45,
    assumption: 'Aluminium or timber frames with HR+++ glazing, standard sizes.'
  },
  services: {
    label: 'Installations',
    unit: 'm2_gfa',
    low: 330,
    high: 410,
    confidence: 0.5,
    assumption: 'Heat pump, ventilation, electrical and sanitary distribution, PV provision.'
  },
  finishing: {
    label: 'Finishing',
    unit: 'm2_gfa',
    low: 380,
    high: 520,
    confidence: 0.4,
    assumption: 'Mid-range internal finishing, kitchen and bathrooms at standard specification.'
  },
  siteworks: {
    label: 'Site works & external',
    unit: 'lump_by_plot',
    low: 28,
    high: 48,
    confidence: 0.35,
    assumption: 'Terrain, drainage, paving and basic landscaping per m² of plot area.'
  }
};

/** Soft cost percentages applied on top of construction cost (spec §14). */
export const SOFT_COSTS = {
  professional: {
    label: 'Professional fees',
    low: 0.1,
    high: 0.15,
    confidence: 0.6,
    assumption: 'Architect, structural engineer, building physics and permit coordination.'
  },
  fees: {
    label: 'Permits, levies & taxes',
    low: 0.02,
    high: 0.04,
    confidence: 0.5,
    assumption: 'Permit fees and municipal levies. Excludes VAT and land transfer.'
  },
  contingency: {
    label: 'Contingency',
    low: 0.05,
    high: 0.12,
    confidence: 0.5,
    assumption: 'Reserve for design development, tender variance and unforeseen work.'
  }
};

/** Quality level multiplies the finishing- and glazing-sensitive categories. */
export const QUALITY_LEVELS = {
  basic: { label: 'Basic', factor: 0.86, description: 'Sober, functional specification with standard products.' },
  standard: { label: 'Standard', factor: 1.0, description: 'Good mid-range specification, the default assumption.' },
  high: { label: 'High', factor: 1.24, description: 'Higher-grade materials, joinery and detailing.' }
};

/** Complexity of the geometry drives a surcharge on structure and facade. */
export function complexitySurcharge(complexityScore) {
  // complexityScore 0–100 → 0%–14% surcharge, deterministic and monotonic.
  return (Math.max(0, Math.min(100, complexityScore)) / 100) * 0.14;
}
