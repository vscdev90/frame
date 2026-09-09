import { el, esc, icons, money, moneyExact, area, meter, toast, toneClass } from '../ui.js';
import { getProject, saveProject, addVersion, addDecision, restoreVersion } from '../store.js';
import { computeProject } from '../engines/pipeline.js';
import { analyseChange, WHAT_IFS } from '../engines/consequence.js';
import { ask, critique, SUGGESTIONS } from '../engines/assistant.js';
import { CONSTRUCTION_SYSTEMS } from '../data/construction.js';
import { QUALITY_LEVELS } from '../data/costModel.js';
import { renderIso, renderSitePlan } from '../render/iso.js';
import { renderFloorplan, renderElevation } from '../render/plan.js';
import { mountViewer, webglAvailable } from '../render/viewer3d.js';

const PANELS = [
  { id: 'overview', label: 'Overview', icon: icons.grid },
  { id: 'massing', label: 'Massing', icon: icons.cube },
  { id: 'plans', label: 'Floor plans', icon: icons.plan },
  { id: 'facades', label: 'Facades', icon: icons.facade },
  { id: 'construction', label: 'Construction', icon: icons.layers },
  { id: 'cost', label: 'Cost', icon: icons.euro },
  { id: 'versions', label: 'Versions', icon: icons.doc }
];

