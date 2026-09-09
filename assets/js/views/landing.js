import { el, icons, esc } from '../ui.js';
import { listProjects } from '../store.js';

/** An abstract, deterministic hero scene — no stock photography. */
function heroScene() {
  return `
  <svg class="scene" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#eceae6"/>
        <stop offset="52%" stop-color="#e2e4e0"/>
        <stop offset="100%" stop-color="#d7dbd6"/>
      </linearGradient>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#cfd6d3"/>
        <stop offset="100%" stop-color="#dfe3df"/>
      </linearGradient>
      <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#f6d8a8" stop-opacity=".85"/>
        <stop offset="100%" stop-color="#f3e6cf" stop-opacity=".5"/>
      </linearGradient>
      <!-- Scrim: keeps the headline legible over the scene at every width. -->
      <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#f2f1ee" stop-opacity=".97"/>
        <stop offset="42%" stop-color="#f2f1ee" stop-opacity=".82"/>
        <stop offset="72%" stop-color="#f2f1ee" stop-opacity="0"/>
      </linearGradient>
    </defs>

    <rect width="1200" height="700" fill="url(#sky)"/>
    <circle cx="880" cy="210" r="120" fill="#f2ece2" opacity=".7"/>

    <!-- distant tree line -->
    <g fill="#c6ccc4" opacity=".85">
      <path d="M0 430c60-14 90-52 130-52s70 34 118 30 74-40 122-38 78 44 128 42 86-40 140-38 92 42 148 40 88-34 148-30 106 34 166 26v58H0z"/>
    </g>
    <g fill="#b6bdb4" opacity=".6">
      <path d="M0 452c70 6 120-24 176-22s96 30 156 28 96-26 152-24 92 30 156 28 104-26 168-22 116 26 192 20v42H0z"/>
    </g>

    <!-- the house: a calm horizontal volume, kept clear of the headline -->
    <g transform="translate(210,0)">
      <rect x="300" y="352" width="440" height="118" fill="#2a2724"/>
      <rect x="300" y="344" width="452" height="12" fill="#1d1b19"/>
      <rect x="322" y="368" width="150" height="86" fill="url(#glow)"/>
      <rect x="486" y="368" width="96" height="86" fill="#3d3936"/>
      <rect x="596" y="368" width="126" height="86" fill="url(#glow)" opacity=".75"/>
      <g stroke="#2a2724" stroke-width="3">
        <path d="M472 368v86M582 368v86M722 368v86"/>
      </g>
      <!-- lower wing -->
      <rect x="740" y="396" width="180" height="74" fill="#35312e"/>
      <rect x="740" y="390" width="188" height="8" fill="#1d1b19"/>
      <rect x="762" y="410" width="132" height="52" fill="url(#glow)" opacity=".6"/>
    </g>

    <!-- terrace + water -->
    <rect x="0" y="470" width="1200" height="26" fill="#cfd0ca"/>
    <rect x="0" y="496" width="1200" height="204" fill="url(#water)"/>
    <g opacity=".35" fill="#2a2724" transform="translate(210,0)">
      <rect x="300" y="496" width="440" height="52"/>
      <rect x="740" y="496" width="180" height="34"/>
    </g>
    <g stroke="#eef1ee" stroke-width="2" opacity=".65">
      <path d="M120 540h300M520 566h420M180 596h260M640 620h380M80 650h420"/>
    </g>

    <!-- foreground trees -->
    <g fill="#8e968b" opacity=".9">
      <path d="M1064 470c0-88 30-146 30-146s30 58 30 146z"/>
      <path d="M1160 470c0-58 20-98 20-98s20 40 20 98z"/>
    </g>

    <rect width="1200" height="700" fill="url(#scrim)"/>
  </svg>`;
}

