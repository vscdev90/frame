/**
 * Geometry Engine (spec §18).
 *
 * The rule the whole product rests on: geometry is deterministic.
 * A design direction produces structured intent — this module turns
 * that intent into actual geometry. No model, no randomness, no
 * "roughly like the picture".
 *
 * Output is renderer-agnostic: the Three.js viewer and the SVG
 * fallback both consume exactly this model.
 */

/**
 * @param {object} massing  a candidate from the massing engine
 * @param {object} site     plot dimensions and orientation
 * @param {object} envelope glazing intent from the envelope engine
 */
export function buildModel(massing, site, envelope) {
  const plotW = site.plot_width || 22;
  const plotD = site.plot_depth || 26;
  const w = massing.footprint.width;
  const d = massing.footprint.depth;

  // Centre the building on the plot, pushed towards the street.
  const originX = -w / 2;
  const originZ = -plotD / 2 + (site.setback_front || 5);

  const outline = massing.courtyard
    ? courtyardOutline(originX, originZ, w, d, massing.courtyard)
    : rectOutline(originX, originZ, w, d);

  const volumes = [];
  for (let f = 0; f < massing.floors; f++) {
    const y0 = f * massing.floor_height;
    // The top storey of a "stacked" mass may be set back — handled by the
    // massing candidate, not invented here.
    volumes.push({
      kind: 'storey',
      level: f,
      polygon: outline,
      y0,
      y1: y0 + massing.floor_height
    });
  }

  const eaves = massing.floors * massing.floor_height;
  const roof = buildRoof(massing, outline, eaves, w, d, originX, originZ);
  const openings = buildOpenings(massing, envelope, originX, originZ, w, d);

  return {
    building_type: massing.building_type,
    floors: massing.floors,
    footprint: { width: w, depth: d },
    roof: massing.roof,
    orientation: massing.orientation,
    origin: { x: originX, z: originZ },
    site: {
      width: plotW,
      depth: plotD,
      polygon: rectOutline(-plotW / 2, -plotD / 2, plotW, plotD)
    },
    volumes,
    roof_geometry: roof,
    openings,
    height: massing.height,
    courtyard: massing.courtyard
      ? { polygon: courtyardHole(originX, originZ, w, d, massing.courtyard) }
      : null
  };
}

/** The structured design intent the spec shows as the engine's contract. */
export function designIntent(massing) {
  return {
    building_type: massing.building_type,
    floors: massing.floors,
    footprint: { width: massing.footprint.width, depth: massing.footprint.depth },
    roof: massing.roof,
    orientation: massing.orientation
  };
}

function rectOutline(x, z, w, d) {
  return [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];
}

function courtyardHole(x, z, w, d, ct) {
  const cx = x + (w - ct.width) / 2;
  const cz = z + (d - ct.depth) * 0.6;
  return rectOutline(cx, cz, ct.width, ct.depth);
}

/** An O-shaped plan, expressed as a single outline plus a hole. */
function courtyardOutline(x, z, w, d, ct) {
  const outer = rectOutline(x, z, w, d);
  outer.hole = courtyardHole(x, z, w, d, ct);
  return outer;
}

function buildRoof(massing, outline, eaves, w, d, x, z) {
  if (massing.roof === 'gable') {
    const ridgeY = eaves + 2.6;
    return {
      type: 'gable',
      eaves,
      ridge: ridgeY,
      // Ridge runs along the length of the building.
      ridge_line: [[x + w / 2, z, ridgeY], [x + w / 2, z + d, ridgeY]],
      outline
    };
  }
  if (massing.roof === 'mono') {
    return { type: 'mono', eaves, high: eaves + 1.6, low: eaves + 0.2, outline };
  }
  return { type: 'flat', eaves, parapet: eaves + 0.4, outline };
}

/**
 * Envelope & Window Engine (spec §22) — turn a glazing ratio into
 * actual openings with a size, sill height, orientation and shading.
 * Deterministic: openings are laid out on a fixed rhythm.
 */
function buildOpenings(massing, envelope, x, z, w, d) {
  const ratio = envelope.glazing_ratio;
  const openings = [];
  const faces = [
    { name: 'south', length: w, weight: envelope.south_bias, axis: 'x', at: z + d },
    { name: 'north', length: w, weight: 0.5, axis: 'x', at: z },
    { name: 'east', length: d, weight: 0.7, axis: 'z', at: x + w },
    { name: 'west', length: d, weight: 0.7, axis: 'z', at: x }
  ];
  const totalWeight = faces.reduce((a, f) => a + f.weight * f.length, 0);

  for (let f = 0; f < massing.floors; f++) {
    const y0 = f * massing.floor_height;
    for (const face of faces) {
      const faceArea = face.length * massing.floor_height;
      const share = (face.weight * face.length) / totalWeight;
      const glazedArea = ratio * massing.facade_area * share / massing.floors;
      if (glazedArea < 1) continue;

      // Ground floor gets full-height glazing on the garden side when the
      // direction asks for an open connection; upper floors get windows.
      const fullHeight = f === 0 && face.name === 'south' && ratio > 0.28;
      const h = fullHeight ? 2.4 : Math.min(1.8, massing.floor_height - 1.2);
      const sill = fullHeight ? 0.05 : 0.9;
      const totalWidth = Math.min(face.length - 1.2, glazedArea / h);
      if (totalWidth < 0.6) continue;

      const count = Math.max(1, Math.round(totalWidth / (fullHeight ? 2.6 : 1.4)));
      const unitW = totalWidth / count;
      const gap = (face.length - totalWidth) / (count + 1);

      for (let i = 0; i < count; i++) {
        const offset = gap * (i + 1) + unitW * i;
        openings.push({
          face: face.name,
          level: f,
          width: round2(unitW),
          height: round2(h),
          sill_height: sill,
          y: y0 + sill,
          offset: round2(offset),
          axis: face.axis,
          at: face.at,
          glass: 'HR+++ triple',
          frame: fullHeight ? 'aluminium slim' : 'aluminium standard',
          opening_type: i === 0 ? 'sliding' : 'fixed',
          shading: face.name === 'south' && ratio > 0.3 ? 'external screen required' : 'none'
        });
      }
    }
  }
  return openings;
}

/** Total glazed area actually placed — used by the cost engine. */
export function glazedArea(model) {
  return Math.round(model.openings.reduce((a, o) => a + o.width * o.height, 0) * 10) / 10;
}

function round2(v) { return Math.round(v * 100) / 100; }
