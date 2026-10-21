export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 8;
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
 * (Gate feedback G4, 2026-10-11; plan D17) Whether a press completes a double click with the press before it.
 * Browsers fire `dblclick` for the primary button only, so the stage's double right-click (the window / level reset)
 * is detected here: the same button, no more than `withinMs` after the first press and no more than `withinPx` from
 * it. The caller passes the presses' own times (a pointer event's `timeStamp`); nothing here reads a clock.
 *
 * @param {{time:number, clientX:number, clientY:number, button:number}|null} previous the press before, or null
 * @param {{time:number, clientX:number, clientY:number, button:number}|null} next the press now
 * @param {{withinMs?:number, withinPx?:number}} [limits]
 * @returns {boolean}
 */
export function isDoubleClick(previous, next, { withinMs = 400, withinPx = 6 } = {}) {
  if (!previous || !next || previous.button !== next.button) return false;
  const elapsed = next.time - previous.time;
  return elapsed >= 0 && elapsed <= withinMs
    && Math.hypot(next.clientX - previous.clientX, next.clientY - previous.clientY) <= withinPx;
}

/**
 * (2026-10-11, ruling R37) Whether the pointer has moved far enough from its press to begin a drag: at least `px` CSS
 * pixels in a straight line (3 by default). The stage's right press windows the film only once this is true, so a
 * stray right click, or a right-first chord whose left button joins before the pointer moves, decodes nothing.
 *
 * @param {{clientX:number, clientY:number}} start the press
 * @param {{clientX:number, clientY:number}} point the pointer now
 * @param {number} [px] the distance, CSS px
 * @returns {boolean}
 */
export function exceedsSlop(start, point, px = 3) {
  return Math.hypot(point.clientX - start.clientX, point.clientY - start.clientY) >= px;
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
 * instead makes the film creep further every tick while the zoom label sits frozen at 800%.
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
  if (geometry.region === 'cervical') return null; // alignment constructions are selected by measurement row
  for (const level of ['L1', 'L2', 'L3', 'L4', 'L5']) {
    const body = geometry.vertebrae?.[level];
    if (body && body.quadrilateral && pointInPolygon(point, body.quadrilateral)) return level;
    // (2026-10-21, partial endplates, spec §5) a body with one endplate is hit near that line
    const plate = body && (body.superior ?? body.inferior);
    if (plate && distanceToSegment(point, plate[0], plate[1]) <= radius) return level;
  }
  if (!geometry.s1_superior) return null;
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
