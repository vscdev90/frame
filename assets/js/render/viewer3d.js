/**
 * 3D model viewer (spec §19) — Three.js / WebGL.
 *
 * The geometry is built from the same deterministic model the cost and
 * feasibility engines measured. Three.js is loaded from a CDN at
 * runtime; if that fails, or WebGL is unavailable, the caller falls
 * back to the isometric SVG renderer, which draws the same model.
 *
 * Orbit, zoom and pan are implemented directly on the canvas so the
 * viewer needs one module rather than an examples bundle.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

let THREE = null;
let loadPromise = null;

export function loadThree() {
  if (THREE) return Promise.resolve(THREE);
  if (!loadPromise) {
    loadPromise = import(/* webpackIgnore: true */ CDN)
      .then((mod) => { THREE = mod; return mod; })
      .catch((err) => { loadPromise = null; throw err; });
  }
  return loadPromise;
}

export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

/**
 * Mount a viewer into `container`. Returns a handle with update() and
 * dispose(), or null if 3D is not available.
 */
export async function mountViewer(container, model, options = {}) {
  if (!webglAvailable()) return null;
  const T = await loadThree();

  const scene = new T.Scene();
  scene.background = new T.Color(0xf7f6f4);

  const camera = new T.PerspectiveCamera(38, 1, 0.1, 600);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';

  // --- Lighting: a calm north-European sky, not a showroom -----------
  const hemi = new T.HemisphereLight(0xffffff, 0xdcd8d2, 1.05);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff6ea, 1.5);
  sun.position.set(-18, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  scene.add(sun);

  const root = new T.Group();
  scene.add(root);

  const state = {
    theta: Math.PI * 0.72,
    phi: Math.PI * 0.30,
    radius: 44,
    target: new T.Vector3(0, 2, 0),
    showRoof: true,
    floorFilter: null
  };

  build(T, root, model, state);
  frameCamera(model, state);

  // --- Interaction ---------------------------------------------------
  let dragging = null;
  const el = renderer.domElement;
  const onDown = (e) => {
    dragging = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 1 };
    el.setPointerCapture?.(e.pointerId);
    el.style.cursor = 'grabbing';
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.x;
    const dy = e.clientY - dragging.y;
    dragging.x = e.clientX; dragging.y = e.clientY;
    if (dragging.pan) {
      const scale = state.radius * 0.0016;
      state.target.x -= (dx * Math.cos(state.theta) + dy * 0) * scale;
      state.target.z -= (dx * -Math.sin(state.theta) + dy * 0) * scale;
      state.target.y = Math.max(0, state.target.y + dy * scale * 0.6);
    } else {
      state.theta -= dx * 0.007;
      state.phi = clamp(state.phi - dy * 0.006, 0.08, Math.PI / 2 - 0.03);
    }
    render();
  };
  const onUp = (e) => { dragging = null; el.style.cursor = 'grab'; el.releasePointerCapture?.(e.pointerId); };
  const onWheel = (e) => {
    e.preventDefault();
    state.radius = clamp(state.radius * (1 + Math.sign(e.deltaY) * 0.12), 8, 220);
    render();
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  // Keyboard access: the viewer must not be mouse-only.
  el.tabIndex = 0;
  el.setAttribute('role', 'application');
  el.setAttribute('aria-label', '3D model. Use the arrow keys to orbit and plus or minus to zoom.');
  el.addEventListener('keydown', (e) => {
    const step = 0.12;
    if (e.key === 'ArrowLeft') state.theta -= step;
    else if (e.key === 'ArrowRight') state.theta += step;
    else if (e.key === 'ArrowUp') state.phi = clamp(state.phi - step * 0.6, 0.08, Math.PI / 2 - 0.03);
    else if (e.key === 'ArrowDown') state.phi = clamp(state.phi + step * 0.6, 0.08, Math.PI / 2 - 0.03);
    else if (e.key === '+' || e.key === '=') state.radius = clamp(state.radius * 0.88, 8, 220);
    else if (e.key === '-') state.radius = clamp(state.radius * 1.14, 8, 220);
    else return;
    e.preventDefault();
    render();
  });

  function resize() {
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 420;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }

  function render() {
    const sinPhi = Math.sin(state.phi);
    camera.position.set(
      state.target.x + state.radius * sinPhi * Math.cos(state.theta),
      state.target.y + state.radius * Math.cos(state.phi),
      state.target.z + state.radius * sinPhi * Math.sin(state.theta)
    );
    camera.lookAt(state.target);
    renderer.render(scene, camera);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  return {
    update(nextModel, opts = {}) {
      Object.assign(state, opts);
      clear(root);
      build(T, root, nextModel, state);
      frameCamera(nextModel, state);
      render();
    },
    setOptions(opts) {
      Object.assign(state, opts);
      clear(root);
      build(T, root, model, state);
      render();
    },
    dispose() {
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
      clear(root);
      renderer.dispose();
      el.remove();
    }
  };

  function frameCamera(m, s) {
    const size = Math.max(m.site.width, m.site.depth, 20);
    s.radius = size * 1.5;
    s.target.set(0, m.height * 0.35, 0);
  }
}

function clear(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    else child.material?.dispose?.();
    group.remove(child);
  }
}