export function landing({ navigate }) {
  const projects = listProjects();

  const node = el(`
  <div>
    <div class="wrap wide">
      <div class="hero">
        ${heroScene()}
        <div class="hero-body">
          <h1>Design<br>within reality.</h1>
          <p class="lede">Discover what you can build. Explore, compare and make informed decisions — before you engage an architect.</p>
          <div class="row wrap" style="margin-top:28px">
            <button class="btn" data-action="start">Start a project</button>
            ${projects.length ? `<button class="btn ghost" data-action="projects">My projects (${projects.length})</button>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="wrap">
      <div class="eyebrow">Real ideas. Real possibilities.</div>
      <h2 style="max-width:22ch;margin-bottom:36px">FRAME helps you discover what you can build before you start designing.</h2>

      <div class="loop" style="margin-bottom:52px">
        <span>Define</span><i>→</i><span>Explore</span><i>→</i><span>Compare</span><i>→</i>
        <span>Adjust</span><i>→</i><span>Validate</span><i>→</i><span>Refine</span>
      </div>

      <div class="feature-grid">
        <div class="feature">
          <span class="num">01 — Location &amp; rules</span>
          <h3>Start from what the site allows</h3>
          <p class="muted">Plot area, build coverage, height and setbacks come from a structured rule store — each one traceable to its source, with its confidence shown.</p>
        </div>
        <div class="feature">
          <span class="num">02 — Directions</span>
          <h3>Three real strategies, not three pictures</h3>
          <p class="muted">Each direction is generated from your program, plot and budget, then measured: area, cost range, feasibility, advantages and the things it costs you.</p>
        </div>
        <div class="feature">
          <span class="num">03 — Consequences</span>
          <h3>Every decision connected to its effects</h3>
          <p class="muted">More glass means more daylight — and more cost, more solar load, more shading and, past a point, a different structure. FRAME shows the whole chain.</p>
        </div>
        <div class="feature">
          <span class="num">04 — Design brief</span>
          <h3>Arrive at something an architect can use</h3>
          <p class="muted">Goals, program, priorities, budget, the chosen direction, the assumptions behind the numbers, the risks and the open questions — in one document.</p>
        </div>
      </div>

      <hr class="divider" style="margin:52px 0">

      <div class="grid two" style="gap:32px">
        <div>
          <h3 style="margin-bottom:12px">What FRAME is</h3>
          <p class="muted">A design feasibility platform. It connects location, program, priorities, budget, constraints, construction, cost and feasibility into one model, so the consequences of a choice are visible while the choice is still cheap to change.</p>
        </div>
        <div>
          <h3 style="margin-bottom:12px">What FRAME is not</h3>
          <p class="muted">Not an AI architect, a house generator or an image generator. Geometry, cost and rules are computed deterministically. FRAME provides design exploration and preliminary feasibility information — it does not replace professional architectural, structural, planning, legal, financial or building-control advice.</p>
        </div>
      </div>

      <div class="row" style="margin-top:44px">
        <button class="btn" data-action="start">Start a project ${icons.arrowRight}</button>
      </div>
    </div>
  </div>`);

  node.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'start') navigate('#/new');
    if (btn.dataset.action === 'projects') navigate('#/projects');
  });

  return node;
}

export function projectsView({ navigate }) {
  const projects = listProjects();
  const node = el(`
  <div class="wrap">
    <div class="row between" style="margin-bottom:28px">
      <div>
        <h2>My projects</h2>
        <p class="muted small" style="margin-top:6px">Saved in this browser only. Nothing leaves your device.</p>
      </div>
      <button class="btn" data-action="new">New project</button>
    </div>
    ${projects.length ? `
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
        ${projects.map((p) => `
          <div class="card" data-id="${esc(p.id)}">
            <div class="row between" style="align-items:flex-start">
              <div>
                <h3 style="margin-bottom:4px">${esc(p.name)}</h3>
                <div class="small muted">${esc(p.site?.address || 'No address yet')}</div>
              </div>
              <span class="tag">${esc((p.building_type || 'draft').replace(/_/g, ' '))}</span>
            </div>
            <div class="small muted" style="margin-top:14px">
              ${p.program_answers?.bedrooms ?? 0} bedrooms · ${p.site?.plot_area ?? '—'} m² plot ·
              budget € ${Math.round((p.budget?.total || 0) / 1000)}k
            </div>
            <div class="row" style="margin-top:16px;gap:8px">
              <button class="btn sm" data-action="open" data-id="${esc(p.id)}">Open</button>
              <button class="btn sm ghost" data-action="brief" data-id="${esc(p.id)}">Brief</button>
              <span class="spacer"></span>
              <button class="btn sm quiet" data-action="delete" data-id="${esc(p.id)}">Delete</button>
            </div>
          </div>`).join('')}
      </div>` : `
      <div class="empty">
        <p>No projects yet.</p>
        <button class="btn" data-action="new">Start your first project</button>
      </div>`}
  </div>`);

  node.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'new') navigate('#/new');
    if (action === 'open') navigate(`#/project/${id}/workspace`);
    if (action === 'brief') navigate(`#/project/${id}/brief`);
    if (action === 'delete') {
      if (confirm('Delete this project? This cannot be undone.')) {
        const { deleteProject } = await import('../store.js');
        deleteProject(id);
        navigate('#/projects', { replace: true, force: true });
      }
    }
  });

  return node;
}
