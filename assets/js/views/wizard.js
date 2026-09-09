import { el, esc, icons, money, moneyExact, area, meter, toast } from '../ui.js';
import { getProject, saveProject, newProject, addVersion, addDecision } from '../store.js';
import { computeProject } from '../engines/pipeline.js';
import { renderIso, renderSitePlan } from '../render/iso.js';

export const STEPS = [
  { id: 'project', label: 'Project' },
  { id: 'location', label: 'Location' },
  { id: 'program', label: 'Program' },
  { id: 'budget', label: 'Budget' },
  { id: 'design', label: 'Design' },
  { id: 'results', label: 'Results' }
];

const BUILDING_TYPES = [
  { id: 'detached_house', label: 'New home', note: 'A new dwelling on your plot' },
  { id: 'extension', label: 'Extension', note: 'Adding to an existing house' },
  { id: 'renovation', label: 'Renovation', note: 'Reworking what is there' },
  { id: 'outbuilding', label: 'Outbuilding', note: 'Studio, garage or annex' },
  { id: 'apartment_conversion', label: 'Apartment conversion', note: 'Splitting or converting' },
  { id: 'other', label: 'Other', note: 'Something else entirely' }
];

/** Small abstract thumbnails, drawn rather than photographed. */
function typeThumb(id) {
  const base = (inner) => `<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="160" height="120" fill="#efedea"/>
    <rect y="86" width="160" height="34" fill="#e3e5df"/>${inner}</svg>`;
  const shapes = {
    detached_house: '<rect x="42" y="52" width="76" height="34" fill="#2f2b28"/><rect x="42" y="46" width="80" height="7" fill="#1d1b19"/><rect x="52" y="60" width="26" height="20" fill="#f0dcb8"/><rect x="86" y="60" width="22" height="20" fill="#4a4542"/>',
    extension: '<rect x="34" y="44" width="52" height="42" fill="#4a4542"/><rect x="86" y="58" width="46" height="28" fill="#2f2b28"/><rect x="94" y="64" width="30" height="16" fill="#f0dcb8"/>',
    renovation: '<rect x="44" y="42" width="72" height="44" fill="#3a3633"/><path d="M44 42h72v10H44z" fill="#1d1b19"/><rect x="54" y="58" width="20" height="20" fill="#f0dcb8"/><rect x="84" y="58" width="20" height="20" fill="#f0dcb8" opacity=".45"/><path d="M40 86h80" stroke="#8a8480" stroke-width="2" stroke-dasharray="5 4"/>',
    outbuilding: '<rect x="56" y="60" width="48" height="26" fill="#2f2b28"/><rect x="56" y="55" width="52" height="6" fill="#1d1b19"/><rect x="64" y="66" width="18" height="14" fill="#f0dcb8"/>',
    apartment_conversion: '<rect x="46" y="34" width="68" height="52" fill="#3a3633"/><g fill="#f0dcb8"><rect x="54" y="42" width="16" height="12"/><rect x="78" y="42" width="16" height="12"/><rect x="54" y="60" width="16" height="12"/><rect x="78" y="60" width="16" height="12"/></g>',
    other: '<rect x="48" y="50" width="64" height="36" fill="#2f2b28"/><path d="M48 50l32-16 32 16" fill="#1d1b19"/><rect x="72" y="64" width="16" height="22" fill="#f0dcb8"/>'
  };
  return base(shapes[id] || shapes.other);
}

function stepbar(current) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return `<div class="stepbar" role="list">
    ${STEPS.map((s, i) => `
      <div class="step ${i === idx ? 'active' : i < idx ? 'done' : ''}" role="listitem">
        <span class="dot">${i < idx ? icons.check : i + 1}</span>
        <span class="label">${s.label}</span>
      </div>`).join('')}
  </div>`;
}

function shell(current, inner) {
  return `<div class="wrap">
    ${stepbar(current)}
    ${inner}
  </div>`;
}

/** Persist and re-render helper shared by every step. */
function commit(project) {
  const { project: saved, persisted } = saveProject(project);
  if (!persisted) toast('Could not save — browser storage is unavailable.');
  return saved;
}

/* ====================================================================== */

