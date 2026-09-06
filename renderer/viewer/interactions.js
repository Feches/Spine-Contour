import { LEVELS, CORNERS, landmarkAt, setLandmarkAt, femoralCircle, setFemoralCircle, FEMORAL_SIDES } from './geometry.js';

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.4;
export const ZOOM_STEP = 1.25;

export function clampZoom(zoom) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

export function zoomIn(zoom) {
  return clampZoom(zoom * ZOOM_STEP);
}

export function zoomOut(zoom) {
  return clampZoom(zoom / ZOOM_STEP);
}

// A chorded pan: the primary AND secondary buttons held together.
//
// Test the `buttons` BITMASK (left 1, right 2, middle 4), never `button`. The Pointer Events
// chorded-button rule fires pointerdown only on the no-buttons -> some-button transition and
// pointerup only on the transition back to zero, so the second button of a chord and the first
// release out of one BOTH arrive as pointermove, carrying `button` = the button that changed
// (2 for a left-first chord, 0 for a right-first one) and `buttons` = the new mask. A test on
// `button` gets exactly one press order right. Verified on Electron 44 / Chrome 152.
export const CHORD_MASK = 0b11;

export function isChordHeld(buttons) {
  return (buttons & CHORD_MASK) === CHORD_MASK;
}

/**
 * Zoom about a point rather than the film's centre.
 *
 * components/viewer.js writes `translate(panX,panY) scale(zoom)` on .viewer-host, which is
 * position:absolute; inset:0; transform-origin:center inside a .viewer-stage that declares no
 * border and no padding. transform-origin wraps the WHOLE transform list, so a host-local point
 * p lands at C + P + z*(p - C) where C is the stage's centre -- NOT at P + z*p. Holding the
 * point under the cursor across z0 -> z1 gives
 *
 *   P1 = k*P0 + (1 - k)*offset,   k = z1/z0
 *
 * with `offset` measured FROM THE STAGE CENTRE. The naive top-left formula is wrong by
 * (1-z)*C -- 500px at z=2 on a 1000px stage, i.e. nearly right in the middle and grossly wrong
 * at the edges, which is exactly where a quick manual test does not look.
 *
 * The step and the clamp happen INSIDE and k comes from the CLAMPED result, so a tick at
 * ZOOM_MIN/ZOOM_MAX gives k === 1 and leaves the pan alone. Deriving k from the REQUESTED zoom
 * instead makes the film creep further every tick while the zoom label sits frozen at 240%.
 *
 * Takes a DIRECTION, not a factor, so the wheel and the toolbar buttons agree bit-for-bit:
 * `zoom * (1/ZOOM_STEP)` is not `zoom / ZOOM_STEP` in binary floating point.
 *
 * Must not mutate `view`: setState's functional form hands the updater the RAW store object,
 * not the frozen copy getState() returns.
 *
 * @param {{zoom:number, panX:number, panY:number}} view current view; NOT mutated
 * @param {number} direction > 0 zooms in, otherwise out
 * @param {number} offsetX pointer x minus the stage's centre x, CSS px
 * @param {number} offsetY pointer y minus the stage's centre y, CSS px
 * @returns {{zoom:number, panX:number, panY:number}} a setState patch
 */
