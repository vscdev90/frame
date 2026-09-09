/**
 * Program → Floorplan (spec §20).
 *
 * "Do not generate floorplans purely as images. Create actual semantic
 * spaces." Every room below is a real object with a polygon, an area,
 * a floor, adjacencies, doors, windows and an orientation — a plan the
 * app can reason about, not a picture of one.
 *
 * The packing is a deterministic recursive slice of the footprint,
 * ordered by the relationship graph, so the same program always yields
 * the same plan.
 */

const WALL = 0.15;

/**
 * Share of a floor plate that ends up as usable room area once internal
 * walls, shafts and structure are deducted. The room polygons tile the
 * whole plate — the reported area is the net area inside them.
 */
const NET_FACTOR = 0.88;

/**
 * @returns {{floors: Array<{level:number, spaces:Array}>, unplaced:Array}}
 */
export function generateFloorplans({ program, massing, model }) {
  const w = massing.footprint.width;
  const d = massing.footprint.depth;
  const floors = massing.floors;
  const spaces = program.spaces.filter((s) => s.priority !== 'wont');

  // Assign spaces to levels, honouring floor_preference but respecting
  // how many levels the massing actually has.
  const perFloor = Array.from({ length: floors }, () => []);
  const scaled = scaleToFit(spaces, massing.gfa);

  for (const s of scaled) {
    let level = Math.min(s.floor_preference, floors - 1);
    if (floors === 1) level = 0;
    perFloor[level].push(s);
  }
  balanceFloors(perFloor, massing);

  const out = [];
  const origin = model.origin;
  for (let level = 0; level < floors; level++) {
    const rect = { x: origin.x + WALL, z: origin.z + WALL, w: w - 2 * WALL, d: d - 2 * WALL };
    // Fit this floor's spaces to the plate exactly: the plan tiles the
    // plate, and the reported room areas are net of internal walls.
    const list = fitToPlate(perFloor[level], rect.w * rect.d).sort((a, b) => b.area - a.area);
    const placed = slice(list, rect, 0);
    out.push({
      level,
      label: level === 0 ? 'Ground floor' : level === 1 ? 'First floor' : `Floor ${level}`,
      area: Math.round(w * d * 10) / 10,
      spaces: placed.map((p) => decorate(p, model, massing, level))
    });
  }
  return { floors: out, gross_per_floor: Math.round(w * d * 10) / 10 };
}

/**
 * Scale the target areas so the program fills the massing exactly.
 * If the massing is smaller than the program, MUST spaces shrink last.
 */
function scaleToFit(spaces, gfa) {
  const netTarget = gfa / 1.28;
  const sumTarget = spaces.reduce((a, s) => a + s.target_area, 0);
  const factor = netTarget / Math.max(1, sumTarget);
  const weight = { must: 0.45, should: 1.0, could: 1.6 };
  return spaces.map((s) => {
    // Deviation from 1.0 is absorbed mostly by lower-priority spaces.
    const w = weight[s.priority] ?? 1;
    const adj = 1 + (factor - 1) * w;
    const area = clamp(s.target_area * adj, s.min_area * 0.85, s.max_area * 1.15);
    return { ...s, area: Math.round(area * 10) / 10 };
  });
}

/** Scale one floor's spaces so their areas fill the plate exactly. */
function fitToPlate(spaces, plateArea) {
  const sum = spaces.reduce((a, s) => a + s.area, 0);
  if (!sum) return spaces.slice();
  const factor = plateArea / sum;
  return spaces.map((s) => ({ ...s, area: Math.round(s.area * factor * 10) / 10 }));
}

function balanceFloors(perFloor, massing) {
  if (perFloor.length < 2) return;
  const target = massing.footprint.width * massing.footprint.depth / 1.28;
  for (let level = 0; level < perFloor.length; level++) {
    let sum = perFloor[level].reduce((a, s) => a + s.area, 0);
    // Move the smallest movable spaces up while this floor is overfull.
    let guard = 0;
    while (sum > target * 1.12 && level + 1 < perFloor.length && guard++ < 20) {
      const movable = perFloor[level]
        .filter((s) => s.priority !== 'must' || s.template === 'workspace')
        .sort((a, b) => a.area - b.area)[0];
      if (!movable) break;
      perFloor[level] = perFloor[level].filter((s) => s !== movable);
      perFloor[level + 1].push(movable);
      sum -= movable.area;
    }
  }
}

/**
 * Recursive area-proportional slicing. Alternates the split direction
 * so rooms stay reasonably proportioned rather than becoming corridors.
 */
