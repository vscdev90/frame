/**
 * Program Module (spec §11), Priorities (§12) and the Space
 * Relationship Model (§13).
 *
 * The wizard asks simple questions. This module translates the answers
 * into structured space objects and an adjacency graph — the form the
 * design engines can actually reason with.
 */

/** Template library: everything the wizard can turn on. */
const SPACE_TEMPLATES = {
  living: {
    name: 'Living room', min_area: 24, target_area: 34, max_area: 46,
    floor_preference: 0, orientation_preference: 'south', daylight_requirement: 'high', privacy_level: 'low'
  },
  kitchen: {
    name: 'Kitchen', min_area: 10, target_area: 15, max_area: 22,
    floor_preference: 0, orientation_preference: 'north', daylight_requirement: 'medium', privacy_level: 'low'
  },
  kitchen_open: {
    name: 'Open kitchen / dining', min_area: 16, target_area: 24, max_area: 34,
    floor_preference: 0, orientation_preference: 'south', daylight_requirement: 'high', privacy_level: 'low'
  },
  entrance: {
    name: 'Entrance & hall', min_area: 6, target_area: 9, max_area: 14,
    floor_preference: 0, orientation_preference: 'north', daylight_requirement: 'low', privacy_level: 'low'
  },
  toilet: {
    name: 'Toilet', min_area: 1.6, target_area: 2, max_area: 3,
    floor_preference: 0, orientation_preference: 'any', daylight_requirement: 'none', privacy_level: 'high'
  },
  bedroom_main: {
    name: 'Main bedroom', min_area: 12, target_area: 16, max_area: 22,
    floor_preference: 1, orientation_preference: 'east', daylight_requirement: 'medium', privacy_level: 'high'
  },
  bedroom: {
    name: 'Bedroom', min_area: 9, target_area: 12, max_area: 16,
    floor_preference: 1, orientation_preference: 'east', daylight_requirement: 'medium', privacy_level: 'high'
  },
  bathroom: {
    name: 'Bathroom', min_area: 5, target_area: 8, max_area: 12,
    floor_preference: 1, orientation_preference: 'any', daylight_requirement: 'low', privacy_level: 'high'
  },
  workspace: {
    name: 'Workspace / office', min_area: 8, target_area: 11, max_area: 16,
    floor_preference: 1, orientation_preference: 'north', daylight_requirement: 'high', privacy_level: 'medium'
  },
  utility: {
    name: 'Utility room', min_area: 4, target_area: 6, max_area: 9,
    floor_preference: 0, orientation_preference: 'north', daylight_requirement: 'none', privacy_level: 'medium'
  },
  storage: {
    name: 'Extra storage', min_area: 3, target_area: 6, max_area: 10,
    floor_preference: 0, orientation_preference: 'any', daylight_requirement: 'none', privacy_level: 'medium'
  },
  separate_living: {
    name: 'Separate sitting room', min_area: 12, target_area: 17, max_area: 24,
    floor_preference: 0, orientation_preference: 'west', daylight_requirement: 'medium', privacy_level: 'medium'
  },
  circulation: {
    name: 'Stairs & landing', min_area: 6, target_area: 9, max_area: 13,
    floor_preference: 0, orientation_preference: 'any', daylight_requirement: 'low', privacy_level: 'low'
  }
};

/** MoSCoW priorities (spec §12), ordered strongest first. */
export const PRIORITIES = ['must', 'should', 'could', 'wont'];

export const PRIORITY_LABEL = {
  must: 'Must have',
  should: 'Should have',
  could: 'Could have',
  wont: "Won't have (now)"
};

function makeSpace(id, templateKey, priority, overrides = {}) {
  const t = SPACE_TEMPLATES[templateKey];
  return {
    id,
    template: templateKey,
    name: t.name,
    min_area: t.min_area,
    target_area: t.target_area,
    max_area: t.max_area,
    priority,
    floor_preference: t.floor_preference,
    orientation_preference: t.orientation_preference,
    adjacency: [],
    daylight_requirement: t.daylight_requirement,
    privacy_level: t.privacy_level,
    ...overrides
  };
}

/**
 * Build the structured program from the wizard answers.
 * `answers` is the shape the Program step of the wizard produces.
 */
