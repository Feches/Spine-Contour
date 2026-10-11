// Handles of the level model: where a level's draggable points are, which one a click lands on, how
// moving or nudging one rewrites the level's geometry, and the Tab order across the editor
// (plan 2026-10-10 Task 3; handoff §7). Pure: no DOM. A "canvas" is anything with `width`, `height`
// and `getBoundingClientRect()`, as `viewer/geometry.js` takes.
//
// A handle is named by a string per level: SA, SP, IA, IP, CENTROID, or R0..R3 for the rim points of a
// femoral head. The editor's focused handle is `{ code, handle }` (`state.levelEditor.handle`).
//
// Points are [x, y] in pixels of the stored image. The points `levelHandles` and `handleAt` return are
// the geometry's own (read them, do not change them); `moveHandle` and `nudgeHandle` never mutate their
// input and return a NEW geometry with new arrays along the changed path.

import { LEVEL_CODES, MIN_RADIUS, kindOf, fitRim, synthesizeRim } from '../data/levels.js';
import { imageToClient } from './geometry.js';

export const RIM_HANDLES = ['R0', 'R1', 'R2', 'R3'];

const isPoint = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

// Each corner handle names the pair it lives in and its place there: superior = [SA, SP], inferior = [IA, IP].
const SLOTS = { SA: ['superior', 0], SP: ['superior', 1], IA: ['inferior', 0], IP: ['inferior', 1] };

/** The rim a circle's handles sit on: its own, or four synthesised points for model output that has none. */
function rimOf(circle) {
  if (Array.isArray(circle.rim)) return circle.rim;
  return isPoint(circle.center) && Number.isFinite(circle.radius) ? synthesizeRim(circle) : [];
}

function candidates(code, geometry) {
  const corner = name => ({ handle: name, point: geometry[SLOTS[name][0]]?.[SLOTS[name][1]], colorKey: name });
  const centroid = { handle: 'CENTROID', point: geometry.centroid, colorKey: 'level' };
  switch (kindOf(code)) {
    case 'body': return ['SA', 'SP', 'IA', 'IP'].map(corner);
    case 'c2': return [corner('IA'), corner('IP'), centroid];
    case 'endplate': return [corner('SA'), corner('SP')];
    case 'centroid': return [centroid];
    case 'circle': return rimOf(geometry).slice(0, RIM_HANDLES.length)
      .map((point, i) => ({ handle: RIM_HANDLES[i], point, colorKey: 'trace' }));
    default: return [];
  }
}

/**
 * The handles of one level in Tab order: `body` SA SP IA IP; `c2` IA IP CENTROID; `endplate` SA SP;
 * `centroid` CENTROID; `circle` R0..R3 over the rim, or over four synthesised points while it has none.
 * `colorKey` names the canvas colour: the handle's own name for a corner, `level` for a centroid, `trace`
 * for a rim point. No geometry: no handles.
 * @returns {{handle: string, point: [number, number], colorKey: string}[]}
 */
export function levelHandles(code, geometry) {
  return geometry ? candidates(code, geometry).filter(entry => isPoint(entry.point)) : [];
}

/** The point of one handle, or null when the level has no such handle. */
export function handleAt(code, geometry, handle) {
  return levelHandles(code, geometry).find(entry => entry.handle === handle)?.point ?? null;
}

/**
 * The geometry with one handle moved to `point`. A corner replaces that entry of its pair, a centroid
 * is replaced; a rim point replaces that point of the (materialised) rim and the circle is refitted
 * over it with no radius cap. A move that would leave the head's radius under MIN_RADIUS (0.5 px: the
 * label record cannot hold a radius of 0; ruling R25) is refused and the geometry returned unchanged, as is
 * a handle the level does not have.
 * @returns {import('../data/levels.js').LevelGeometry}
 */
export function moveHandle(code, geometry, handle, point) {
  if (handleAt(code, geometry, handle) === null) return geometry;
  const moved = [point[0], point[1]];
  if (handle === 'CENTROID') return { ...geometry, centroid: moved };
  if (kindOf(code) === 'circle') {
    const rim = rimOf(geometry).map(p => [p[0], p[1]]);
    rim[RIM_HANDLES.indexOf(handle)] = moved;
    const refit = fitRim(rim, Infinity);
    return refit && refit.radius >= MIN_RADIUS ? refit : geometry;
  }
  const [key, index] = SLOTS[handle];
  const pair = geometry[key];
  return { ...geometry, [key]: index === 0 ? [moved, pair[1]] : [pair[0], moved] };
}

/** `moveHandle` by an offset from the handle's current point (arrow-key nudges); unchanged when the handle does not exist. */
export function nudgeHandle(code, geometry, handle, dx, dy) {
  const from = handleAt(code, geometry, handle);
  return from === null ? geometry : moveHandle(code, geometry, handle, [from[0] + dx, from[1] + dy]);
}

/**
 * The handle nearest the pointer, or null. `handles` is what `levelHandles` returns; the distance is
 * measured in client space (CSS pixels), so the grab radius is the same at any zoom. A tie goes to the
 * earlier handle.
 * @returns {string|null}
 */
export function hitTestLevelHandles(handles, clientX, clientY, canvas, radius = 14) {
  const rect = canvas.getBoundingClientRect();
  let nearest = null;
  let best = Infinity;
  for (const { handle, point } of handles) {
    const [x, y] = imageToClient(point, rect, canvas);
    const distance = Math.hypot(clientX - x, clientY - y);
    if (distance <= radius && distance < best) {
      best = distance;
      nearest = handle;
    }
  }
  return nearest;
}

/**
 * Every handle Tab can reach: those of the levels that are visible, have geometry and are not the one
 * being placed, in LEVEL_CODES order. A fresh array of fresh `{code, handle}` objects.
 */
export function handleOrder(editor) {
  const order = [];
  if (!editor?.levels) return order;
  for (const code of LEVEL_CODES) {
    const level = editor.levels[code];
    if (!level?.visible || !level.geometry || editor.placing?.code === code) continue;
    for (const { handle } of levelHandles(code, level.geometry)) order.push({ code, handle });
  }
  return order;
}

/**
 * The handle after (`direction` >= 0) or before (`direction` < 0) the focused one, wrapping around
 * `handleOrder` and crossing levels. With no usable focused handle (none, or one on a level or handle
 * that is not in the order, such as a level since hidden) it starts from the selected level when that
 * level is in the order (its first handle going forward, its last going back), else from the first
 * (forward) or last (back) entry. Null when the order is empty.
 * @returns {{code: string, handle: string}|null}
 */
export function nextLevelHandle(editor, direction) {
  const order = handleOrder(editor);
  if (order.length === 0) return null;
  const back = direction < 0;
  const current = editor.handle;
  const index = current ? order.findIndex(entry => entry.code === current.code && entry.handle === current.handle) : -1;
  if (index >= 0) return order[(index + (back ? order.length - 1 : 1)) % order.length];
  const own = order.filter(entry => entry.code === editor.selected);
  const pool = own.length > 0 ? own : order;
  return back ? pool[pool.length - 1] : pool[0];
}