export function wizard(ctx) {
  const { step, navigate } = ctx;
  let project = ctx.projectId ? getProject(ctx.projectId) : null;

  if (!project) {
    project = commit(newProject());
    navigate(`#/project/${project.id}/project`, { replace: true });
  }

  switch (step) {
    case 'project': return stepProject(project, navigate);
    case 'location': return stepLocation(project, navigate);
    case 'program': return stepProgram(project, navigate);
    case 'budget': return stepBudget(project, navigate);
    case 'design': return stepDesign(project, navigate);
    default: return stepProject(project, navigate);
  }
}

/* ---------------------------------------------------------------- 01 --- */

function stepProject(project, navigate) {
  const node = el(shell('project', `
    <div class="wizard-head">
      <h2>What are you planning to build?</h2>
      <p class="muted">Choose the option that best fits your plans.</p>
    </div>
    <div class="tiles">
      ${BUILDING_TYPES.map((t) => `
        <button class="tile" data-type="${t.id}" aria-pressed="${project.building_type === t.id}">
          <span class="thumb">${typeThumb(t.id)}</span>
          <span class="tile-label">${t.label}<small>${t.note}</small></span>
        </button>`).join('')}
    </div>
    <label class="field" style="margin-top:28px;max-width:420px">
      <span>Project name</span>
      <input type="text" id="pname" value="${esc(project.name === 'Untitled project' ? '' : project.name)}" placeholder="e.g. House Bloemendaal">
    </label>
    <div class="wizard-actions">
      <button class="btn quiet" data-nav="home">${icons.arrowLeft} Back</button>
      <button class="btn" data-nav="next" ${project.building_type ? '' : 'disabled'}>Next ${icons.arrowRight}</button>
    </div>`));

  node.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-type]');
    if (tile) {
      project.building_type = tile.dataset.type;
      node.querySelectorAll('.tile').forEach((t) => t.setAttribute('aria-pressed', String(t === tile)));
      node.querySelector('[data-nav="next"]').disabled = false;
      commit(project);
      return;
    }
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    if (nav.dataset.nav === 'home') return navigate('#/');
    const name = node.querySelector('#pname').value.trim();
    project.name = name || `${BUILDING_TYPES.find((t) => t.id === project.building_type)?.label || 'Project'} — untitled`;
    commit(project);
    navigate(`#/project/${project.id}/location`);
  });

  return node;
}

/* ---------------------------------------------------------------- 02 --- */

function stepLocation(project, navigate) {
  const site = project.site;
  const ev = computeProject(project);

  const node = el(shell('location', `
    <div class="wizard-head">
      <h2>Where is the project?</h2>
      <p class="muted">Enter the address and the plot dimensions.</p>
    </div>

    <div class="split">
      <div>
        <label class="field">
          <span>Address</span>
          <input type="text" id="address" value="${esc(site.address)}" placeholder="Street, number, town">
        </label>
        <div class="viewport" style="min-height:340px">
          <span class="vp-label">Plot &amp; buildable envelope</span>
          <div id="siteplan">${renderSitePlan(ev.selected.model, envelopeOf(ev))}</div>
        </div>
        <div class="notice" style="margin-top:14px">
          <strong>No address lookup in this build.</strong> FRAME is running as a static site, so it cannot retrieve
          the parcel, footprints or the omgevingsplan for this address. The plot values below are yours to set;
          the planning limits come from an indicative model ruleset, not from your municipality.
        </div>
      </div>

      <div class="card">
        <div class="eyebrow">Plot data</div>
        <label class="field">
          <span>Plot area (m²)</span>
          <input type="number" id="plot_area" min="80" max="5000" step="10" value="${site.plot_area}">
        </label>
        <label class="field">
          <span>Frontage — plot width at the street (m)</span>
          <input type="number" id="frontage" min="6" max="120" step="0.5" value="${ev.site.frontage}">
        </label>
        <label class="field">
          <span>Orientation of the garden</span>
          <select id="orientation">
            <option value="north_south" ${site.orientation === 'north_south' ? 'selected' : ''}>Garden to the south</option>
            <option value="east_west" ${site.orientation === 'east_west' ? 'selected' : ''}>Garden to the west</option>
          </select>
        </label>
        <hr class="divider" style="margin:16px 0">
        <div class="eyebrow">Indicative limits</div>
        <table class="data">
          <tbody>
            ${ev.rules.filter((r) => ['coverage', 'height', 'massing'].includes(r.category)).map((r) => `
              <tr>
                <td>${esc(r.parameter.replace(/_/g, ' '))}</td>
                <td class="num">${r.unit === 'ratio' ? Math.round(r.value * 100) + '%' : r.value + ' ' + r.unit}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <details class="disclose" style="margin-top:8px">
          <summary>Where these come from</summary>
          <div class="small muted">
            ${ev.rules.slice(0, 4).map((r) => `<div style="margin-bottom:8px"><strong>${esc(r.rule_id)}</strong> · ${esc(r.source)} · confidence ${Math.round(r.confidence * 100)}%<br>${esc(r.description)}</div>`).join('')}
          </div>
        </details>
      </div>
    </div>

    <div class="wizard-actions">
      <button class="btn quiet" data-nav="back">${icons.arrowLeft} Back</button>
      <button class="btn" data-nav="next">Next ${icons.arrowRight}</button>
    </div>`));

  const redraw = () => {
    const next = computeProject(project);
    node.querySelector('#siteplan').innerHTML = renderSitePlan(next.selected.model, envelopeOf(next));
  };

  node.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'address') project.site.address = t.value;
    if (t.id === 'plot_area') project.site.plot_area = clampNum(t.value, 80, 5000, 500);
    if (t.id === 'frontage') project.site.frontage = clampNum(t.value, 6, 120, 18);
    if (t.id === 'orientation') project.site.orientation = t.value;
    commit(project);
    if (t.id !== 'address') redraw();
  });

  node.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    if (nav.dataset.nav === 'back') return navigate(`#/project/${project.id}/project`);
    if (!project.site.address.trim()) project.site.address = 'Address not set';
    commit(project);
    navigate(`#/project/${project.id}/program`);
  });

  redraw();
  return node;
}