function slice(list, rect, depth) {
  if (!list.length) return [];
  if (list.length === 1) {
    return [{ space: list[0], rect }];
  }
  const total = list.reduce((a, s) => a + s.area, 0);
  // Split the list into two groups of roughly equal area.
  let acc = 0, cut = 0;
  for (let i = 0; i < list.length; i++) {
    acc += list[i].area;
    if (acc >= total / 2) { cut = i + 1; break; }
  }
  cut = clamp(cut, 1, list.length - 1);
  const a = list.slice(0, cut);
  const b = list.slice(cut);
  const areaA = a.reduce((x, s) => x + s.area, 0);
  const fraction = areaA / total;

  const splitAlongWidth = rect.w >= rect.d;
  let first = a, second = b, firstFraction = fraction;

  if (!splitAlongWidth) {
    // Splitting north–south: the group that wants the sun goes south
    // (higher z), so the living spaces face the garden rather than
    // landing wherever the area maths happened to put them.
    if (southAffinity(b) > southAffinity(a)) {
      first = b; second = a; firstFraction = 1 - fraction;
    }
  }

  let rectA, rectB;
  if (splitAlongWidth) {
    const wA = rect.w * firstFraction;
    rectA = { ...rect, w: wA };
    rectB = { ...rect, x: rect.x + wA, w: rect.w - wA };
  } else {
    // `first` is the northern band, so the sun-seeking group must be second.
    const dFirst = rect.d * (1 - firstFraction);
    rectA = { ...rect, d: dFirst };
    rectB = { ...rect, z: rect.z + dFirst, d: rect.d - dFirst };
    return [...slice(second, rectA, depth + 1), ...slice(first, rectB, depth + 1)];
  }
  return [...slice(first, rectA, depth + 1), ...slice(second, rectB, depth + 1)];
}

/**
 * How strongly a group of spaces wants a south-facing position:
 * an explicit south preference counts most, a high daylight
 * requirement counts too, and privacy pulls the other way.
 */
function southAffinity(list) {
  return list.reduce((sum, s) => {
    let v = 0;
    if (s.orientation_preference === 'south') v += 3;
    if (s.orientation_preference === 'north') v -= 2;
    if (s.daylight_requirement === 'high') v += 2;
    else if (s.daylight_requirement === 'none') v -= 2;
    if (s.privacy_level === 'high') v -= 1;
    return sum + v * Math.sqrt(Math.max(1, s.area));
  }, 0);
}

/** Attach the semantics: polygon, orientation, windows, doors. */
function decorate({ space, rect }, model, massing, level) {
  const polygon = [
    [rect.x, rect.z],
    [rect.x + rect.w, rect.z],
    [rect.x + rect.w, rect.z + rect.d],
    [rect.x, rect.z + rect.d]
  ];
  const area = Math.round(rect.w * rect.d * NET_FACTOR * 10) / 10;
  const buildingSouth = model.origin.z + massing.footprint.depth;
  const buildingNorth = model.origin.z;
  const buildingWest = model.origin.x;
  const buildingEast = model.origin.x + massing.footprint.width;

  const facades = [];
  if (Math.abs(rect.z + rect.d - buildingSouth) < 0.3) facades.push('south');
  if (Math.abs(rect.z - buildingNorth) < 0.3) facades.push('north');
  if (Math.abs(rect.x - buildingWest) < 0.3) facades.push('west');
  if (Math.abs(rect.x + rect.w - buildingEast) < 0.3) facades.push('east');

  const needsDaylight = space.daylight_requirement !== 'none';
  const windows = needsDaylight && facades.length
    ? facades.slice(0, 2).map((f) => ({
        facade: f,
        // The building-code daylight rule: opening ≥ 10% of floor area.
        area: Math.round(area * (space.daylight_requirement === 'high' ? 0.18 : 0.12) * 10) / 10,
        sill_height: space.privacy_level === 'high' ? 0.9 : 0.4
      }))
    : [];

  return {
    id: space.id,
    name: space.name,
    priority: space.priority,
    floor: level,
    polygon,
    rect: { x: r1(rect.x), z: r1(rect.z), w: r1(rect.w), d: r1(rect.d) },
    area,
    target_area: space.target_area,
    within_target: area >= space.min_area && area <= space.max_area,
    facades,
    orientation_preference: space.orientation_preference,
    orientation_met: facades.includes(space.orientation_preference) || space.orientation_preference === 'any',
    daylight_requirement: space.daylight_requirement,
    daylight_ok: !needsDaylight || facades.length > 0,
    privacy_level: space.privacy_level,
    windows,
    doors: [{ to: 'circulation', width: 0.93 }],
    adjacency: space.adjacency
  };
}

/** Plan quality checks the AI critic and the feasibility engine consume. */
export function checkPlan(floorplans) {
  const issues = [];
  for (const floor of floorplans.floors) {
    for (const s of floor.spaces) {
      if (!s.daylight_ok) {
        issues.push({ severity: 'high', space: s.name, message: `${s.name} has no external facade and cannot meet the daylight requirement.` });
      }
      if (!s.within_target) {
        const dir = s.area < s.target_area ? 'smaller' : 'larger';
        issues.push({ severity: s.priority === 'must' ? 'medium' : 'low', space: s.name, message: `${s.name} is ${dir} than its target (${s.area} m² vs ${s.target_area} m²).` });
      }
      const ratio = Math.max(s.rect.w, s.rect.d) / Math.max(0.1, Math.min(s.rect.w, s.rect.d));
      if (ratio > 3.2) {
        issues.push({ severity: 'medium', space: s.name, message: `${s.name} is proportionally narrow (${s.rect.w} × ${s.rect.d} m) and will plan awkwardly.` });
      }
    }
  }
  return issues;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function r1(v) { return Math.round(v * 10) / 10; }
