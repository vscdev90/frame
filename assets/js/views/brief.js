import { el, esc, icons, money, moneyExact, area, meter, formatDate, toast } from '../ui.js';
import { getProject, exportProject } from '../store.js';
import { computeProject } from '../engines/pipeline.js';
import { critique } from '../engines/assistant.js';
import { renderIso, renderSitePlan } from '../render/iso.js';
import { renderFloorplan } from '../render/plan.js';

const SECTIONS = [
  ['project', '1. Project'],
  ['location', '2. Location'],
  ['program', '3. Program'],
  ['budget', '4. Budget'],
  ['direction', '5. Design direction'],
  ['visuals', '6. Visualisations'],
  ['data', '7. Key data'],
  ['risks', '8. Risks & opportunities'],
  ['next', '9. Next steps']
];

export function brief(ctx) {
  const { navigate } = ctx;
  const project = getProject(ctx.projectId);
  if (!project) return el('<div class="wrap"><div class="empty">Project not found.</div></div>');

  const ev = computeProject(project);
  const s = ev.selected;
  const crit = critique(ev);
  const spaces = s.floorplans.floors.flatMap((f) => f.spaces);

  const node = el(`
  <div class="wrap">
    <div class="row between no-print" style="margin-bottom:26px;flex-wrap:wrap;gap:12px">
      <div>
        <h2>Your design brief</h2>
        <p class="muted small" style="margin-top:6px">A clear summary of your project, ready to share with an architect.</p>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn sm ghost" data-go="workspace">Back to design</button>
        <button class="btn sm ghost" data-action="json">Export JSON</button>
        <button class="btn sm" data-action="print">Download PDF</button>
      </div>
    </div>

    <div class="brief">
      <nav class="brief-nav no-print">
        ${SECTIONS.map(([id, label]) => `<a href="#${id}" data-jump="${id}">${label}</a>`).join('')}
      </nav>

      <article>
        <header style="margin-bottom:36px">
          <div class="wordmark lg">FRAME</div>
          <h1 style="font-size:2rem;margin:16px 0 8px">${esc(project.name)}</h1>
          <p class="muted">Design brief · ${formatDate(project.updated_at)} · ${(project.versions || []).length ? `version ${project.versions[project.versions.length - 1].number}` : 'working draft'}</p>
        </header>

        <section id="project">
          <h3>1. Project</h3>
          <dl class="kv">
            <dt>Project</dt><dd>${esc(project.name)}</dd>
            <dt>Type</dt><dd>${esc((project.building_type || '').replace(/_/g, ' ') || 'not set')}</dd>
            <dt>Client goal</dt><dd>${esc(clientGoal(project, ev))}</dd>
            <dt>Prepared with</dt><dd>FRAME — design feasibility exploration, pre-design stage</dd>
          </dl>
        </section>

        <section id="location">
          <h3>2. Location</h3>
          <dl class="kv">
            <dt>Address</dt><dd>${esc(ev.site.address)}</dd>
            <dt>Plot area</dt><dd>${area(ev.site.plot_area)}</dd>
            <dt>Plot dimensions</dt><dd>${ev.site.plot_width} × ${ev.site.plot_depth} m (assumed rectangular)</dd>
            <dt>Orientation</dt><dd>${esc(ev.site.orientation.replace(/_/g, '–'))}</dd>
            <dt>Zoning assumption</dt><dd>${esc(ev.site.zoning)}</dd>
          </dl>
          <h4 style="margin:22px 0 10px;font-weight:500">Planning constraints applied</h4>
          <table class="data">
            <thead><tr><th>Parameter</th><th class="num">Value</th><th>Source</th><th class="num">Confidence</th></tr></thead>
            <tbody>
              ${ev.rules.map((r) => `
                <tr>
                  <td>${esc(r.parameter.replace(/_/g, ' '))}</td>
                  <td class="num">${r.unit === 'ratio' ? Math.round(r.value * 100) + '%' : `${r.value} ${r.unit}`}</td>
                  <td class="small">${esc(r.rule_id)} · ${esc(r.source)}</td>
                  <td class="num">${Math.round(r.confidence * 100)}%</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="notice" style="margin-top:14px">
            These are indicative model values, not the omgevingsplan for this address. Confirm every one of them with
            the municipality before making commitments.
          </div>
        </section>

        <section id="program">
          <h3>3. Program</h3>
          <p class="muted">${esc(programSentence(project, ev))}</p>
          <table class="data" style="margin-top:14px">
            <thead><tr><th>Space</th><th class="num">Target</th><th class="num">In this design</th><th>Priority</th><th>Orientation</th></tr></thead>
            <tbody>
              ${ev.program.spaces.map((sp) => {
                const placed = spaces.find((x) => x.id === sp.id);
                return `<tr>
                  <td>${esc(sp.name)}</td>
                  <td class="num">${sp.target_area} m²</td>
                  <td class="num">${placed ? `${placed.area} m²` : '—'}</td>
                  <td><span class="tag">${sp.priority}</span></td>
                  <td class="small muted">${esc(sp.orientation_preference)}</td>
                </tr>`;
              }).join('')}
              <tr><td><strong>Total</strong></td>
                  <td class="num"><strong>${Math.round(ev.program.areas.net_target)} m² net</strong></td>
                  <td class="num"><strong>${area(s.massing.gfa)} gross</strong></td><td></td><td></td></tr>
            </tbody>
          </table>
          ${project.program_answers.notes ? `<p class="muted small" style="margin-top:12px"><strong>Client notes:</strong> ${esc(project.program_answers.notes)}</p>` : ''}
        </section>

        <section id="budget">
          <h3>4. Budget</h3>
          <dl class="kv">
            <dt>Total project budget</dt><dd>${moneyExact(ev.budget.total)}</dd>
            <dt>Construction budget</dt><dd>${moneyExact(ev.budget.construction_budget)}</dd>
            <dt>Professional fees</dt><dd>${moneyExact(ev.budget.professional)}</dd>
            <dt>Permits &amp; levies</dt><dd>${moneyExact(ev.budget.fees)}</dd>
            <dt>Contingency</dt><dd>${moneyExact(ev.budget.contingency)}</dd>
            <dt>Indicative construction cost</dt><dd>${moneyExact(s.cost.construction.low)} – ${moneyExact(s.cost.construction.high)} (${s.cost.per_m2.low} – ${s.cost.per_m2.high} per m²)</dd>
            <dt>Indicative total</dt><dd>${moneyExact(s.cost.total.low)} – ${moneyExact(s.cost.total.high)}</dd>
            <dt>Estimate confidence</dt><dd>${Math.round(s.cost.confidence * 100)}%</dd>
          </dl>
          <table class="data" style="margin-top:18px">
            <thead><tr><th>Category</th><th class="num">Quantity</th><th class="num">Low</th><th class="num">High</th><th>Assumption</th></tr></thead>
            <tbody>
              ${s.cost.items.map((i) => `
                <tr><td>${esc(i.label)}</td><td class="num">${i.quantity}</td>
                    <td class="num">${moneyExact(i.low)}</td><td class="num">${moneyExact(i.high)}</td>
                    <td class="small muted">${esc(i.assumption)}</td></tr>`).join('')}
            </tbody>
          </table>
          <div class="notice" style="margin-top:14px">
            Indicative financial scenario. Not a quotation, not a quantity surveyor's estimate and not mortgage advice.
            Excludes VAT and the cost of the land.
          </div>
        </section>

        <section id="direction">
          <h3>5. Design direction</h3>
          <h4 style="font-weight:500;margin-bottom:8px">${esc(s.direction.name)} — ${esc(s.direction.subtitle)}</h4>
          <p class="muted">${esc(s.direction.description)}</p>
          <div class="row wrap" style="gap:6px;margin:12px 0 18px">
            ${s.direction.dna.map((d) => `<span class="tag">${esc(d)}</span>`).join('')}
          </div>
          <div class="grid two">
            <div>
              <div class="eyebrow">Why this direction</div>
              <table class="data">${s.direction.advantages.map((a) => `<tr><td style="width:24px;color:var(--good)">${icons.check}</td><td>${esc(a)}</td></tr>`).join('')}</table>
            </div>
            <div>
              <div class="eyebrow">What it costs you</div>
              <table class="data">${s.direction.disadvantages.map((a) => `<tr><td style="width:24px;color:var(--ink-faint)">–</td><td>${esc(a)}</td></tr>`).join('')}</table>
            </div>
          </div>
          <h4 style="margin:24px 0 10px;font-weight:500">Construction assumption</h4>
          <p class="muted">${esc(s.construction.selected.name)}. ${esc(s.construction.selected.short)} ${esc(s.construction.selected.notes)}</p>
        </section>

        <section id="visuals">
          <h3>6. Visualisations</h3>
          <div class="card flush" style="margin-bottom:16px;background:var(--bg-sunk)">
            ${renderIso(s.model, { width: 900, height: 400 })}
          </div>
          <div class="grid two">
            <div class="card flush" style="background:var(--bg-sunk)">${renderSitePlan(s.model, null, { width: 460, height: 320 })}</div>
            <div class="card flush" style="background:var(--bg-sunk)">${renderFloorplan(s.floorplans.floors[0], s.massing, s.model, { width: 460, height: 320 })}</div>
          </div>
          <p class="small muted" style="margin-top:10px">Massing study, site plan and ground-floor arrangement. These are diagrams of a
          pre-design model, not architectural drawings.</p>
        </section>

        <section id="data">
          <h3>7. Key data</h3>
          <div class="stats four" style="margin-bottom:18px">
            <div class="stat"><div class="v">${area(s.massing.gfa)}</div><div class="k">Gross floor area</div></div>
            <div class="stat"><div class="v">${s.massing.floors}</div><div class="k">Storeys</div></div>
            <div class="stat"><div class="v">${s.massing.height} m</div><div class="k">Building height</div></div>
            <div class="stat"><div class="v">${s.feasibility.score}/100</div><div class="k">Feasibility</div></div>
          </div>
          <dl class="kv">
            <dt>Footprint</dt><dd>${s.massing.footprint.width} × ${s.massing.footprint.depth} m — ${area(s.massing.footprint.area)}</dd>
            <dt>Build coverage</dt><dd>${Math.round((s.massing.footprint.area / ev.site.plot_area) * 100)}% of the plot</dd>
            <dt>Roof</dt><dd>${esc(s.massing.roof)} — ${area(s.massing.roof_area)}</dd>
            <dt>Facade</dt><dd>${area(s.massing.facade_area)} total, ${area(s.envelope.glazed_area)} glazed (${Math.round(s.envelope.glazing_ratio * 100)}%)</dd>
            <dt>Openings</dt><dd>${s.envelope.openings} placed</dd>
            <dt>Finish level</dt><dd>${esc(s.cost.quality)}</dd>
          </dl>
          <h4 style="margin:22px 0 10px;font-weight:500">Feasibility breakdown</h4>
          ${Object.values(s.feasibility.axes).map((a) => `
            <div style="margin-bottom:12px">
              <div class="row between small"><span>${a.name}</span><span class="mono">${a.score} / 100</span></div>
              ${meter(a.score)}
              <div class="small muted" style="margin-top:4px">${esc(a.reasons[0]?.message || '')}</div>
            </div>`).join('')}
        </section>

        <section id="risks">
          <h3>8. Risks &amp; opportunities</h3>
          <table class="data">
            <thead><tr><th>Severity</th><th>Category</th><th>Description</th></tr></thead>
            <tbody>
              ${s.risks.length ? s.risks.map((r) => `
                <tr><td><span class="tag ${r.severity === 'high' ? 'bad' : 'warn'}">${r.severity}</span></td>
                    <td>${esc(r.category)}</td><td>${esc(r.description)}</td></tr>`).join('')
                : '<tr><td colspan="3" class="muted">No significant risks identified at this level of detail.</td></tr>'}
            </tbody>
          </table>
          <h4 style="margin:24px 0 10px;font-weight:500">Honest assessment</h4>
          ${crit.impacts.map((i) => `<p class="muted small"><strong>${esc(i.dimension)}.</strong> ${esc(i.message)}</p>`).join('')}
        </section>

        <section id="next">
          <h3>9. Next steps</h3>
          <ol class="muted" style="padding-left:20px">
            <li>Verify the planning constraints for this address with the municipality — every value in section 2 is indicative.</li>
            <li>Take this brief to an architect as a starting point, not as a design. It defines intent, budget and priorities.</li>
            <li>Have the cost range validated by a quantity surveyor or contractor once there is a preliminary design.</li>
            <li>Confirm ground conditions; the foundation assumption is the single largest unknown in the estimate.</li>
            ${s.risks.filter((r) => r.severity === 'high').map((r) => `<li>Resolve: ${esc(r.description)}</li>`).join('')}
          </ol>

          ${(project.decisions || []).length ? `
            <h4 style="margin:24px 0 10px;font-weight:500">Decisions taken</h4>
            <table class="data">
              ${project.decisions.map((d) => `<tr><td>${esc(d.title)}<br><span class="small muted">${esc(d.reason)}</span></td><td class="num"><span class="tag">${esc(d.status)}</span></td></tr>`).join('')}
            </table>` : ''}

          ${(project.versions || []).length ? `
            <h4 style="margin:24px 0 10px;font-weight:500">Version history</h4>
            <table class="data">
              ${project.versions.map((v) => `<tr><td style="width:52px"><strong>${v.number}</strong></td><td>${esc(v.label)}</td><td class="small muted">${esc(v.summary || '')}</td></tr>`).join('')}
            </table>` : ''}

          <div class="notice" style="margin-top:28px">
            <strong>Limitations.</strong> FRAME provides design exploration and preliminary feasibility information and
            does not replace professional architectural, structural, planning, legal, financial or building-control
            advice. Nothing here guarantees planning approval, construction cost, structural safety or mortgage approval.
            Geometry, quantities, costs and scores are computed from a simplified pre-design model.
          </div>
        </section>
      </article>
    </div>
  </div>`);

  node.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) return navigate(`#/project/${project.id}/workspace`);

    const action = e.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'print') window.print();
    if (action.dataset.action === 'json') {
      const data = exportProject(project, ev);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-frame-brief.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Brief exported as JSON');
    }
  });

  // Section links scroll rather than change route.
  node.querySelectorAll('[data-jump]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      node.querySelector(`#${link.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  return node;
}

function clientGoal(project, ev) {
  const a = project.program_answers;
  const bits = [`a home with ${a.bedrooms} bedroom${a.bedrooms > 1 ? 's' : ''} and ${a.bathrooms} bathroom${a.bathrooms > 1 ? 's' : ''}`];
  if (a.workspace) bits.push('a dedicated workspace');
  if (a.singleStorey) bits.push('everything on one level');
  if ((project.priorities?.garden ?? 0) > 0.6) bits.push('a strong connection to the garden');
  if ((project.priorities?.privacy ?? 0) > 0.6) bits.push('privacy from the neighbours');
  return `To build ${bits.join(', ')} within a budget of ${moneyExact(ev.budget.total)}.`;
}

function programSentence(project, ev) {
  const ar = ev.program.areas;
  return `${ar.count} spaces totalling ${Math.round(ar.net_target)} m² net, which becomes roughly ${Math.round(ar.gross_target)} m² gross once circulation, walls and structure are included. MUST-have spaces account for ${Math.round(ar.net_must)} m² of that; the remainder is negotiable in the order shown below.`;
}
