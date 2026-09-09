/**
 * Deterministic isometric renderer.
 *
 * Consumes the geometry engine's model directly, so what it draws is
 * the same geometry the cost and feasibility engines measured — not a
 * separate illustration that can drift from the numbers.
 *
 * It is also the fallback when WebGL is unavailable, and the source of
 * the thumbnails used in the comparison view.
 */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

const PALETTE = {
  ground: '#eeece8',
  groundEdge: '#ddd9d4',
  garden: '#e6e9e0',
  roof: '#3f3a35',
  roofLight: '#4b453f',
  wallSun: '#f4f2ef',
  wallShade: '#ddd8d2',
  wallDark: '#cbc5be',
  glass: '#8ea3ae',
  glassDark: '#6f8794',
  line: '#8c857e',
  ink: '#14110f'
};

/** World → screen. Y is up in world space, down on screen. */
function project(x, y, z, s, ox, oy) {
  return [ox + (x - z) * COS30 * s, oy + ((x + z) * SIN30 - y) * s];
}

function poly(points, fill, stroke = PALETTE.line, width = 0.7, extra = '') {
  const d = points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<polygon points="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" ${extra}/>`;
}

/**
 * @param {object} model  output of geometry.buildModel
 * @param {object} opts   { width, height, showSite, showWindows, label }
 * @returns {string} SVG markup
 */
export function renderIso(model, opts = {}) {
  const W = opts.width || 720;
  const H = opts.height || 460;
  const site = model.site;

  // Fit the scene: the plot diagonal drives the scale.
  const span = Math.max(site.width + site.depth, 24);
  const s = (W * 0.66) / (span * COS30);
  const ox = W / 2;
  const oy = H * 0.30;

  const P = (x, y, z) => project(x, y, z, s, ox, oy);
  const parts = [];

  // --- Ground plane -------------------------------------------------
  if (opts.showSite !== false) {
    const g = site.polygon.map(([x, z]) => P(x, 0, z));
    parts.push(poly(g, PALETTE.ground, PALETTE.groundEdge, 1));

    // A soft garden band inside the plot to read as landscape.
    const inset = 1.2;
    const gi = [
      [-site.width / 2 + inset, -site.depth / 2 + inset],
      [site.width / 2 - inset, -site.depth / 2 + inset],
      [site.width / 2 - inset, site.depth / 2 - inset],
      [-site.width / 2 + inset, site.depth / 2 - inset]
    ].map(([x, z]) => P(x, 0, z));
    parts.push(poly(gi, PALETTE.garden, 'none', 0));
  }

  // --- Building mass ------------------------------------------------
  const o = model.origin;
  const w = model.footprint.width;
  const d = model.footprint.depth;
  const eaves = model.roof_geometry.eaves;

  const x0 = o.x, x1 = o.x + w;
  const z0 = o.z, z1 = o.z + d;

  // Drop shadow on the ground, offset towards the north-west.
  const shadow = [
    [x0 - 0.6, z0 - 0.4], [x1 + 1.4, z0 - 0.4], [x1 + 1.4, z1 + 1.2], [x0 - 0.6, z1 + 1.2]
  ].map(([x, z]) => P(x, 0, z));
  parts.push(poly(shadow, 'rgba(20,17,15,.07)', 'none', 0));

  // Two visible walls (south and east) plus the top.
  const south = [P(x0, 0, z1), P(x1, 0, z1), P(x1, eaves, z1), P(x0, eaves, z1)];
  const east = [P(x1, 0, z1), P(x1, 0, z0), P(x1, eaves, z0), P(x1, eaves, z1)];
  parts.push(poly(south, PALETTE.wallSun));
  parts.push(poly(east, PALETTE.wallShade));

  // Floor separation lines read the storey count without a section.
  for (let f = 1; f < model.floors; f++) {
    const y = f * (eaves / model.floors);
    const a = P(x0, y, z1), b = P(x1, y, z1), c = P(x1, y, z0);
    parts.push(`<path d="M${a[0].toFixed(1)},${a[1].toFixed(1)} L${b[0].toFixed(1)},${b[1].toFixed(1)} L${c[0].toFixed(1)},${c[1].toFixed(1)}" fill="none" stroke="${PALETTE.line}" stroke-width="0.5" opacity=".45"/>`);
  }

  // --- Openings -----------------------------------------------------
  if (opts.showWindows !== false) {
    for (const op of model.openings) {
      if (op.face === 'south') {
        const xa = x0 + op.offset, xb = xa + op.width;
        const ya = op.y, yb = op.y + op.height;
        parts.push(poly(
          [P(xa, ya, z1), P(xb, ya, z1), P(xb, yb, z1), P(xa, yb, z1)],
          PALETTE.glass, PALETTE.line, 0.5
        ));
      } else if (op.face === 'east') {
        const za = z0 + op.offset, zb = za + op.width;
        const ya = op.y, yb = op.y + op.height;
        parts.push(poly(
          [P(x1, ya, za), P(x1, ya, zb), P(x1, yb, zb), P(x1, yb, za)],
          PALETTE.glassDark, PALETTE.line, 0.5
        ));
      }
    }
  }

  // --- Roof ---------------------------------------------------------
  const rg = model.roof_geometry;
  if (rg.type === 'gable') {
    const ridge = rg.ridge;
    const mx = (x0 + x1) / 2;
    // South gable end, then the two roof planes.
    parts.push(poly([P(x0, eaves, z1), P(x1, eaves, z1), P(mx, ridge, z1)], PALETTE.wallSun));
    parts.push(poly([P(mx, ridge, z1), P(x1, eaves, z1), P(x1, eaves, z0), P(mx, ridge, z0)], PALETTE.roofLight));
    parts.push(poly([P(x0, eaves, z1), P(mx, ridge, z1), P(mx, ridge, z0), P(x0, eaves, z0)], PALETTE.roof));
  } else if (rg.type === 'mono') {
    parts.push(poly(
      [P(x0, rg.low, z1), P(x1, rg.low, z1), P(x1, rg.high, z0), P(x0, rg.high, z0)],
      PALETTE.roof
    ));
    parts.push(poly([P(x0, eaves, z1), P(x1, eaves, z1), P(x1, rg.low, z1), P(x0, rg.low, z1)], PALETTE.wallShade));
  } else {
    const top = [P(x0, eaves, z0), P(x1, eaves, z0), P(x1, eaves, z1), P(x0, eaves, z1)];
    parts.push(poly(top, PALETTE.roof));
    // Parapet edge.
    parts.push(poly(
      [P(x0, eaves, z1), P(x1, eaves, z1), P(x1, rg.parapet, z1), P(x0, rg.parapet, z1)],
      PALETTE.wallDark
    ));
    if (model.courtyard) {
      const c = model.courtyard.polygon.map(([x, z]) => P(x, eaves, z));
      parts.push(poly(c, PALETTE.garden, PALETTE.line, 0.6));
    }
  }

  // --- North arrow --------------------------------------------------
  if (opts.showSite !== false) {
    const n = P(-site.width / 2 + 1.4, 0, -site.depth / 2 + 1.4);
    parts.push(`<g opacity=".55"><circle cx="${n[0].toFixed(1)}" cy="${n[1].toFixed(1)}" r="11" fill="#fff" stroke="${PALETTE.groundEdge}"/><path d="M${n[0].toFixed(1)},${(n[1] - 7).toFixed(1)} l3.5,9 -3.5,-2.6 -3.5,2.6 z" fill="${PALETTE.ink}"/><text x="${n[0].toFixed(1)}" y="${(n[1] + 20).toFixed(1)}" font-size="8" text-anchor="middle" fill="${PALETTE.ink}" font-family="inherit">N</text></g>`);
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${opts.label || 'Isometric view of the design'}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="font-family:inherit">${parts.join('')}</svg>`;
}