export function buildProgram(answers) {
  const {
    bedrooms = 3,
    bathrooms = 1,
    workspace = false,
    openKitchen = true,
    separateLiving = false,
    utility = false,
    storage = false,
    singleStorey = false,
    extra_area = 0
  } = answers || {};

  const spaces = [];
  spaces.push(makeSpace('entrance', 'entrance', 'must'));
  spaces.push(makeSpace('living', 'living', 'must'));
  spaces.push(makeSpace('kitchen', openKitchen ? 'kitchen_open' : 'kitchen', 'must'));
  spaces.push(makeSpace('toilet', 'toilet', 'must'));

  for (let i = 0; i < bedrooms; i++) {
    const id = i === 0 ? 'bedroom_main' : `bedroom_${i}`;
    const key = i === 0 ? 'bedroom_main' : 'bedroom';
    // The first two bedrooms are a must, the rest degrade to should/could.
    const priority = i === 0 ? 'must' : i === 1 ? 'must' : i === 2 ? 'should' : 'could';
    spaces.push(makeSpace(id, key, priority));
  }
  for (let i = 0; i < bathrooms; i++) {
    spaces.push(makeSpace(i === 0 ? 'bathroom' : `bathroom_${i}`, 'bathroom', i === 0 ? 'must' : 'should'));
  }
  if (workspace) spaces.push(makeSpace('workspace', 'workspace', 'should'));
  if (separateLiving) spaces.push(makeSpace('separate_living', 'separate_living', 'could'));
  if (utility) spaces.push(makeSpace('utility', 'utility', 'should'));
  if (storage) spaces.push(makeSpace('storage', 'storage', 'could'));

  if (extra_area > 0) {
    // What-if room: unallocated area the client asked to add on top of
    // the named spaces. It is a real space, so it costs real money.
    spaces.push({
      id: 'flex', template: 'flex', name: 'Additional area',
      min_area: extra_area * 0.6, target_area: extra_area, max_area: extra_area * 1.4,
      priority: 'should', floor_preference: 0, orientation_preference: 'any',
      adjacency: [], daylight_requirement: 'medium', privacy_level: 'medium'
    });
  }

  if (singleStorey) spaces.forEach((s) => { s.floor_preference = 0; });
  else spaces.push(makeSpace('circulation', 'circulation', 'must'));

  const graph = buildRelationshipGraph(spaces);
  spaces.forEach((s) => {
    s.adjacency = graph.edges.filter((e) => e.from === s.id || e.to === s.id)
      .map((e) => (e.from === s.id ? e.to : e.from));
  });

  return { spaces, graph, areas: summariseAreas(spaces) };
}

/**
 * Space Relationship Model (spec §13): a graph, not a list. Each edge
 * has a strength, a preferred distance and a preferred floor relation.
 */
export function buildRelationshipGraph(spaces) {
  const has = (id) => spaces.some((s) => s.id === id);
  const candidates = [
    { from: 'entrance', to: 'living', strength: 0.8, preferred_distance: 4, floor_relation: 'same' },
    { from: 'entrance', to: 'toilet', strength: 0.9, preferred_distance: 3, floor_relation: 'same' },
    { from: 'entrance', to: 'circulation', strength: 1.0, preferred_distance: 2, floor_relation: 'same' },
    { from: 'living', to: 'kitchen', strength: 0.95, preferred_distance: 2, floor_relation: 'same' },
    { from: 'kitchen', to: 'utility', strength: 0.85, preferred_distance: 3, floor_relation: 'same' },
    { from: 'living', to: 'separate_living', strength: 0.6, preferred_distance: 4, floor_relation: 'same' },
    { from: 'bedroom_main', to: 'bathroom', strength: 0.9, preferred_distance: 3, floor_relation: 'same' },
    { from: 'bedroom_1', to: 'bathroom', strength: 0.7, preferred_distance: 5, floor_relation: 'same' },
    { from: 'bedroom_2', to: 'bathroom', strength: 0.7, preferred_distance: 5, floor_relation: 'same' },
    { from: 'workspace', to: 'entrance', strength: 0.5, preferred_distance: 6, floor_relation: 'any' },
    { from: 'storage', to: 'entrance', strength: 0.5, preferred_distance: 5, floor_relation: 'same' },
    { from: 'circulation', to: 'bedroom_main', strength: 0.9, preferred_distance: 3, floor_relation: 'above' }
  ];
  const edges = candidates.filter((e) => has(e.from) && has(e.to));
  return { nodes: spaces.map((s) => ({ id: s.id, name: s.name, priority: s.priority })), edges };
}

/** Net → gross conversion. Circulation, walls and structure are real area. */
export const GROSS_FACTOR = 1.28;

export function summariseAreas(spaces) {
  const sum = (list, key) => list.reduce((a, s) => a + s[key], 0);
  const active = spaces.filter((s) => s.priority !== 'wont');
  const must = active.filter((s) => s.priority === 'must');
  const should = active.filter((s) => s.priority === 'should');
  return {
    net_min: round1(sum(must, 'min_area')),
    net_target: round1(sum(active, 'target_area')),
    net_max: round1(sum(active, 'max_area')),
    net_must: round1(sum(must, 'target_area')),
    net_should: round1(sum(should, 'target_area')),
    gross_min: round1(sum(must, 'min_area') * GROSS_FACTOR),
    gross_target: round1(sum(active, 'target_area') * GROSS_FACTOR),
    gross_max: round1(sum(active, 'max_area') * GROSS_FACTOR),
    count: active.length
  };
}

/**
 * Trade-off helper: which spaces would be dropped or shrunk first when
 * the program does not fit the budget. Follows MoSCoW strictly.
 */
export function reductionOrder(spaces) {
  const rank = { could: 0, should: 1, must: 2 };
  return spaces
    .filter((s) => s.priority !== 'wont')
    .slice()
    .sort((a, b) => (rank[a.priority] - rank[b.priority]) || (b.target_area - a.target_area));
}

function round1(v) { return Math.round(v * 10) / 10; }