function envelopeOf(ev) {
  const c = ev.constraints;
  const setSide = c.setback_side?.value ?? 3;
  const setFront = c.setback_front?.value ?? 5;
  const setRear = c.setback_rear?.value ?? 8;
  return {
    width: Math.max(4, ev.site.plot_width - 2 * setSide),
    depth: Math.max(5, ev.site.plot_depth - setFront - setRear)
  };
}

/* ---------------------------------------------------------------- 03 --- */

function stepProgram(project, navigate) {
  const a = project.program_answers;
  const toggles = [
    ['workspace', 'Workspace / office', icons.desk],
    ['openKitchen', 'Open kitchen', icons.kitchen],
    ['separateLiving', 'Separate living room', icons.sofa],
    ['utility', 'Utility room', icons.utility],
    ['storage', 'Extra storage', icons.box],
    ['singleStorey', 'Everything on one level', icons.layers]
  ];

  const node = el(shell('program', `
    <div class="wizard-head">
      <h2>What do you need?</h2>
      <p class="muted">Tell us about your ideal home. You can always adjust this later.</p>
    </div>

    <div class="split">
      <div>
        <div class="needs">
          <div class="need">
            <span class="icon">${icons.bed}</span><span class="name">Bedrooms</span>
            <span class="stepper"><button data-count="bedrooms" data-delta="-1" aria-label="Fewer bedrooms">–</button><output id="out-bedrooms">${a.bedrooms}</output><button data-count="bedrooms" data-delta="1" aria-label="More bedrooms">+</button></span>
          </div>
          <div class="need">
            <span class="icon">${icons.bath}</span><span class="name">Bathrooms</span>
            <span class="stepper"><button data-count="bathrooms" data-delta="-1" aria-label="Fewer bathrooms">–</button><output id="out-bathrooms">${a.bathrooms}</output><button data-count="bathrooms" data-delta="1" aria-label="More bathrooms">+</button></span>
          </div>
          ${toggles.map(([key, label, icon]) => `
            <div class="need">
              <span class="icon">${icon}</span><span class="name">${label}</span>
              <button class="switch" role="switch" data-toggle="${key}" aria-checked="${!!a[key]}" aria-label="${label}"></button>
            </div>`).join('')}
        </div>

        <label class="field" style="margin-top:20px">
          <span>Anything else?</span>
          <textarea id="notes" placeholder="E.g. a gym, guest room or studio…">${esc(a.notes || '')}</textarea>
        </label>
      </div>

      <div class="card">
        <div class="eyebrow">What matters most</div>
        <p class="small muted">These steer the design directions and the trade-offs FRAME is willing to make.</p>
        ${[['privacy', 'Privacy from neighbours'], ['garden', 'Connection to the garden'], ['sustainability', 'Sustainability']].map(([k, label]) => `
          <label class="field" style="margin-top:14px">
            <span>${label}</span>
            <input type="range" min="0" max="100" value="${Math.round((project.priorities[k] ?? 0.5) * 100)}" data-priority="${k}">
          </label>`).join('')}

        <hr class="divider" style="margin:18px 0">
        <div class="eyebrow">Program so far</div>
        <div id="program-summary"></div>
        <details class="disclose" style="margin-top:6px">
          <summary>All spaces and priorities</summary>
          <div id="space-list" class="small"></div>
        </details>
      </div>
    </div>

    <div class="wizard-actions">
      <button class="btn quiet" data-nav="back">${icons.arrowLeft} Back</button>
      <button class="btn" data-nav="next">Next ${icons.arrowRight}</button>
    </div>`));

  const summary = node.querySelector('#program-summary');
  const spaceList = node.querySelector('#space-list');

  function redraw() {
    const ev = computeProject(project);
    const ar = ev.program.areas;
    summary.innerHTML = `
      <div class="stats three" style="margin-bottom:10px">
        <div class="stat"><div class="v">${ar.count}</div><div class="k">spaces</div></div>
        <div class="stat"><div class="v">${Math.round(ar.net_target)}</div><div class="k">m² net</div></div>
        <div class="stat"><div class="v">${Math.round(ar.gross_target)}</div><div class="k">m² gross</div></div>
      </div>
      <p class="small muted">Gross floor area adds circulation, walls and structure at ${Math.round((ar.gross_target / ar.net_target) * 100 - 100)}% on top of the room areas.</p>`;
    spaceList.innerHTML = `<table class="data">${ev.program.spaces.map((s) => `
      <tr><td>${esc(s.name)}</td><td class="num">${s.target_area} m²</td><td class="num"><span class="tag">${s.priority}</span></td></tr>`).join('')}</table>`;
  }

  node.addEventListener('click', (e) => {
    const count = e.target.closest('[data-count]');
    if (count) {
      const key = count.dataset.count;
      const limits = key === 'bedrooms' ? [1, 8] : [1, 4];
      a[key] = Math.max(limits[0], Math.min(limits[1], a[key] + Number(count.dataset.delta)));
      node.querySelector(`#out-${key}`).textContent = a[key];
      commit(project); redraw();
      return;
    }
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const key = toggle.dataset.toggle;
      a[key] = !a[key];
      toggle.setAttribute('aria-checked', String(a[key]));
      commit(project); redraw();
      return;
    }
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    if (nav.dataset.nav === 'back') return navigate(`#/project/${project.id}/location`);
    navigate(`#/project/${project.id}/budget`);
  });

  node.addEventListener('input', (e) => {
    if (e.target.id === 'notes') { a.notes = e.target.value; commit(project); }
    const pr = e.target.closest('[data-priority]');
    if (pr) {
      project.priorities[pr.dataset.priority] = Number(pr.value) / 100;
      commit(project); redraw();
    }
  });

  redraw();
  return node;
}

