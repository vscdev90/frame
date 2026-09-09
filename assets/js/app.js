/**
 * FRAME — application shell and router.
 *
 * A hash router keeps every route reachable as a static file on GitHub
 * Pages: no server rewrites, no 404 on refresh, and the app works from
 * any sub-path.
 */

import { el, esc, icons, initials } from './ui.js';
import { landing, projectsView } from './views/landing.js';
import { wizard } from './views/wizard.js';
import { workspace } from './views/workspace.js';
import { compare } from './views/compare.js';
import { brief } from './views/brief.js';
import { getProject, storageAvailable } from './store.js';

const outlet = document.getElementById('app');
const chrome = document.getElementById('chrome');

function parse(hash) {
  const clean = (hash || '#/').replace(/^#\/?/, '');
  return clean.split('/').filter(Boolean);
}

function resolve(segments) {
  if (!segments.length) return { view: landing };
  if (segments[0] === 'projects') return { view: projectsView };
  if (segments[0] === 'new') return { view: wizard, step: 'project' };
  if (segments[0] === 'project' && segments[1]) {
    const projectId = segments[1];
    const page = segments[2] || 'workspace';
    if (page === 'workspace') return { view: workspace, projectId };
    if (page === 'compare') return { view: compare, projectId };
    if (page === 'brief') return { view: brief, projectId };
    return { view: wizard, projectId, step: page };
  }
  return { view: landing };
}

export function navigate(hash, { replace = false, force = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    if (force) render();
  } else if (location.hash === hash) {
    render();
  } else {
    location.hash = hash;
  }
}

function renderChrome(route) {
  const project = route.projectId ? getProject(route.projectId) : null;
  chrome.innerHTML = `
    <a class="wordmark" href="#/">Frame</a>
    <nav>
      ${project ? `
        <a href="#/project/${esc(project.id)}/workspace">Design</a>
        <a href="#/project/${esc(project.id)}/compare">Compare</a>
        <a href="#/project/${esc(project.id)}/brief">Brief</a>` : `
        <a href="#/">How it works</a>
        <a href="#/projects">Projects</a>`}
      <a href="#/projects">My projects</a>
      <span class="avatar" title="Local browser session">${initials(project?.name || 'FR')}</span>
    </nav>`;
}

let current = null;

function render() {
  const route = resolve(parse(location.hash));
  renderChrome(route);

  let view;
  try {
    view = route.view({ ...route, navigate });
  } catch (err) {
    // Never leave the previous page on screen pretending to be this one.
    console.error(err);
    view = el(`<div class="wrap"><div class="empty">
      <p>Something went wrong rendering this page.</p>
      <p class="small">${esc(err.message)}</p>
      <a class="btn" href="#/projects">Back to your projects</a></div></div>`);
  }
  outlet.replaceChildren(view);
  current = route;

  // Restore the top of the page on navigation, but not on in-page updates.
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  // On narrow screens the step bar scrolls sideways; keep the step the
  // user is actually on in view rather than stranding it off-screen.
  const activeStep = outlet.querySelector('.stepbar .step.active');
  if (activeStep) {
    const bar = activeStep.closest('.stepbar');
    if (bar.scrollWidth > bar.clientWidth) {
      bar.scrollLeft = activeStep.offsetLeft - (bar.clientWidth - activeStep.offsetWidth) / 2;
    }
  }
  document.title = route.projectId && getProject(route.projectId)
    ? `${getProject(route.projectId).name} · FRAME`
    : 'FRAME — Design within reality.';
}

window.addEventListener('hashchange', render);

window.addEventListener('error', (e) => {
  // A view that throws must not leave a blank page behind.
  console.error(e.error || e.message);
  if (!outlet.childElementCount) {
    outlet.replaceChildren(el(`<div class="wrap"><div class="empty">
      <p>Something went wrong rendering this page.</p>
      <a class="btn" href="#/">Back to the start</a></div></div>`));
  }
});

if (!storageAvailable()) {
  document.body.prepend(el(`<div class="notice warn" style="border-radius:0;border-left:0;border-right:0;border-top:0">
    Browser storage is unavailable, so projects cannot be saved between visits. Everything else works.
  </div>`));
}

render();
