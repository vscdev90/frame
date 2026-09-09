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

export const MIN_RADIUS = 8;
export const MAX_RADIUS = 220;

/**
 * Pinch zoom: the camera distance scales inversely with the distance
 * between the fingers, so spreading them moves the camera closer.
 * Pure so it can be tested without a WebGL context.
 */
export function pinchRadius(startRadius, startSpan, span) {
  const safeSpan = Math.max(1, span);
  return clamp((startRadius * startSpan) / safeSpan, MIN_RADIUS, MAX_RADIUS);
}

/**
 * Ground-plane pan. `right` and `forward` are the camera's horizontal
 * axes at the current orbit angle, so a drag always pushes the model the
 * way the hand went. Returns the delta to add to the orbit target.
 */
export function panOffset(theta, radius, dx, dy) {
  const scale = radius * 0.0016;
  const right = { x: -Math.sin(theta), z: Math.cos(theta) };
  const forward = { x: -Math.cos(theta), z: -Math.sin(theta) };
  return {
    x: (-right.x * dx + forward.x * dy) * scale,
    z: (-right.z * dx + forward.z * dy) * scale
  };
}

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
  // Pointer events cover mouse, pen and touch alike. Active pointers are
  // tracked by id so one finger orbits and two fingers pinch to zoom and
  // pan together — the gesture a phone user expects from a map.
  const el = renderer.domElement;
  const pointers = new Map();
  let orbitFrom = null;
  let pinch = null;

  const pointerList = () => [...pointers.values()];

  function pinchSpan() {
    const [a, b] = pointerList();
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }
  function pinchCentre() {
    const [a, b] = pointerList();
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function beginPinch() {
    pinch = { span: pinchSpan(), radius: state.radius, centre: pinchCentre() };
  }

  function panBy(dx, dy) {
    const delta = panOffset(state.theta, state.radius, dx, dy);
    state.target.x += delta.x;
    state.target.z += delta.z;
  }

  const onDown = (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    if (pointers.size === 2) {
      beginPinch();
      orbitFrom = null;
    } else if (pointers.size === 1) {
      orbitFrom = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 1 };
    }
    el.style.cursor = 'grabbing';
  };

  const onMove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      if (!pinch) beginPinch();
      // Spreading the fingers moves the camera closer, pinching pulls back.
      state.radius = pinchRadius(pinch.radius, pinch.span, pinchSpan());
      // The midpoint drifting is a two-finger pan.
      const centre = pinchCentre();
      panBy(centre.x - pinch.centre.x, centre.y - pinch.centre.y);
      pinch.centre = centre;
      render();
      return;
    }

    if (!orbitFrom) return;
    const dx = e.clientX - orbitFrom.x;
    const dy = e.clientY - orbitFrom.y;
    orbitFrom.x = e.clientX; orbitFrom.y = e.clientY;
    if (orbitFrom.pan) {
      panBy(dx, dy);
    } else {
      state.theta -= dx * 0.007;
      state.phi = clamp(state.phi - dy * 0.006, 0.08, Math.PI / 2 - 0.03);
    }
    render();
  };

  const onUp = (e) => {
    pointers.delete(e.pointerId);
    try { el.releasePointerCapture?.(e.pointerId); } catch { /* nothing captured */ }
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      // Lifting one finger of a pinch continues as an orbit from where
      // the remaining finger is, rather than snapping the view.
      const [remaining] = pointerList();
      orbitFrom = { x: remaining.x, y: remaining.y, pan: false };
    } else if (pointers.size === 0) {
      orbitFrom = null;
      el.style.cursor = 'grab';
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    state.radius = clamp(state.radius * (1 + Math.sign(e.deltaY) * 0.12), MIN_RADIUS, MAX_RADIUS);
    render();
  };

  // Double tap or double click reframes the model, the way out of a
  // gesture that went somewhere unhelpful.
  const onDoubleClick = () => {
    frameCamera(model, state);
    render();
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('dblclick', onDoubleClick);
  el.addEventListener('wheel', onWheel, { passive: false });

  // Keyboard access: the viewer must not be mouse-only.
  el.tabIndex = 0;
  el.setAttribute('role', 'application');
  el.setAttribute('aria-label', '3D model. Use the arrow keys to orbit and plus or minus to zoom. On a touch screen, drag to orbit and pinch to zoom.');
  el.addEventListener('keydown', (e) => {
    const step = 0.12;
    if (e.key === 'ArrowLeft') state.theta -= step;
    else if (e.key === 'ArrowRight') state.theta += step;
    else if (e.key === 'ArrowUp') state.phi = clamp(state.phi - step * 0.6, 0.08, Math.PI / 2 - 0.03);
    else if (e.key === 'ArrowDown') state.phi = clamp(state.phi + step * 0.6, 0.08, Math.PI / 2 - 0.03);
    else if (e.key === '+' || e.key === '=') state.radius = clamp(state.radius * 0.88, MIN_RADIUS, MAX_RADIUS);
    else if (e.key === '-') state.radius = clamp(state.radius * 1.14, MIN_RADIUS, MAX_RADIUS);
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
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('dblclick', onDoubleClick);
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
