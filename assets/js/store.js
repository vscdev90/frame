/**
 * Project store — the single source of truth (spec §33), plus
 * versioning and the decision log (spec §28).
 *
 * This build of FRAME runs entirely in the browser on GitHub Pages, so
 * the store is localStorage rather than PostgreSQL. The shape of the
 * data is the shape the API in spec §35 would return, which is what
 * keeps a later server swap a matter of replacing this one module.
 */

const KEY = 'frame.projects.v1';
const SETTINGS_KEY = 'frame.settings.v1';

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Private browsing, blocked storage, quota — the app must keep working.
    return false;
  }
}

export function listProjects() {
  const all = safeRead(KEY, []);
  return Array.isArray(all) ? all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')) : [];
}

export function getProject(id) {
  return listProjects().find((p) => p.id === id) || null;
}

/** The project data model, mirroring spec §33. */
export function newProject(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: `p_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`,
    name: 'Untitled project',
    building_type: null,
    created_at: now,
    updated_at: now,
    site: { address: '', plot_area: 500, orientation: 'north_south', zoning: 'residential' },
    program_answers: {
      bedrooms: 3, bathrooms: 1, workspace: false, openKitchen: true,
      separateLiving: false, utility: false, storage: false, singleStorey: false, notes: ''
    },
    priorities: { privacy: 0.4, garden: 0.5, sustainability: 0.5, budget_discipline: 0.6 },
    budget: { total: 500000 },
    envelope: {},
    quality: 'standard',
    construction_system: null,
    selected_direction: null,
    massing_variant: 0,
    versions: [],
    decisions: [],
    ...overrides
  };
}

export function saveProject(project) {
  const all = safeRead(KEY, []);
  const next = { ...project, updated_at: new Date().toISOString() };
  const idx = all.findIndex((p) => p.id === project.id);
  if (idx >= 0) all[idx] = next; else all.push(next);
  const ok = safeWrite(KEY, all);
  return { project: next, persisted: ok };
}

export function deleteProject(id) {
  const all = safeRead(KEY, []).filter((p) => p.id !== id);
  safeWrite(KEY, all);
}

export function storageAvailable() {
  try {
    const probe = '__frame_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------- */
/* Versioning & decision log (spec §28)                                    */
/* ---------------------------------------------------------------------- */

/** Snapshot the design state under a label: V01, V02, … */
export function addVersion(project, label, summary) {
  const versions = project.versions || [];
  const number = `V${String(versions.length + 1).padStart(2, '0')}`;
  const version = {
    id: `${project.id}_${number}`,
    number,
    label: label || 'Design update',
    created_at: new Date().toISOString(),
    summary: summary || null,
    state: {
      selected_direction: project.selected_direction,
      massing_variant: project.massing_variant,
      budget: { ...project.budget },
      envelope: { ...project.envelope },
      quality: project.quality,
      construction_system: project.construction_system,
      program_answers: { ...project.program_answers }
    }
  };
  return { ...project, versions: [...versions, version] };
}

export function restoreVersion(project, versionId) {
  const version = (project.versions || []).find((v) => v.id === versionId);
  if (!version) return project;
  return { ...project, ...version.state };
}

/** Record a decision: what was decided, why, and whether it still stands. */
export function addDecision(project, { title, reason, status = 'open' }) {
  const decision = {
    id: `d_${Math.random().toString(36).slice(2, 8)}`,
    title,
    reason,
    status,
    created_at: new Date().toISOString()
  };
  return { ...project, decisions: [...(project.decisions || []), decision] };
}

export function setDecisionStatus(project, id, status) {
  return {
    ...project,
    decisions: (project.decisions || []).map((d) => (d.id === id ? { ...d, status } : d))
  };
}

/* ---------------------------------------------------------------------- */
/* Settings                                                                */
/* ---------------------------------------------------------------------- */

export function getSettings() {
  return safeRead(SETTINGS_KEY, { seen_disclaimer: false });
}

export function saveSettings(next) {
  safeWrite(SETTINGS_KEY, { ...getSettings(), ...next });
}

/** Export the whole project as JSON — the architect handoff (spec §38). */
export function exportProject(project, evaluation) {
  return {
    exported_at: new Date().toISOString(),
    generator: 'FRAME — Design Feasibility Platform (static prototype)',
    disclaimer:
      'FRAME provides design exploration and preliminary feasibility information and does not replace professional architectural, structural, planning, legal, financial or building-control advice.',
    project,
    evaluation: evaluation && {
      site: evaluation.site,
      budget: evaluation.budget,
      program: evaluation.program.areas,
      spaces: evaluation.program.spaces,
      direction: evaluation.selected.direction,
      massing: evaluation.selected.massing,
      design_intent: {
        building_type: evaluation.selected.massing.building_type,
        floors: evaluation.selected.massing.floors,
        footprint: evaluation.selected.massing.footprint,
        roof: evaluation.selected.massing.roof,
        orientation: evaluation.selected.massing.orientation
      },
      envelope: evaluation.selected.envelope,
      construction: evaluation.selected.construction.selected,
      cost: evaluation.selected.cost,
      feasibility: evaluation.selected.feasibility,
      risks: evaluation.selected.risks,
      floorplans: evaluation.selected.floorplans,
      rules_applied: evaluation.rules
    }
  };
}
