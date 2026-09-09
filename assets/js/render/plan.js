/**
 * Floorplan renderer.
 *
 * Draws the semantic spaces produced by the layout engine — every
 * rectangle here is a real space object with an area, an orientation
 * and a daylight requirement, not a decorative graphic (spec §20).
 */

const COLORS = {
  wall: '#14110f',
  fill: '#ffffff',
  fillMuted: '#f4f2ef',
  fillWarn: '#fdf3e3',
  text: '#14110f',
  soft: '#8a8480',
  glass: '#8ea3ae'
};

export function renderFloorplan(floor, massing, model, opts = {}) {
  const W = opts.width || 720;
  const H = opts.height || 460;
  const pad = 34;
  const w = massing.footprint.width;
  const d = massing.footprint.depth;
  const s = Math.min((W - pad * 2) / w, (H - pad * 2) / d);
  const ox = W / 2 - (model.origin.x + w / 2) * s;
  const oy = H / 2 - (model.origin.z + d / 2) * s;
  const P = (x, z) => [ox + x * s, oy + z * s];

  const parts = [];

  // Outer shell.
  const shell = [
    P(model.origin.x, model.origin.z),
    P(model.origin.x + w, model.origin.z),
    P(model.origin.x + w, model.origin.z + d),
    P(model.origin.x, model.origin.z + d)
  ];
  parts.push(`<polygon points="${shell.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${COLORS.fillMuted}" stroke="${COLORS.wall}" stroke-width="2.4"/>`);

  for (const space of floor.spaces) {
    const [x, y] = P(space.rect.x, space.rect.z);
    const rw = space.rect.w * s;
    const rh = space.rect.d * s;
    const fill = space.within_target ? COLORS.fill : COLORS.fillWarn;
    const selected = opts.selected === space.id;
    parts.push(
      `<g class="plan-space" data-space="${space.id}" tabindex="0" role="button" aria-label="${space.name}, ${space.area} square metres">
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}"
              fill="${selected ? '#eef2f4' : fill}" stroke="${COLORS.wall}" stroke-width="${selected ? 2 : 1}" />
      </g>`
    );

    // Windows on the external facades of this space.
    for (const win of space.windows) {
      parts.push(windowMark(space, win, P, s));
    }

    if (rw > 46 && rh > 26) {
      const cx = x + rw / 2;
      const cy = y + rh / 2;
      const name = space.name.length > 18 && rw < 110 ? space.name.split(' ')[0] : space.name;
      parts.push(`<text x="${cx.toFixed(1)}" y="${(cy - 2).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="${COLORS.text}" font-family="inherit">${escapeText(name)}</text>`);
      if (rh > 40) {
        parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + 12).toFixed(1)}" text-anchor="middle" font-size="9" fill="${COLORS.soft}" font-family="inherit">${space.area} m²</text>`);
      }
    }
  }

  // Dimension line along the south facade.
  const dimY = P(0, model.origin.z + d)[1] + 18;
  const xa = P(model.origin.x, 0)[0];
  const xb = P(model.origin.x + w, 0)[0];
  parts.push(`<g stroke="${COLORS.soft}" stroke-width=".8"><path d="M${xa},${dimY} H${xb}"/><path d="M${xa},${dimY - 4} V${dimY + 4}"/><path d="M${xb},${dimY - 4} V${dimY + 4}"/></g>`);
  parts.push(`<text x="${((xa + xb) / 2).toFixed(1)}" y="${(dimY + 15).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${COLORS.soft}" font-family="inherit">${w.toFixed(1)} m</text>`);

  parts.push(`<g opacity=".6"><path d="M${W - 30},${28} l3.5,9 -3.5,-2.6 -3.5,2.6 z" fill="${COLORS.text}"/><text x="${W - 30}" y="${48}" font-size="9" text-anchor="middle" fill="${COLORS.text}">N</text></g>`);

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${floor.label} plan" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="font-family:inherit">${parts.join('')}</svg>`;
}

