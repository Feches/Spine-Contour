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

import { LEVEL_CODES, MIN_RADIUS, kindOf, fitRim, synthesizeRim, placementSteps, fullName } from '../data/levels.js';
import { imageToClient } from './geometry.js';

export const RIM_HANDLES = ['R0', 'R1', 'R2', 'R3'];

// (2026-10-21, partial endplates, spec §4) Every handle of a kind in placement-step order, present or not: the chips of
// a partial level list them all, the missing ones hollow. A head has no entry (its rim handles are RIM_HANDLES).
export const STEP_HANDLES = {
  body: ['SA', 'SP', 'IA', 'IP'], c2: ['IA', 'IP', 'CENTROID'], endplate: ['SA', 'SP'], centroid: ['CENTROID'],
};

/**
 * A handle's radius in CSS px at 1:1, from which it grows past 1:1 with the square root of the zoom (gate feedback G9,
 * decision D22 as amended), and the floor it shrinks to on a zoomed-out film (gate feedback G8, decision D21).
 */
export const HANDLE_RADIUS_CSS_PX = 6;
export const HANDLE_RADIUS_FLOOR_CSS_PX = 3;

// The ratio the handle functions size against: image px per CSS px, UNFLOORED (below 1 past 1:1); anything that is
// not a positive number reads as 1:1.
const ratioOf = pixelRatio => (Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1);

/**
 * A handle's radius in IMAGE pixels for a draw whose `pixelRatio` is the UNFLOORED ratio (image px per CSS px): 6 CSS
 * px on screen at 1:1; past 1:1 growing with the SQUARE ROOT of the zoom (8.5 CSS px at 2x, 12 at 4x, 17 at 8x) — the
 * middle ground between the rest of the overlay, which magnifies with the film under R28 and at 8x dwarfed a small
 * cervical body (G9, D22), and a flat 6 CSS px, which beside a 16 px outline read too small (G9 round 2) — and below
 * 1:1 shrinking with the film to 3 CSS px at a ratio of 2 and beyond, so a handle on a zoomed-out film no longer
 * covers a vertebra (G8, D21). In image px: 6·√ratio past 1:1, 6 from 1 to 2, 3·ratio beyond.
 */
export function handleRadiusImagePx(pixelRatio) {
  const ratio = ratioOf(pixelRatio);
  if (ratio < 1) return HANDLE_RADIUS_CSS_PX * Math.sqrt(ratio);
  return Math.max(HANDLE_RADIUS_FLOOR_CSS_PX * ratio, HANDLE_RADIUS_CSS_PX);
}

/**
 * The factor by which the handle's on-screen size differs from its 6 CSS px at `pixelRatio` (unfloored), for the
 * outline and focus ring to follow in step (G8, D21; G9, D22): 1 at 1:1, 2/3 at 1.5, 0.5 at 2 and beyond (zoomed out),
 * and past 1:1 the square root of the zoom (√2 at 2x, 2 at 4x).
 */
export function handleScale(pixelRatio) {
  const ratio = ratioOf(pixelRatio);
  return handleRadiusImagePx(ratio) / (HANDLE_RADIUS_CSS_PX * ratio);
}

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
 * (2026-10-20) The edit bar's chips for the selected placed level while no placement is in progress: one per
 * placement step of the level's kind in Tab order (`STEP_HANDLES`; a missing point's chip is `placed: false`;
 * 2026-10-22, the final review, M5), a head's one per rim point (`levelHandles`), labelled as the level's placement steps are (a body's SA SP
 * IA IP; C2's IA IP CENTROID; an endplate's ANT POST; CENTROID; a head's P1..P4, one per rim point), coloured as
 * the handle is (`colorKey`), the focused handle marked. The chips read the same whether the level was placed by
 * the model or by hand, which is the point: before, only a placement in progress showed its points in the bar.
 * Null while a placement is in progress (its own step chips show then), with nothing selected, or when the
 * selected level is hidden or unplaced. (2026-10-21) `aiming`: the focused chip is armed, so the next film click
 * places that point (levels.js aimHandle).
 * @returns {{code: string, chips: {handle: string, label: string, colorKey: string, focused: boolean, aiming: boolean, placed: boolean}[]}|null}
 */
export function selectedLevelChips(editor) {
  if (!editor || editor.placing) return null;
  const code = editor.selected;
  const entry = code ? editor.levels?.[code] : null;
  if (!entry?.visible || !entry.geometry) return null;
  const { steps } = placementSteps(code);
  const chip = (handle, colorKey, index, placed) => {
    const focused = placed && editor.handle?.code === code && editor.handle.handle === handle;
    return { handle, label: steps[index]?.label ?? handle, colorKey, focused, aiming: focused && Boolean(editor.aiming), placed };
  };
  // (2026-10-21, partial endplates, spec §4) One chip per step of the kind; a missing point's chip is `placed: false`.
  const names = STEP_HANDLES[kindOf(code)];
  const chips = names
    ? names.map((handle, index) => chip(handle, handle === 'CENTROID' ? 'level' : handle, index, handleAt(code, entry.geometry, handle) !== null))
    : levelHandles(code, entry.geometry).map(({ handle, colorKey }, index) => chip(handle, colorKey, index, true));
  return chips.length > 0 ? { code, chips } : null;
}

/**
 * (2026-10-21) The armed point, for the edit bar: its chip label, the help line for the click (the placement step's
 * own for a corner, an endplate point or a centroid; a rim point's names the head) and the bar's label
 * (`PLACING L4 · IP`). Null when nothing is armed, or the armed level is hidden, unplaced or lacks that handle.
 * @returns {{code: string, handle: string, label: string, help: string, title: string}|null}
 */
export function aimedStep(editor) {
  if (!editor?.aiming || !editor.handle) return null;
  const { code, handle } = editor.handle;
  const entry = editor.levels?.[code];
  if (!entry?.visible || !entry.geometry) return null;
  // (2026-10-22, the final review, I1) A missing point is never named; the step's index comes from the kind's whole step
  // list (STEP_HANDLES), since `levelHandles` lists existing points only and its index is shifted on a partial level.
  // A head keeps the `levelHandles` index: its rim handles R0..R3 map to P1..P4 in order.
  if (handleAt(code, entry.geometry, handle) === null) return null;
  const names = STEP_HANDLES[kindOf(code)];
  const index = names
    ? names.indexOf(handle)
    : levelHandles(code, entry.geometry).findIndex((entry) => entry.handle === handle);
  if (index < 0) return null;
  const step = placementSteps(code).steps[index];
  const label = step?.label ?? handle;
  const help = kindOf(code) === 'circle'
    ? `Click where rim point ${label} of ${fullName(code)} should be.`
    : step?.help ?? `Click where ${label} should be.`;
  return { code, handle, label, help, title: `PLACING ${fullName(code).toUpperCase()} · ${label}` };
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
