import { el, esc, icons, money, area, meter, meterInverse } from '../ui.js';
import { getProject, saveProject, addDecision } from '../store.js';
import { computeProject } from '../engines/pipeline.js';
import { compareScenarios, budgetSweep } from '../engines/consequence.js';
import { renderIso } from '../render/iso.js';

export function compare(ctx) {
  const { navigate } = ctx;
  let project = getProject(ctx.projectId);
  if (!project) return el('<div class="wrap"><div class="empty">Project not found.</div></div>');

  const ev = computeProject(project);
  const scenarios = compareScenarios(project);
  const sweep = budgetSweep(project, Math.max(150000, project.budget.total * 0.6), project.budget.total * 1.6, 9);

  const rows = [
    ['Floor area', (d) => area(d.massing.gfa), (d) => d.massing.gfa, 'more'],
    ['Estimated cost', (d) => `${money(d.cost.total.low)} – ${money(d.cost.total.high)}`, (d) => -d.cost.total.mid, 'more'],
    ['Cost per m²', (d) => `€ ${d.cost.per_m2.low} – ${d.cost.per_m2.high}`, (d) => -d.cost.per_m2.low, 'more'],
    ['Feasibility', (d) => `${d.feasibility.score} / 100`, (d) => d.feasibility.score, 'meter'],
    // Glazing share is not a quality score, so it is mapped onto one:
    // more glass means a stronger connection to the garden.
    ['Garden connection', (d) => `${Math.round(d.envelope.glazing_ratio * 100)}% glazed`, (d) => Math.min(100, d.envelope.glazing_ratio * 240), 'meter'],
    ['Privacy', (d) => d.direction.dna.includes('private') ? 'High' : d.envelope.glazing_ratio > 0.32 ? 'Lower' : 'Moderate', (d) => d.direction.dna.includes('private') ? 90 : 100 - d.envelope.glazing_ratio * 160, 'meter'],
    ['Complexity', (d) => `${d.complexity} / 100`, (d) => d.complexity, 'meter-inverse'],
    ['Storeys', (d) => `${d.massing.floors} · ${d.massing.height} m high`, () => null, 'plain'],
    ['Footprint', (d) => area(d.massing.footprint.area), (d) => -d.massing.footprint.area, 'more'],
    ['Construction', (d) => d.construction.selected.name, () => null, 'plain'],
    ['High risks', (d) => String(d.risks.filter((r) => r.severity === 'high').length), (d) => -d.risks.filter((r) => r.severity === 'high').length, 'more']
  ];

  const node = el(`
  <div class="wrap wide">
    <div class="row between" style="margin-bottom:22px;flex-wrap:wrap;gap:12px">
      <div>
        <h2>Compare design directions</h2>
        <p class="muted small" style="margin-top:6px">See how the options perform across key aspects. All three were generated from the same program, plot and budget.</p>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn sm ghost" data-go="workspace">Back to design</button>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));margin-bottom:2px">
      ${ev.directions.map((d) => `
        <div class="card flush" style="border-bottom-left-radius:0;border-bottom-right-radius:0">
          <div style="background:var(--bg-sunk)">${renderIso(d.model, { width: 420, height: 240, showSite: false })}</div>
          <div style="padding:14px 16px">
            <div class="row between">
              <strong>${esc(d.direction.name)}</strong>
              ${d.direction.id === ev.selected_direction_id ? '<span class="tag good">selected</span>' : ''}
            </div>
            <div class="small muted">${esc(d.direction.subtitle)}</div>
          </div>
        </div>`).join('')}
    </div>

    <div class="card flush">
      <div class="table-scroll">
      <table class="data">
        <tbody>
          ${rows.map(([label, fmt, metric, mode]) => {
            const values = ev.directions.map(metric);
            // "Best" means the most desirable value, which for an inverse
            // metric is the lowest one.
            const usable = values.filter((v) => v != null);
            const best = mode === 'plain' ? null
              : mode === 'meter-inverse' ? Math.min(...usable) : Math.max(...usable);
            return `<tr>
              <th style="width:170px">${label}</th>
              ${ev.directions.map((d, i) => {
                const v = values[i];
                const isBest = best != null && v === best && ev.directions.length > 1;
                const bar = v == null ? ''
                  : mode === 'meter' ? meter(Math.max(0, Math.min(100, v)))
                  : mode === 'meter-inverse' ? meterInverse(v)
                  : '';
                return `<td>${isBest ? '<strong>' : ''}${esc(fmt(d))}${isBest ? '</strong>' : ''}${bar}</td>`;
              }).join('')}
            </tr>`;
          }).join('')}
          <tr>
            <th></th>
            ${ev.directions.map((d) => `<td><button class="btn sm ${d.direction.id === ev.selected_direction_id ? 'ghost' : ''}" data-select="${d.direction.id}">${d.direction.id === ev.selected_direction_id ? 'Current choice' : 'Choose this'}</button></td>`).join('')}
          </tr>
        </tbody>
      </table>
      </div>
    </div>

    <h3 style="margin:40px 0 12px">Scenarios for the ${esc(ev.selected.direction.name)} direction</h3>
    <p class="muted small" style="margin-bottom:16px">The same design at three levels of ambition, so the trade-off is visible rather than assumed.</p>
    <div class="grid three">
      ${scenarios.map((s) => `
        <div class="card">
          <div class="row between">
            <h3>${esc(s.scenario.name)}</h3>
            <span class="tag">${esc(s.quality)}</span>
          </div>
          <p class="small muted" style="margin:8px 0 14px">${esc(s.scenario.description)}</p>
          <table class="data">
            <tr><td>Area</td><td class="num">${area(s.area)}</td></tr>
            <tr><td>Cost</td><td class="num">${money(s.cost.low)} – ${money(s.cost.high)}</td></tr>
            <tr><td>Glazing</td><td class="num">${Math.round(s.glazing_ratio * 100)}%</td></tr>
            <tr><td>Complexity</td><td class="num">${s.complexity}</td></tr>
            <tr><td>High risks</td><td class="num">${s.risk}</td></tr>
          </table>
          <div style="margin-top:12px">
            <div class="row between small"><span class="muted">Feasibility</span><strong>${s.feasibility}</strong></div>
            ${meter(s.feasibility)}
          </div>
        </div>`).join('')}
    </div>

    <h3 style="margin:40px 0 12px">What the budget buys</h3>
    <p class="muted small" style="margin-bottom:16px">Feasibility of the current design across a range of budgets — the design space, not a single point.</p>
    <div class="card">
      ${sweepChart(sweep, project.budget.total)}
    </div>

    <div class="notice" style="margin-top:24px">
      All figures are indicative and computed from a massing model. FRAME provides design exploration and preliminary
      feasibility information and does not replace professional architectural, structural, planning, legal, financial
      or building-control advice.
    </div>
  </div>`);

  node.addEventListener('click', (e) => {
    const sel = e.target.closest('[data-select]');
    if (sel) {
      const d = ev.directions.find((x) => x.direction.id === sel.dataset.select);
      project.selected_direction = sel.dataset.select;
      project = addDecision(project, {
        title: `Switched to the ${d.direction.name} direction`,
        reason: `Chosen from the comparison at ${area(d.massing.gfa)}, ${money(d.cost.total.low)} – ${money(d.cost.total.high)}, feasibility ${d.feasibility.score}.`,
        status: 'accepted'
      });
      saveProject(project);
      navigate(`#/project/${project.id}/workspace`);
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) navigate(`#/project/${project.id}/workspace`);
  });

  return node;
}