/** Flat 2D site plan: plot, buildable envelope, footprint, north. */
export function renderSitePlan(model, envelope, opts = {}) {
  const W = opts.width || 720;
  const H = opts.height || 460;
  const site = model.site;
  const pad = 26;
  const s = Math.min((W - pad * 2) / site.width, (H - pad * 2) / site.depth);
  const ox = W / 2, oy = H / 2;
  const P = (x, z) => [ox + x * s, oy + z * s];

  const parts = [];
  const plot = site.polygon.map(([x, z]) => P(x, z));
  parts.push(poly(plot, PALETTE.ground, '#b9b3ac', 1.2));

  if (envelope) {
    const bx = envelope.width / 2, bz = envelope.depth / 2;
    const env = [P(-bx, -bz), P(bx, -bz), P(bx, bz), P(-bx, bz)];
    parts.push(`<polygon points="${env.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#8c857e" stroke-width="1" stroke-dasharray="5 4"/>`);
  }

  const o = model.origin;
  const fp = [
    P(o.x, o.z), P(o.x + model.footprint.width, o.z),
    P(o.x + model.footprint.width, o.z + model.footprint.depth), P(o.x, o.z + model.footprint.depth)
  ];
  parts.push(poly(fp, '#14110f', '#14110f', 1));

  if (model.courtyard) {
    const c = model.courtyard.polygon.map(([x, z]) => P(x, z));
    parts.push(poly(c, PALETTE.ground, '#14110f', 1));
  }

  parts.push(`<text x="${W - 16}" y="${H - 14}" text-anchor="end" font-size="10" fill="#57534e">Plot ${Math.round(site.width * site.depth)} m² · footprint ${Math.round(model.footprint.width * model.footprint.depth)} m²</text>`);
  parts.push(`<g opacity=".6"><path d="M${pad},${pad + 14} l3.5,9 -3.5,-2.6 -3.5,2.6 z" fill="#14110f"/><text x="${pad}" y="${pad + 34}" font-size="9" text-anchor="middle" fill="#14110f">N</text></g>`);

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="Site plan" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="font-family:inherit">${parts.join('')}</svg>`;
}