/* ---------------------------------------------------------------- 04 --- */

function stepBudget(project, navigate) {
  const node = el(shell('budget', `
    <div class="wizard-head">
      <h2>Set your budget</h2>
      <p class="muted">Adjust the budget to see what is possible.</p>
    </div>

    <div class="split">
      <div class="card">
        <div id="budget-value" style="font-size:2.6rem;letter-spacing:-.03em"></div>
        <input type="range" id="budget" min="150000" max="1500000" step="10000" value="${project.budget.total}" style="margin:22px 0 10px">
        <div class="row between small muted"><span>€ 150k</span><span>€ 1.5M</span></div>
        <hr class="divider">
        <div class="eyebrow">How FRAME splits this</div>
        <div id="budget-split"></div>
        <hr class="divider">
        <div class="eyebrow">What this budget buys</div>
        <div id="budget-feedback"></div>
      </div>

      <div class="card">
        <div class="eyebrow">What's included</div>
        <div id="included"></div>
        <div class="notice" style="margin-top:16px">
          FRAME provides indicative financial scenarios. It is <strong>not</strong> mortgage advice and not a
          quantity surveyor's estimate. Figures exclude VAT and the cost of the land.
        </div>
      </div>
    </div>

    <div class="wizard-actions">
      <button class="btn quiet" data-nav="back">${icons.arrowLeft} Back</button>
      <button class="btn" data-nav="next">Next ${icons.arrowRight}</button>
    </div>`));

  const valueEl = node.querySelector('#budget-value');
  const splitEl = node.querySelector('#budget-split');
  const feedbackEl = node.querySelector('#budget-feedback');
  const includedEl = node.querySelector('#included');

  function redraw() {
    const ev = computeProject(project);
    const b = ev.budget;
    valueEl.textContent = moneyExact(b.total);

    splitEl.innerHTML = `<table class="data">
      <tr><td>Construction budget</td><td class="num">${moneyExact(b.construction_budget)}</td></tr>
      <tr><td>Professional fees</td><td class="num">${moneyExact(b.professional)}</td></tr>
      <tr><td>Permits, levies &amp; taxes</td><td class="num">${moneyExact(b.fees)}</td></tr>
      <tr><td>Contingency</td><td class="num">${moneyExact(b.contingency)}</td></tr>
    </table>`;

    const s = ev.selected;
    const fits = s.cost.construction.mid <= b.construction_budget;
    feedbackEl.innerHTML = `
      <p class="small muted">On this plot and program, the strongest direction FRAME can generate right now is
        <strong>${esc(s.direction.name)}</strong> at ${area(s.massing.gfa)}, costing
        ${money(s.cost.construction.low)} – ${money(s.cost.construction.high)} to build.</p>
      <div class="row" style="margin-top:10px">
        <span class="tag ${fits ? 'good' : 'warn'}">${fits ? 'Fits the construction budget' : 'Above the construction budget'}</span>
        <span class="tag">feasibility ${s.feasibility.score}</span>
      </div>
      ${meter(s.feasibility.score)}`;

    includedEl.innerHTML = `<table class="data">
      ${[['Construction costs', 'Everything from foundation to finishing, based on measured quantities.'],
         ['Professional fees', 'Architect, structural engineer, building physics, permit coordination.'],
         ['Contingency', 'Reserve for design development and tender variance.'],
         ['Indicative only', 'Ranges, not quotes. Confidence is shown on every line.']]
        .map(([k, v]) => `<tr><td style="width:26px;color:var(--good)">${icons.check}</td><td><strong>${k}</strong><br><span class="small muted">${v}</span></td></tr>`).join('')}
    </table>`;
  }

  node.addEventListener('input', (e) => {
    if (e.target.id === 'budget') {
      project.budget.total = Number(e.target.value);
      valueEl.textContent = moneyExact(project.budget.total);
    }
  });
  node.addEventListener('change', (e) => {
    if (e.target.id === 'budget') { commit(project); redraw(); }
  });

  node.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    if (nav.dataset.nav === 'back') return navigate(`#/project/${project.id}/program`);
    navigate(`#/project/${project.id}/design`);
  });

  redraw();
  return node;
}