function build(T, root, model, state) {
  const mat = {
    ground: new T.MeshLambertMaterial({ color: 0xe9e7e2 }),
    garden: new T.MeshLambertMaterial({ color: 0xdfe3d8 }),
    wall: new T.MeshLambertMaterial({ color: 0xf1efec }),
    slab: new T.MeshLambertMaterial({ color: 0xd8d3cd }),
    roof: new T.MeshLambertMaterial({ color: 0x3f3a35 }),
    glass: new T.MeshLambertMaterial({ color: 0x7d94a1, transparent: true, opacity: 0.72 }),
    edge: new T.LineBasicMaterial({ color: 0x14110f, transparent: true, opacity: 0.35 })
  };

  // Site.
  const ground = new T.Mesh(new T.PlaneGeometry(model.site.width, model.site.depth), mat.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  const garden = new T.Mesh(new T.PlaneGeometry(model.site.width - 2.4, model.site.depth - 2.4), mat.garden);
  garden.rotation.x = -Math.PI / 2;
  garden.position.y = 0.01;
  garden.receiveShadow = true;
  root.add(garden);

  const w = model.footprint.width;
  const d = model.footprint.depth;
  const cx = model.origin.x + w / 2;
  const cz = model.origin.z + d / 2;

  const floors = state.floorFilter == null ? model.volumes : model.volumes.filter((v) => v.level <= state.floorFilter);
  for (const vol of floors) {
    const h = vol.y1 - vol.y0;
    const box = new T.Mesh(new T.BoxGeometry(w, h, d), mat.wall);
    box.position.set(cx, vol.y0 + h / 2, cz);
    box.castShadow = true;
    box.receiveShadow = true;
    root.add(box);

    const edges = new T.LineSegments(new T.EdgesGeometry(box.geometry), mat.edge);
    edges.position.copy(box.position);
    root.add(edges);
  }

  // Roof.
  const eaves = model.roof_geometry.eaves;
  if (state.showRoof !== false) {
    if (model.roof_geometry.type === 'gable') {
      const shape = new T.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(w / 2, 0);
      shape.lineTo(0, model.roof_geometry.ridge - eaves);
      shape.lineTo(-w / 2, 0);
      const geo = new T.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
      const roof = new T.Mesh(geo, mat.roof);
      roof.rotation.y = 0;
      roof.position.set(cx, eaves, cz - d / 2);
      roof.castShadow = true;
      root.add(roof);
    } else if (model.roof_geometry.type === 'mono') {
      const slab = new T.Mesh(new T.BoxGeometry(w + 0.3, 0.34, d + 0.3), mat.roof);
      slab.position.set(cx, eaves + 0.7, cz);
      slab.rotation.x = -Math.atan2(model.roof_geometry.high - model.roof_geometry.low, d);
      slab.castShadow = true;
      root.add(slab);
    } else {
      const slab = new T.Mesh(new T.BoxGeometry(w + 0.3, 0.4, d + 0.3), mat.slab);
      slab.position.set(cx, eaves + 0.2, cz);
      slab.castShadow = true;
      root.add(slab);
      if (model.courtyard) {
        const cp = model.courtyard.polygon;
        const cw = cp[1][0] - cp[0][0];
        const cd = cp[2][1] - cp[1][1];
        const void_ = new T.Mesh(new T.BoxGeometry(cw, 0.6, cd), mat.garden);
        void_.position.set(cp[0][0] + cw / 2, eaves + 0.2, cp[0][1] + cd / 2);
        root.add(void_);
      }
    }
  }

  // Openings, placed just proud of the facade so they read cleanly.
  for (const op of model.openings) {
    if (state.floorFilter != null && op.level > state.floorFilter) continue;
    const geo = new T.PlaneGeometry(op.width, op.height);
    const mesh = new T.Mesh(geo, mat.glass);
    const y = op.y + op.height / 2;
    if (op.face === 'south') mesh.position.set(model.origin.x + op.offset + op.width / 2, y, model.origin.z + d + 0.06);
    else if (op.face === 'north') { mesh.position.set(model.origin.x + op.offset + op.width / 2, y, model.origin.z - 0.06); mesh.rotation.y = Math.PI; }
    else if (op.face === 'east') { mesh.position.set(model.origin.x + w + 0.06, y, model.origin.z + op.offset + op.width / 2); mesh.rotation.y = Math.PI / 2; }
    else { mesh.position.set(model.origin.x - 0.06, y, model.origin.z + op.offset + op.width / 2); mesh.rotation.y = -Math.PI / 2; }
    root.add(mesh);
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