function windowMark(space, win, P, s) {
  const r = space.rect;
  const len = Math.max(10, Math.min(win.area * 2.2 * s * 0.1 + 12, (win.facade === 'north' || win.facade === 'south' ? r.w : r.d) * s * 0.6));
  let a, b;
  if (win.facade === 'south') {
    const cx = r.x + r.w / 2;
    a = P(cx, r.z + r.d); b = [a[0] + len, a[1]];
    a = [a[0] - len / 2, a[1]]; b = [a[0] + len, a[1]];
  } else if (win.facade === 'north') {
    const cx = r.x + r.w / 2;
    a = P(cx, r.z); a = [a[0] - len / 2, a[1]]; b = [a[0] + len, a[1]];
  } else if (win.facade === 'east') {
    const cz = r.z + r.d / 2;
    a = P(r.x + r.w, cz); a = [a[0], a[1] - len / 2]; b = [a[0], a[1] + len];
  } else {
    const cz = r.z + r.d / 2;
    a = P(r.x, cz); a = [a[0], a[1] - len / 2]; b = [a[0], a[1] + len];
  }
  return `<path d="M${a[0].toFixed(1)},${a[1].toFixed(1)} L${b[0].toFixed(1)},${b[1].toFixed(1)}" stroke="${COLORS.glass}" stroke-width="3.2" stroke-linecap="round"/>`;
}

/**
 * Facade elevation, drawn from the same openings the cost engine priced.
 */
export function renderElevation(model, massing, face = 'south', opts = {}) {
  const W = opts.width || 720;
  const H = opts.height || 380;
  const pad = 40;
  const width = face === 'south' || face === 'north' ? massing.footprint.width : massing.footprint.depth;
  const height = massing.height;
  const s = Math.min((W - pad * 2) / width, (H - pad * 2) / (height + 1));
  const ox = (W - width * s) / 2;
  const oy = H - pad - 6;
  const X = (x) => ox + x * s;
  const Y = (y) => oy - y * s;

  const parts = [];
  parts.push(`<line x1="${pad / 2}" y1="${oy}" x2="${W - pad / 2}" y2="${oy}" stroke="#b9b3ac" stroke-width="1"/>`);

  const eaves = massing.floors * massing.floor_height;
  parts.push(`<rect x="${X(0)}" y="${Y(eaves)}" width="${(width * s).toFixed(1)}" height="${(eaves * s).toFixed(1)}" fill="#f4f2ef" stroke="#14110f" stroke-width="1.4"/>`);

  if (massing.roof === 'gable') {
    parts.push(`<polygon points="${X(0)},${Y(eaves)} ${X(width / 2)},${Y(massing.height)} ${X(width)},${Y(eaves)}" fill="#e7e4e0" stroke="#14110f" stroke-width="1.4"/>`);
  } else {
    parts.push(`<rect x="${X(-0.15)}" y="${Y(eaves + 0.4)}" width="${((width + 0.3) * s).toFixed(1)}" height="${(0.4 * s).toFixed(1)}" fill="#ddd8d2" stroke="#14110f" stroke-width="1.2"/>`);
  }

  for (let f = 1; f < massing.floors; f++) {
    parts.push(`<line x1="${X(0)}" y1="${Y(f * massing.floor_height)}" x2="${X(width)}" y2="${Y(f * massing.floor_height)}" stroke="#c9c3bc" stroke-width=".7" stroke-dasharray="4 4"/>`);
  }

  for (const op of model.openings.filter((o) => o.face === face)) {
    parts.push(`<rect x="${X(op.offset)}" y="${Y(op.y + op.height)}" width="${(op.width * s).toFixed(1)}" height="${(op.height * s).toFixed(1)}" fill="#8ea3ae" stroke="#14110f" stroke-width="1"/>`);
  }

  parts.push(`<text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#8a8480" font-family="inherit">${face.charAt(0).toUpperCase() + face.slice(1)} elevation · ${width.toFixed(1)} × ${height.toFixed(1)} m</text>`);

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${face} elevation" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="font-family:inherit">${parts.join('')}</svg>`;
}

function escapeText(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