/* ---------------------------------------------------------------- 05 --- */

function stepDesign(project, navigate) {
  const ev = computeProject(project);
  // The offered directions depend on plot, program and budget, so a
  // direction chosen earlier may no longer be on the table. Fall back
  // rather than rendering a broken page.
  const offered = ev.directions.map((d) => d.direction.id);
  let activeId = offered.includes(project.selected_direction) ? project.selected_direction : offered[0];

  const node = el(shell('design', `
    <div class="wizard-head">
      <h2>Your design directions</h2>
      <p class="muted">Based on your location, program and budget, we have generated ${ev.directions.length} design directions.</p>
    </div>

    <div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));max-width:760px;margin:0 auto 24px" id="dir-tabs">
      ${ev.directions.map((d) => `
        <button class="tile" data-dir="${d.direction.id}" aria-pressed="${d.direction.id === activeId}" style="padding:14px 16px">
          <span class="tile-label" style="padding:0">${esc(d.direction.name)}<small>${esc(d.direction.subtitle)}</small></span>
        </button>`).join('')}
    </div>

    <div id="dir-body"></div>

    <div class="wizard-actions">
      <button class="btn quiet" data-nav="back">${icons.arrowLeft} Back</button>
      <div class="row" style="gap:10px">
        <button class="btn ghost" data-nav="compare">Compare all</button>
        <button class="btn" data-nav="explore">Explore this option ${icons.arrowRight}</button>
      </div>
    </div>`));

  const body = node.querySelector('#dir-body');

  function redraw() {
    const d = ev.directions.find((x) => x.direction.id === activeId);
    const fits = d.cost.construction.mid <= ev.budget.construction_budget;
    body.innerHTML = `
      <div class="card flush" style="max-width:960px;margin:0 auto">
        <div class="viewport" style="border:0;border-radius:0;min-height:300px">
          <span class="vp-label">${esc(d.direction.name)} · ${d.massing.floors} storey${d.massing.floors > 1 ? 's' : ''} · ${area(d.massing.gfa)}</span>
          ${renderIso(d.model, { width: 900, height: 380, label: `${d.direction.name} massing` })}
        </div>
        <div class="split" style="gap:0;border-top:1px solid var(--line)">
          <div style="padding:22px">
            <h3 style="margin-bottom:8px">${esc(d.direction.name)}</h3>
            <p class="muted">${esc(d.direction.description)}</p>
            <table class="data" style="margin-top:6px">
              ${d.direction.advantages.map((x) => `<tr><td style="width:26px;color:var(--good)">${icons.check}</td><td>${esc(x)}</td></tr>`).join('')}
              ${d.direction.disadvantages.map((x) => `<tr><td style="width:26px;color:var(--ink-faint)">–</td><td class="muted">${esc(x)}</td></tr>`).join('')}
            </table>
          </div>
          <div style="padding:22px;border-left:1px solid var(--line)">
            <table class="data">
              <tr><td>Indicative area</td><td class="num">${area(d.massing.gfa)}</td></tr>
              <tr><td>Construction cost</td><td class="num">${money(d.cost.construction.low)} – ${money(d.cost.construction.high)}</td></tr>
              <tr><td>Total incl. fees</td><td class="num">${money(d.cost.total.low)} – ${money(d.cost.total.high)}</td></tr>
              <tr><td>Construction</td><td class="num">${esc(d.construction.selected.name)}</td></tr>
            </table>
            <div style="margin-top:14px">
              <div class="row between small"><span class="muted">Feasibility</span><strong>${d.feasibility.score} / 100</strong></div>
              ${meter(d.feasibility.score)}
              <div class="small muted" style="margin-top:8px">${esc(d.feasibility.reasons[0]?.message || '')}</div>
            </div>
            <div class="row" style="margin-top:14px">
              <span class="tag ${fits ? 'good' : 'warn'}">${fits ? 'Within budget' : 'Over budget'}</span>
            </div>
          </div>
        </div>
      </div>
      <details class="disclose" style="max-width:960px;margin:14px auto 0">
        <summary>How this massing was generated</summary>
        <div class="small muted">
          The massing engine generated ${d.massing_stats.generated} candidates for this direction and discarded
          ${d.massing_stats.generated - d.massing_stats.valid} of them against the site rules
          ${d.massing_stats.rejected.slice(0, 3).map((r) => `— ${esc(r.reason.toLowerCase())} (${r.count})`).join(' ')}.
          The remaining ${d.massing_stats.valid} were scored on program fit, direction fit, envelope efficiency and
          how much garden they leave, and the strongest three were kept. This one scores
          ${d.massing.score.total}/100 (program ${d.massing.score.program_fit}, direction ${d.massing.score.direction_fit},
          efficiency ${d.massing.score.efficiency}, site ${d.massing.score.site}).
        </div>
      </details>`;
  }

  node.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-dir]');
    if (tab) {
      activeId = tab.dataset.dir;
      node.querySelectorAll('#dir-tabs .tile').forEach((t) => t.setAttribute('aria-pressed', String(t === tab)));
      redraw();
      return;
    }
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    if (nav.dataset.nav === 'back') return navigate(`#/project/${project.id}/budget`);
    if (nav.dataset.nav === 'compare') {
      project.selected_direction = activeId;
      commit(project);
      return navigate(`#/project/${project.id}/compare`);
    }
    const chosen = ev.directions.find((x) => x.direction.id === activeId);
    project.selected_direction = activeId;
    let next = addDecision(project, {
      title: `Selected the ${chosen.direction.name} direction`,
      reason: `${chosen.direction.description} Feasibility ${chosen.feasibility.score}/100 at ${money(chosen.cost.total.low)} – ${money(chosen.cost.total.high)}.`,
      status: 'accepted'
    });
    if (!next.versions.length) {
      next = addVersion(next, 'Initial concept', `${chosen.direction.name}, ${area(chosen.massing.gfa)}, ${money(chosen.cost.total.mid ?? chosen.cost.total.low)}`);
    }
    commit(next);
    navigate(`#/project/${project.id}/workspace`);
  });

  redraw();
  return node;
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