export function zoomAbout(view, direction, offsetX, offsetY) {
  const zoom = direction > 0 ? zoomIn(view.zoom) : zoomOut(view.zoom);
  const k = zoom / view.zoom;
  return {
    zoom,
    panX: k * view.panX + (1 - k) * offsetX,
    panY: k * view.panY + (1 - k) * offsetY,
  };
}

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point, a, b) {
  const [px, py] = point; const [ax, ay] = a; const [bx, by] = b;
  const dx = bx - ax; const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx; const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function vertebraAt(geometry, point, radius = 20) {
  for (const level of ['L1', 'L2', 'L3', 'L4', 'L5']) {
    if (pointInPolygon(point, geometry.vertebrae[level].quadrilateral)) return level;
  }
  const [sa, sp] = geometry.s1_superior;
  if (distanceToSegment(point, sa, sp) <= radius) return 'S1';
  return null;
}

/**
 * @typedef {Object} Selection
 * @property {'landmark'|'femoral'} kind
 * @property {string} [level]   'L1'..'L5'|'S1' — present when kind === 'landmark'
 * @property {string} [corner]  'SA'|'SP'|'IA'|'IP' — present when kind === 'landmark'
 * @property {'left'|'right'} [side]   present when kind === 'femoral'
 * @property {'center'|'rim'} [part]   present when kind === 'femoral'
 */

// The 22 landmark stops in anatomical order: L1 SA,SP,IA,IP · L2 … · L5 · S1 SA,SP.
export const TAB_ORDER = [
  ...LEVELS.flatMap((level) => CORNERS.map((corner) => ({ kind: 'landmark', level, corner }))),
  { kind: 'landmark', level: 'S1', corner: 'SA' },
  { kind: 'landmark', level: 'S1', corner: 'SP' },
];

// What Tab / Shift+Tab actually cycle: the landmarks plus the two femoral-head centres. The
// heads are not landmarks, so they are not in TAB_ORDER, but the spec requires them to be
// reachable by keyboard. Rim handles are not stops of their own -- see nextSelection.
export const FULL_ORDER = [
  ...TAB_ORDER,
  { kind: 'femoral', side: 'left', part: 'center' },
  { kind: 'femoral', side: 'right', part: 'center' },
];

// Exact handle identity. The canvas uses it to decide which handle is selected or hovered,
// and the viewer uses it to skip a hover redraw when nothing changed.
export function sameHandle(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'landmark') return a.level === b.level && a.corner === b.corner;
  return a.side === b.side && a.part === b.part;
}

// Tab stops are per femoral SIDE: the rim handle is not a stop of its own, so a rim
// selection resolves to its side's centre stop for cycling purposes.
function sameStop(stop, current) {
  if (stop.kind !== current.kind) return false;
  if (stop.kind === 'landmark') return stop.level === current.level && stop.corner === current.corner;
  return stop.side === current.side;
}

export function nextSelection(current, direction) {
  const step = direction < 0 ? -1 : 1;
  const last = FULL_ORDER.length - 1;
  const index = current ? FULL_ORDER.findIndex((stop) => sameStop(stop, current)) : -1;
  if (index === -1) return step > 0 ? FULL_ORDER[0] : FULL_ORDER[last];
  return FULL_ORDER[(index + step + FULL_ORDER.length) % FULL_ORDER.length];
}

// Moves the selected handle by (dx, dy) image pixels. Mutates `geometry` -- callers hand it
// a working copy, never the store's object (see components/viewer.js).
export function nudge(geometry, selection, dx, dy) {
  if (selection.kind === 'landmark') {
    const [x, y] = landmarkAt(geometry, selection.level, selection.corner);
    setLandmarkAt(geometry, selection.level, selection.corner, [x + dx, y + dy]);
    return geometry;
  }
  const [cx, cy, r] = femoralCircle(geometry, selection.side);
  if (selection.part === 'center') {
    return setFemoralCircle(geometry, selection.side, [cx + dx, cy + dy, r]);
  }
  // The rim has one degree of freedom. Right/up grow the radius, left/down shrink it,
  // floored at 1px: the backend rejects a non-positive radius (backend/utils.py:296).
  return setFemoralCircle(geometry, selection.side, [cx, cy, r + dx - dy]);
}

// Coordinate-space agnostic: operates on whatever space `circles` and (x, y) share. The
// viewer feeds it circles mapped into client space so the hit radius is 14 CSS pixels at
// any zoom, the same convention nearestLandmark uses.
export function hitTestFemoral(circles, x, y, radius = 14) {
  let best = null;
  let bestDistance = Infinity;
  circles.forEach(([cx, cy, r], index) => {
    const side = FEMORAL_SIDES[index];
    const centerDistance = Math.hypot(x - cx, y - cy);
    if (centerDistance <= radius && centerDistance < bestDistance) {
      best = { kind: 'femoral', side, part: 'center' };
      bestDistance = centerDistance;
    }
    const rimDistance = Math.abs(centerDistance - r);
    if (rimDistance <= radius && rimDistance < bestDistance) {
      best = { kind: 'femoral', side, part: 'rim' };
      bestDistance = rimDistance;
    }
  });
  return best;
}

// 1px per press, 10px with Shift (spec section 12).
export function arrowKeyDelta(key, shiftKey) {
  const amount = shiftKey ? 10 : 1;
  if (key === 'ArrowUp') return { dx: 0, dy: -amount };
  if (key === 'ArrowDown') return { dx: 0, dy: amount };
  if (key === 'ArrowLeft') return { dx: -amount, dy: 0 };
  if (key === 'ArrowRight') return { dx: amount, dy: 0 };
  return null;
}

export function debounce(fn, ms) {
  let timer = null;
  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}
