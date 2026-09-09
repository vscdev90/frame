/**
 * Gesture maths for the 3D viewer, tested without a WebGL context so it
 * runs anywhere — including where the Three.js CDN is unreachable.
 */
import { pinchRadius, panOffset, MIN_RADIUS, MAX_RADIUS } from '../assets/js/render/viewer3d.js';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); failures++; }
};
const close = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

console.log('pinch zoom');
check('spreading the fingers moves the camera closer',
  pinchRadius(40, 100, 200) < 40, `got ${pinchRadius(40, 100, 200)}`);
check('pinching the fingers pulls the camera back',
  pinchRadius(40, 200, 100) > 40, `got ${pinchRadius(40, 200, 100)}`);
check('doubling the span halves the distance',
  close(pinchRadius(40, 100, 200), 20), `got ${pinchRadius(40, 100, 200)}`);
check('no change when the span is unchanged',
  close(pinchRadius(40, 137, 137), 40));
check('clamped at the near limit', pinchRadius(40, 1, 100000) === MIN_RADIUS);
check('clamped at the far limit', pinchRadius(200, 100000, 1) === MAX_RADIUS);
check('a zero span does not produce infinity',
  Number.isFinite(pinchRadius(40, 100, 0)));

console.log('two-finger pan');
// Facing along -x (theta = 0): right is +z, forward is -x.
const east = panOffset(0, 40, 100, 0);
check('a horizontal drag moves the target across the view',
  Math.abs(east.z) > 1e-3 && close(east.x, 0), `got x=${east.x} z=${east.z}`);
const north = panOffset(0, 40, 0, 100);
check('a vertical drag moves the target along the view',
  Math.abs(north.x) > 1e-3 && close(north.z, 0), `got x=${north.x} z=${north.z}`);
check('drags in opposite directions cancel out', (() => {
  const a = panOffset(1.1, 40, 60, 25);
  const b = panOffset(1.1, 40, -60, -25);
  return close(a.x + b.x, 0) && close(a.z + b.z, 0);
})());
check('panning scales with the camera distance',
  Math.abs(panOffset(0.7, 80, 50, 0).z) > Math.abs(panOffset(0.7, 20, 50, 0).z));
check('the pan direction follows the orbit angle', (() => {
  const a = panOffset(0, 40, 100, 0);
  const b = panOffset(Math.PI / 2, 40, 100, 0);
  return !close(a.x, b.x) || !close(a.z, b.z);
})());
check('no drag means no movement',
  close(panOffset(2.2, 40, 0, 0).x, 0) && close(panOffset(2.2, 40, 0, 0).z, 0));

console.log(failures ? `\n${failures} gesture check(s) failed.` : '\nAll gesture checks passed.');
process.exit(failures ? 1 : 0);