export function workspace(ctx) {
  const { navigate } = ctx;
  let project = getProject(ctx.projectId);
  if (!project) {
    return el(`<div class="wrap"><div class="empty"><p>That project no longer exists.</p><a class="btn" href="#/projects">Back to projects</a></div></div>`);
  }

  let ev = computeProject(project);
  let panel = 'overview';
  let viewMode = webglAvailable() ? '3d' : 'iso';
  let viewer = null;
  let threeUnavailable = false;
  let planLevel = 0;
  let elevationFace = 'south';

  const node = el(`
  <div class="wrap wide">
    <div class="row between" style="margin-bottom:18px;gap:16px;flex-wrap:wrap">
      <div>
        <h2 id="ws-title"></h2>
        <div class="small muted" id="ws-sub"></div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn sm ghost" data-go="compare">Compare directions</button>
        <button class="btn sm ghost" data-go="brief">Design brief</button>
        <button class="btn sm" data-action="save-version">Save version</button>
      </div>
    </div>

    <div class="board">
      <div class="sidenav">
        <nav class="stack" style="--gap:2px">
          ${PANELS.map((p) => `<button data-panel="${p.id}" aria-current="${p.id === 'overview'}">${p.icon}<span>${p.label}</span></button>`).join('')}
        </nav>
        <hr class="divider" style="margin:16px 0">
        <details id="program-details" class="disclose" style="border:0;padding:0">
          <summary><span class="eyebrow" style="margin:0">Program</span></summary>
          <div id="program-panel" class="small"></div>
        </details>
      </div>

      <div>
        <div class="viewport vp-main" id="viewport">
          <span class="vp-label" id="vp-label"></span>
          <div class="toolbar" id="vp-tools"></div>
          <div id="vp-body" style="width:100%;height:100%"></div>
        </div>

        <div id="panel-body" style="margin-top:16px"></div>

        <div class="askbar no-print">
          <input type="text" id="ask" placeholder='Ask a question or try: "What if I want more glass on the garden side?"' aria-label="Ask about this design">
          <button class="btn" data-action="ask" aria-label="Ask">${icons.arrowRight}</button>
        </div>
        <div class="row wrap small" style="gap:6px;margin-top:10px" id="suggestions">
          ${SUGGESTIONS.map((s) => `<button class="btn sm ghost" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>
        <div id="answer"></div>
      </div>

      <div class="stack">
        <div class="card" id="feasibility-card"></div>
        <div class="card" id="budget-card"></div>
        <div class="card" id="whatif-card"></div>
      </div>
    </div>
  </div>`);

  /* ---------------- persistence ---------------- */

  function update(mutator, { revalue = true } = {}) {
    project = mutator(project) || project;
    const { project: saved, persisted } = saveProject(project);
    project = saved;
    if (!persisted) toast('Changes are not being saved — browser storage is unavailable.');
    if (revalue) ev = computeProject(project);
    renderAll();
  }

  /* ---------------- viewport ---------------- */

  function renderViewport() {
    const s = ev.selected;
    const vpBody = node.querySelector('#vp-body');
    const label = node.querySelector('#vp-label');
    const tools = node.querySelector('#vp-tools');

    label.textContent = `${s.direction.name} · ${s.massing.floors} storey${s.massing.floors > 1 ? 's' : ''} · ${area(s.massing.gfa)} · ${s.massing.footprint.width} × ${s.massing.footprint.depth} m`
      + (threeUnavailable && viewMode === 'iso' ? ' · isometric drawing (3D viewer offline)' : '');

    tools.innerHTML = `
      <button data-view="3d" aria-pressed="${viewMode === '3d'}" title="3D view" ${webglAvailable() && !threeUnavailable ? '' : 'disabled'}>3D</button>
      <button data-view="iso" aria-pressed="${viewMode === 'iso'}" title="Isometric drawing">ISO</button>
      <button data-view="2d" aria-pressed="${viewMode === '2d'}" title="Site plan">2D</button>`;

    if (viewMode === '3d') {
      if (!viewer) {
        vpBody.innerHTML = '<div class="row" style="height:100%;justify-content:center;color:var(--ink-faint)">Loading 3D view…</div>';
        mountViewer(vpBody, s.model)
          .then((handle) => {
            if (!handle) { threeUnavailable = true; viewMode = 'iso'; renderViewport(); return; }
            vpBody.querySelector('.row')?.remove();
            viewer = handle;
          })
          .catch(() => {
            // No network for the CDN, or WebGL refused. Fall back to the
            // isometric renderer, which draws the same geometry model, and
            // say so in the viewport label rather than failing quietly.
            threeUnavailable = true;
            viewMode = 'iso';
            renderViewport();
          });
      } else {
        viewer.update(s.model);
      }
      return;
    }

    if (viewer) { viewer.dispose(); viewer = null; }
    vpBody.innerHTML = viewMode === '2d'
      ? renderSitePlan(s.model, envelopeOf(ev), { width: 900, height: 460 })
      : renderIso(s.model, { width: 900, height: 460 });
  }

  /* ---------------- side panels ---------------- */

  function renderProgramPanel() {
    const spaces = ev.selected.floorplans.floors.flatMap((f) => f.spaces);
    // Open beside the model on a wide screen; collapsed on a phone, where
    // fourteen rows would push the model below the fold.
    const details = node.querySelector('#program-details');
    if (details && !details.dataset.touched) {
      details.open = window.matchMedia('(min-width: 761px)').matches;
    }
    details?.addEventListener('toggle', () => { details.dataset.touched = '1'; }, { once: true });
    node.querySelector('#program-panel').innerHTML = `
      <table class="data">
        ${spaces.slice(0, 20).map((s) => `
          <tr>
            <td style="padding:6px 0">${esc(s.name)}</td>
            <td class="num" style="padding:6px 0">${s.area} m²</td>
          </tr>`).join('')}
      </table>
      <div class="small muted" style="margin-top:8px">${spaces.length} spaces · ${area(ev.selected.massing.gfa)} gross</div>`;
  }

  function renderFeasibility() {
    const f = ev.selected.feasibility;
    node.querySelector('#feasibility-card').innerHTML = `
      <div class="row between">
        <div class="eyebrow" style="margin:0">Feasibility</div>
        <span class="tag ${f.band.tone === 'good' ? 'good' : f.band.tone === 'warn' ? 'warn' : 'bad'}">${f.band.label}</span>
      </div>
      <div style="font-size:2.2rem;letter-spacing:-.03em;margin:6px 0 2px">${f.score}<span class="faint" style="font-size:1rem"> / 100</span></div>
      ${meter(f.score)}
      <div style="margin-top:16px">
        ${Object.values(f.axes).map((a) => `
          <div style="margin-bottom:10px">
            <div class="row between small"><span class="muted">${a.name}</span><span class="mono">${a.score}</span></div>
            ${meter(a.score)}
          </div>`).join('')}
      </div>
      <details class="disclose">
        <summary>Why this score</summary>
        <div class="small">
          ${f.reasons.map((r) => `<div style="margin-bottom:8px"><span class="tag ${r.severity === 'high' ? 'bad' : r.severity === 'medium' ? 'warn' : ''}">${r.severity}</span> ${esc(r.message)}</div>`).join('')}
        </div>
      </details>`;
  }

  function renderBudgetCard() {
    const b = ev.budget;
    const c = ev.selected.cost;
    const fits = c.construction.mid <= b.construction_budget;
    const usage = Math.min(140, Math.round((c.construction.mid / Math.max(1, b.construction_budget)) * 100));
    node.querySelector('#budget-card').innerHTML = `
      <div class="eyebrow">Budget</div>
      <div style="font-size:1.5rem;letter-spacing:-.02em">${moneyExact(b.total)}</div>
      <input type="range" id="budget-slider" min="150000" max="1500000" step="10000" value="${b.total}" style="margin:14px 0 8px">
      <div class="row between small muted"><span>€ 150k</span><span>€ 1.5M</span></div>
      <hr class="divider" style="margin:14px 0">
      <table class="data">
        <tr><td>Construction budget</td><td class="num">${money(b.construction_budget)}</td></tr>
        <tr><td>Indicative cost</td><td class="num">${money(c.construction.low)} – ${money(c.construction.high)}</td></tr>
        <tr><td>Per m²</td><td class="num">${c.per_m2.low} – ${c.per_m2.high}</td></tr>
        <tr><td>Total incl. fees</td><td class="num">${money(c.total.low)} – ${money(c.total.high)}</td></tr>
      </table>
      <div class="row" style="margin-top:10px">
        <span class="tag ${fits ? 'good' : 'warn'}">${fits ? 'Within budget' : `${usage}% of budget`}</span>
        <span class="tag">confidence ${Math.round(c.confidence * 100)}%</span>
      </div>`;
  }

  function renderWhatIf() {
    node.querySelector('#whatif-card').innerHTML = `
      <div class="eyebrow">What if…</div>
      <div class="stack" style="--gap:6px">
        ${WHAT_IFS.map((w) => `<button class="btn sm ghost" style="width:100%;justify-content:flex-start" data-whatif="${w.id}">${esc(w.label)}</button>`).join('')}
      </div>`;
  }

  /* ---------------- main panel ---------------- */

  function renderPanel() {
    const s = ev.selected;
    const body = node.querySelector('#panel-body');

    if (panel === 'overview') {
      const crit = critique(ev);
      body.innerHTML = `
        <div class="stats four" style="margin-bottom:16px">
          <div class="stat"><div class="v">${area(s.massing.gfa)}</div><div class="k">Gross floor area</div></div>
          <div class="stat"><div class="v">${money(s.cost.total.low)} – ${money(s.cost.total.high)}</div><div class="k">Total cost range</div></div>
          <div class="stat"><div class="v">${s.feasibility.score} / 100</div><div class="k">Feasibility</div></div>
          <div class="stat"><div class="v">${s.massing.floors} · ${s.massing.height} m</div><div class="k">Storeys · height</div></div>
        </div>
        <div class="card">
          <div class="eyebrow">${esc(crit.title)}</div>
          <p class="small muted">${esc(crit.body)}</p>
          ${crit.impacts.map((i) => `
            <div class="impact">
              <span class="dim">${esc(i.dimension)}</span>
              <span class="arrow ${i.magnitude === 'high' ? 'up' : ''}">${i.magnitude === 'high' ? '!' : i.magnitude === 'low' ? '·' : '–'}</span>
              <span>${esc(i.message)}</span>
            </div>`).join('')}
        </div>
        <div class="card" style="margin-top:16px">
          <div class="eyebrow">Design direction</div>
          <div class="row between" style="align-items:flex-start;gap:20px">
            <div>
              <h3>${esc(s.direction.name)} — ${esc(s.direction.subtitle)}</h3>
              <p class="muted small" style="margin-top:6px">${esc(s.direction.description)}</p>
              <div class="row wrap" style="gap:6px;margin-top:10px">
                ${s.direction.dna.map((d) => `<span class="tag">${esc(d)}</span>`).join('')}
              </div>
            </div>
            <button class="btn sm ghost nowrap" data-go="directions">Change direction</button>
          </div>
        </div>`;
      return;
    }

    if (panel === 'massing') {
      body.innerHTML = `
        <div class="card">
          <div class="eyebrow">Massing alternatives</div>
          <p class="small muted">The engine generated ${s.massing_stats.generated} candidates and kept the ${s.massing_alternatives.length} strongest after removing every option that broke a site rule.</p>
          <div class="grid three" style="margin-top:14px">
            ${s.massing_alternatives.map((m, i) => `
              <button class="tile" data-variant="${i}" aria-pressed="${i === (project.massing_variant || 0)}">
                <span class="thumb" style="aspect-ratio:4/3;background:#f7f6f4">${renderIso(withMassing(s.model, m), { width: 320, height: 240, showSite: false, showWindows: false })}</span>
                <span class="tile-label">
                  ${m.floors} storey${m.floors > 1 ? 's' : ''} · ${m.footprint.width} × ${m.footprint.depth} m
                  <small>${area(m.gfa)} · score ${m.score.total}/100</small>
                </span>
              </button>`).join('')}
          </div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="eyebrow">Why the others were discarded</div>
          <table class="data">
            ${s.massing_stats.rejected.map((r) => `<tr><td>${esc(r.reason)}</td><td class="num">${r.count} candidates</td></tr>`).join('')}
          </table>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="eyebrow">Design intent — the geometry engine's input</div>
          <pre class="small mono" style="background:var(--bg-sunk);padding:14px;border-radius:8px;overflow:auto">${esc(JSON.stringify({
            building_type: s.massing.building_type,
            floors: s.massing.floors,
            footprint: { width: s.massing.footprint.width, depth: s.massing.footprint.depth },
            roof: s.massing.roof,
            orientation: s.massing.orientation
          }, null, 2))}</pre>
          <p class="small muted" style="margin-top:8px">Structured intent in, deterministic geometry out. The same intent always produces the same building.</p>
        </div>`;
      return;
    }

    if (panel === 'plans') {
      const floor = s.floorplans.floors[Math.min(planLevel, s.floorplans.floors.length - 1)];
      body.innerHTML = `
        <div class="card flush">
          <div class="row between" style="padding:14px 18px;border-bottom:1px solid var(--line)">
            <div class="row" style="gap:6px">
              ${s.floorplans.floors.map((f, i) => `<button class="btn sm ${i === planLevel ? '' : 'ghost'}" data-level="${i}">${esc(f.label)}</button>`).join('')}
            </div>
            <span class="small muted">${area(floor.area)} gross per floor</span>
          </div>
          <div style="background:var(--bg-sunk)">${renderFloorplan(floor, s.massing, s.model, { width: 900, height: 460 })}</div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="eyebrow">Spaces on this floor</div>
          <div class="table-scroll">
          <table class="data">
            <thead><tr><th>Space</th><th class="num">Area</th><th class="num">Target</th><th>Facades</th><th>Daylight</th><th>Priority</th></tr></thead>
            <tbody>
              ${floor.spaces.map((sp) => `
                <tr>
                  <td>${esc(sp.name)}</td>
                  <td class="num">${sp.area} m²</td>
                  <td class="num muted">${sp.target_area} m²</td>
                  <td class="small">${sp.facades.join(', ') || '<span class="muted">internal</span>'}</td>
                  <td class="small">${sp.daylight_ok ? '<span class="tag good">ok</span>' : '<span class="tag bad">no facade</span>'}</td>
                  <td class="small"><span class="tag">${sp.priority}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
          </div>
          ${s.plan_issues.length ? `
            <details class="disclose" style="margin-top:10px">
              <summary>${s.plan_issues.length} layout notes</summary>
              <div class="small">${s.plan_issues.map((i) => `<div style="margin-bottom:6px"><span class="tag ${i.severity === 'high' ? 'bad' : i.severity === 'medium' ? 'warn' : ''}">${i.severity}</span> ${esc(i.message)}</div>`).join('')}</div>
            </details>` : ''}
        </div>`;
      return;
    }

    if (panel === 'facades') {
      body.innerHTML = `
        <div class="card flush">
          <div class="row between" style="padding:14px 18px;border-bottom:1px solid var(--line)">
            <div class="row" style="gap:6px">
              ${['south', 'east', 'north', 'west'].map((f) => `<button class="btn sm ${f === elevationFace ? '' : 'ghost'}" data-face="${f}">${f}</button>`).join('')}
            </div>
            <span class="small muted">${area(s.envelope.glazed_area)} glazed of ${area(s.massing.facade_area)} facade — ${Math.round(s.envelope.glazing_ratio * 100)}%</span>
          </div>
          <div style="background:var(--bg-sunk)">${renderElevation(s.model, s.massing, elevationFace, { width: 900, height: 380 })}</div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="eyebrow">Glazing</div>
          <label class="field">
            <span>Share of the facade that is glazed — ${Math.round(s.envelope.glazing_ratio * 100)}%</span>
            <input type="range" id="glazing" min="10" max="55" value="${Math.round(s.envelope.glazing_ratio * 100)}">
          </label>
          <p class="small muted">Every move of this slider runs the full chain: geometry → quantities → cost → feasibility. Release it to see the consequences.</p>
          <table class="data" style="margin-top:8px">
            <tr><td>Openings placed</td><td class="num">${s.envelope.openings}</td></tr>
            <tr><td>Glazed area</td><td class="num">${area(s.envelope.glazed_area)}</td></tr>
            <tr><td>Closed facade</td><td class="num">${area(s.envelope.closed_facade)}</td></tr>
            <tr><td>Shading required</td><td class="num">${s.envelope.glazing_ratio > 0.3 ? 'Yes — south facade' : 'Not indicated'}</td></tr>
          </table>
        </div>`;
      return;
    }

    if (panel === 'construction') {
      body.innerHTML = `
        <div class="card">
          <div class="eyebrow">Construction system</div>
          <p class="small muted">Ranked for this design against span, availability, cost and the direction's DNA. Changing it re-prices every affected line.</p>
          <div class="grid" style="margin-top:14px">
            ${s.construction.ranking.map(({ system, score }) => `
              <button class="card" data-system="${system.id}" style="text-align:left;cursor:pointer;border-color:${system.id === s.construction.selected.id ? 'var(--ink)' : 'var(--line)'}">
                <div class="row between">
                  <strong>${esc(system.name)}</strong>
                  <span class="tag ${system.id === s.construction.selected.id ? 'good' : ''}">${system.id === s.construction.selected.id ? 'selected' : `score ${score}`}</span>
                </div>
                <p class="small muted" style="margin:6px 0 10px">${esc(system.short)} ${esc(system.notes)}</p>
                <div class="row wrap small" style="gap:14px">
                  <span>Cost ×${system.cost_factor.toFixed(2)}</span>
                  <span>Speed ${system.speed}</span>
                  <span>Carbon ${system.carbon}</span>
                  <span>Acoustic ${system.acoustic}</span>
                  <span>Max span ${system.max_span} m</span>
                </div>
              </button>`).join('')}
          </div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="eyebrow">Finish level</div>
          <div class="row wrap" style="gap:8px">
            ${Object.entries(QUALITY_LEVELS).map(([k, q]) => `
              <button class="btn sm ${(project.quality || 'standard') === k ? '' : 'ghost'}" data-quality="${k}">${q.label} — ${q.description}</button>`).join('')}
          </div>
        </div>`;
      return;
    }

    if (panel === 'cost') {
      const c = s.cost;
      body.innerHTML = `
        <div class="card">
          <div class="row between" style="margin-bottom:12px">
            <div class="eyebrow" style="margin:0">Cost build-up</div>
            <span class="small muted">${esc(c.system)} · ${esc(c.quality)} finish · complexity surcharge ${c.basis.complexity_surcharge}%</span>
          </div>
          <div class="table-scroll">
          <table class="data">
            <thead><tr><th>Category</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Low</th><th class="num">High</th><th class="num">Conf.</th></tr></thead>
            <tbody>
              ${c.items.map((i) => `
                <tr>
                  <td>${esc(i.label)}<br><span class="small muted">${esc(i.assumption)}</span></td>
                  <td class="num">${i.quantity} ${unitLabel(i.unit)}</td>
                  <td class="num">${i.unit_low}–${i.unit_high}</td>
                  <td class="num">${moneyExact(i.low)}</td>
                  <td class="num">${moneyExact(i.high)}</td>
                  <td class="num">${Math.round(i.confidence * 100)}%</td>
                </tr>`).join('')}
              <tr><td><strong>Construction total</strong></td><td></td><td></td>
                  <td class="num"><strong>${moneyExact(c.construction.low)}</strong></td>
                  <td class="num"><strong>${moneyExact(c.construction.high)}</strong></td><td></td></tr>
              ${c.soft.map((i) => `
                <tr>
                  <td>${esc(i.label)}<br><span class="small muted">${esc(i.assumption)}</span></td>
                  <td class="num">${Math.round(i.percentage_low * 100)}–${Math.round(i.percentage_high * 100)}%</td>
                  <td class="num">—</td>
                  <td class="num">${moneyExact(i.low)}</td>
                  <td class="num">${moneyExact(i.high)}</td>
                  <td class="num">${Math.round(i.confidence * 100)}%</td>
                </tr>`).join('')}
              <tr><td><strong>Project total</strong></td><td></td><td></td>
                  <td class="num"><strong>${moneyExact(c.total.low)}</strong></td>
                  <td class="num"><strong>${moneyExact(c.total.high)}</strong></td><td></td></tr>
            </tbody>
          </table>
          </div>
          <div class="notice" style="margin-top:14px">
            Ranges, not quotes. Quantities come from the massing model, so the spread is wide by design —
            it narrows as the design develops. Excludes VAT and land.
          </div>
        </div>`;
      return;
    }

    if (panel === 'versions') {
      body.innerHTML = `
        <div class="card">
          <div class="eyebrow">Versions</div>
          ${(project.versions || []).length ? `
            <table class="data">
              ${project.versions.slice().reverse().map((v) => `
                <tr>
                  <td style="width:56px"><strong>${v.number}</strong></td>
                  <td>${esc(v.label)}<br><span class="small muted">${esc(v.summary || '')}</span></td>
                  <td class="num"><button class="btn sm ghost" data-restore="${v.id}">Restore</button></td>
                </tr>`).join('')}
            </table>` : '<p class="small muted">No versions saved yet. Use “Save version” after a change worth keeping.</p>'}
        </div>
        <div class="card" style="margin-top:16px">
          <div class="eyebrow">Decision log</div>
          ${(project.decisions || []).length ? `
            <table class="data">
              ${project.decisions.slice().reverse().map((d) => `
                <tr>
                  <td>${esc(d.title)}<br><span class="small muted">${esc(d.reason)}</span></td>
                  <td class="num"><span class="tag ${d.status === 'accepted' ? 'good' : ''}">${esc(d.status)}</span></td>
                </tr>`).join('')}
            </table>` : '<p class="small muted">No decisions recorded yet.</p>'}
        </div>`;
    }
  }

  function renderAll() {
    node.querySelector('#ws-title').textContent = project.name;
    node.querySelector('#ws-sub').textContent =
      `${ev.site.address} · ${area(ev.site.plot_area)} plot · ${ev.selected.direction.name} direction · ${ev.selected.construction.selected.name}`;
    renderViewport();
    renderProgramPanel();
    renderFeasibility();
    renderBudgetCard();
    renderWhatIf();
    renderPanel();
  }

  /* ---------------- answers ---------------- */

  function showAnswer(result) {
    const host = node.querySelector('#answer');
    if (!result) { host.innerHTML = ''; return; }
    host.innerHTML = `
      <div class="answer">
        <div class="row between">
          <div class="eyebrow" style="margin:0">${esc(result.mode)}</div>
          ${result.actions?.length ? `<button class="btn sm" data-apply="1">${esc(result.actions[0].label)}</button>` : ''}
        </div>
        <h3 style="margin:6px 0 8px">${esc(result.title)}</h3>
        <p class="muted small">${esc(result.body)}</p>
        ${(result.impacts || []).map((i) => `
          <div class="impact ${i.positive ? 'positive' : ''}">
            <span class="dim">${esc(i.dimension)}</span>
            <span class="arrow ${i.direction}">${i.direction === 'up' ? '↑' : i.direction === 'down' ? '↓' : '·'}</span>
            <span>${esc(i.message)}</span>
          </div>`).join('')}
      </div>`;
    if (result.actions?.length) {
      host.querySelector('[data-apply]')?.addEventListener('click', () => {
        applyOverrides(result.actions[0].overrides, result.actions[0].label);
        host.innerHTML = '';
      });
    }
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Fold a what-if override into the project itself. */
  function applyOverrides(overrides, label) {
    update((p) => {
      const next = { ...p };
      for (const [k, v] of Object.entries(overrides)) {
        next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(p[k] || {}), ...v } : v;
      }
      return addDecision(next, { title: label, reason: 'Applied from the what-if analysis.', status: 'accepted' });
    });
    toast(`Applied: ${label}`);
  }

  /* ---------------- events ---------------- */

  node.addEventListener('click', (e) => {
    const t = e.target;

    const panelBtn = t.closest('[data-panel]');
    if (panelBtn) {
      panel = panelBtn.dataset.panel;
      node.querySelectorAll('[data-panel]').forEach((b) => b.setAttribute('aria-current', String(b === panelBtn)));
      renderPanel();
      return;
    }

    const view = t.closest('[data-view]');
    if (view) { viewMode = view.dataset.view; renderViewport(); return; }

    const level = t.closest('[data-level]');
    if (level) { planLevel = Number(level.dataset.level); renderPanel(); return; }

    const face = t.closest('[data-face]');
    if (face) { elevationFace = face.dataset.face; renderPanel(); return; }

    const variant = t.closest('[data-variant]');
    if (variant) { update((p) => ({ ...p, massing_variant: Number(variant.dataset.variant) })); return; }

    const system = t.closest('[data-system]');
    if (system) { update((p) => ({ ...p, construction_system: system.dataset.system })); return; }

    const quality = t.closest('[data-quality]');
    if (quality) { update((p) => ({ ...p, quality: quality.dataset.quality })); return; }

    const whatif = t.closest('[data-whatif]');
    if (whatif) {
      const spec = WHAT_IFS.find((w) => w.id === whatif.dataset.whatif);
      const analysis = analyseChange(project, spec.apply(project), spec.label);
      showAnswer({
        mode: 'DESIGN',
        title: spec.label,
        body: `Before: ${money(analysis.before.cost_low)} – ${money(analysis.before.cost_high)}, feasibility ${analysis.before.feasibility}. After: ${money(analysis.after.cost_low)} – ${money(analysis.after.cost_high)}, feasibility ${analysis.after.feasibility}.`,
        impacts: analysis.impacts,
        actions: [{ id: 'apply', label: 'Apply this change', overrides: spec.apply(project) }]
      });
      return;
    }

    const suggest = t.closest('[data-suggest]');
    if (suggest) {
      node.querySelector('#ask').value = suggest.dataset.suggest;
      showAnswer(ask(suggest.dataset.suggest, project, ev));
      return;
    }

    if (t.closest('[data-action="ask"]')) {
      showAnswer(ask(node.querySelector('#ask').value, project, ev));
      return;
    }

    if (t.closest('[data-action="save-version"]')) {
      const s = ev.selected;
      update((p) => addVersion(p, `${s.direction.name} · ${area(s.massing.gfa)}`, `${money(s.cost.total.low)} – ${money(s.cost.total.high)}, feasibility ${s.feasibility.score}`));
      toast('Version saved');
      return;
    }

    const restore = t.closest('[data-restore]');
    if (restore) { update((p) => restoreVersion(p, restore.dataset.restore)); toast('Version restored'); return; }

    const go = t.closest('[data-go]');
    if (go) {
      if (go.dataset.go === 'compare') navigate(`#/project/${project.id}/compare`);
      if (go.dataset.go === 'brief') navigate(`#/project/${project.id}/brief`);
      if (go.dataset.go === 'directions') navigate(`#/project/${project.id}/design`);
    }
  });

  node.addEventListener('keydown', (e) => {
    if (e.target.id === 'ask' && e.key === 'Enter') {
      showAnswer(ask(e.target.value, project, ev));
    }
  });

  // Sliders: preview while dragging, recompute on release.
  node.addEventListener('change', (e) => {
    if (e.target.id === 'budget-slider') {
      update((p) => ({ ...p, budget: { ...p.budget, total: Number(e.target.value) } }));
    }
    if (e.target.id === 'glazing') {
      const before = ev.selected.feasibility.score;
      update((p) => ({ ...p, envelope: { ...p.envelope, glazing_ratio: Number(e.target.value) / 100 } }));
      const after = ev.selected.feasibility.score;
      toast(`Glazing ${e.target.value}% · feasibility ${before} → ${after}`);
    }
  });

  renderAll();
  return node;
}

function withMassing(model, massing) {
  // Reuse the site from the current model, swap in the alternative mass.
  return {
    ...model,
    floors: massing.floors,
    footprint: massing.footprint,
    roof: massing.roof,
    height: massing.height,
    origin: { x: -massing.footprint.width / 2, z: model.origin.z },
    volumes: Array.from({ length: massing.floors }, (_, f) => ({
      kind: 'storey', level: f, polygon: [], y0: f * massing.floor_height, y1: (f + 1) * massing.floor_height
    })),
    roof_geometry: { type: massing.roof, eaves: massing.floors * massing.floor_height, parapet: massing.floors * massing.floor_height + 0.4, ridge: massing.height, low: massing.floors * massing.floor_height + 0.2, high: massing.floors * massing.floor_height + 1.6 },
    openings: [],
    courtyard: null
  };
}

function envelopeOf(ev) {
  const c = ev.constraints;
  return {
    width: Math.max(4, ev.site.plot_width - 2 * (c.setback_side?.value ?? 3)),
    depth: Math.max(5, ev.site.plot_depth - (c.setback_front?.value ?? 5) - (c.setback_rear?.value ?? 8))
  };
}

function unitLabel(unit) {
  return {
    m2_gfa: 'm² gfa', m2_footprint: 'm² fp', m2_roof: 'm² roof',
    m2_closed_facade: 'm² facade', m2_glazing: 'm² glass', lump_by_plot: 'm² plot'
  }[unit] || '';
}