/** A small deterministic SVG chart — no chart library, no runtime fetch. */
function sweepChart(sweep, current) {
  const W = 900, H = 220, pad = 40;
  const xs = sweep.map((s) => s.total);
  const min = Math.min(...xs), max = Math.max(...xs);
  const X = (v) => pad + ((v - min) / Math.max(1, max - min)) * (W - pad * 2);
  const Y = (v) => H - pad - (v / 100) * (H - pad * 1.6);

  const line = sweep.map((s, i) => `${i ? 'L' : 'M'}${X(s.total).toFixed(1)},${Y(s.feasibility).toFixed(1)}`).join(' ');
  const dots = sweep.map((s) => `<circle cx="${X(s.total).toFixed(1)}" cy="${Y(s.feasibility).toFixed(1)}" r="3.5" fill="${s.fits ? '#15803d' : '#b45309'}"/>`).join('');
  const labels = sweep.filter((_, i) => i % 2 === 0).map((s) =>
    `<text x="${X(s.total).toFixed(1)}" y="${H - 14}" font-size="10" text-anchor="middle" fill="#8a8480">€${Math.round(s.total / 1000)}k</text>`).join('');
  const marker = `<line x1="${X(current).toFixed(1)}" y1="${pad / 2}" x2="${X(current).toFixed(1)}" y2="${H - pad}" stroke="#14110f" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="${X(current).toFixed(1)}" y="${pad / 2 - 4}" font-size="10" text-anchor="middle" fill="#14110f">your budget</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" role="img" aria-label="Feasibility across budget levels" xmlns="http://www.w3.org/2000/svg" font-family="inherit">
    <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#e7e4e0"/>
    <line x1="${pad}" y1="${Y(100)}" x2="${W - pad}" y2="${Y(100)}" stroke="#f2f0ed"/>
    <text x="${pad - 8}" y="${Y(100) + 4}" font-size="10" text-anchor="end" fill="#8a8480">100</text>
    <text x="${pad - 8}" y="${Y(0) + 4}" font-size="10" text-anchor="end" fill="#8a8480">0</text>
    <path d="${line}" fill="none" stroke="#14110f" stroke-width="1.6"/>
    ${dots}${labels}${marker}
  </svg>
  <p class="small muted" style="margin-top:8px">Green points are budgets where the design fits; amber points are budgets where it does not.</p>`;
}
