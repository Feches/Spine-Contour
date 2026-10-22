// The level model behind the vertebral level editor (handoff §2, §6, §7; plan 2026-10-10 Task 1).
//
// Sixteen levels (C2-C7, T1, T4, L1-L5, S1, two femoral heads), each { visible, source, geometry }.
// Everything here is pure: no DOM, no store, no I/O. Every mutator takes an editor and returns a NEW
// editor, building new objects along the changed path so the reference-keyed redraw gates upstream
// see the change. A mutator that has nothing to do returns the editor it was given.
//
// Points are [x, y] in pixels of the stored image, origin top-left.
//
/** @typedef {[number, number]} Pt */
/** @typedef {{superior: [Pt, Pt]|null, inferior: [Pt, Pt]|null}} BodyGeometry   superior = [SA, SP], inferior = [IA, IP]; (2026-10-21, partial endplates, spec §3) either may be null, never absent */
/** @typedef {{inferior: [Pt, Pt]|null, centroid: Pt|null}} C2Geometry   (2026-10-21) either part may be null, never absent */
/** @typedef {{superior: [Pt, Pt]}} EndplateGeometry   T1 and S1 */
/** @typedef {{centroid: Pt}} CentroidGeometry   T4 */
/** @typedef {{center: Pt, radius: number, rim: Pt[]|null}} CircleGeometry   rim: 2-4 points, null for unedited model output */
/** @typedef {BodyGeometry|C2Geometry|EndplateGeometry|CentroidGeometry|CircleGeometry} LevelGeometry */
/** @typedef {{visible: boolean, source: 'model'|'annotator'|'film_type', geometry: LevelGeometry|null}} LevelEntry */

/** The store key `state.levelEditor`: null outside edit mode, else:
 * @typedef {Object} LevelEditor
 *  @property {string} studyId
 *  @property {'lumbar'|'cervical'|'full_spine'|'auto'} region      the film type the defaults were taken from
 *  @property {Object<string, LevelEntry>} levels                    one per LEVEL_CODES
 *  @property {Object<string, LevelGeometry|null>} model             the prediction's geometry per code (null = none)
 *  @property {Object<string, {visible: boolean, source: string, geometry: LevelGeometry|null}>} baseline
 *  @property {{file: string|null, exists: boolean}} record           the label record on disk for this study
 *  @property {string|null} selected                                 the selected row's code
 *  @property {{code: string, handle: string}|null} handle           the focused handle: 'SA'|'SP'|'IA'|'IP'|'CENTROID'|'R0'..'R3'
 *  @property {boolean} aiming                                       (2026-10-21) the focused handle is armed from its chip: the next film click places it
 *  @property {Placing|null} placing                                  the placement in progress
 *  @property {{cervical: boolean, thoracic: boolean, lumbar: boolean, sacral: boolean, femoral: boolean}} open
 *  @property {{then: 'exit'|'back'}|null} exitPrompt
 *  @property {string} comment                                       the free-text comment as typed (annotation round 2, spec §3)
 *  @property {string} savedComment                                  the comment as last saved or read from disk
 *  @property {{processingError: string|null, processingErrorAt: string|null}} entryFailure   the study's failure at entry
 * (2026-10-11, gate feedback G3; plan D15) No window: the window / level belongs to the view, `state.filmWindow`
 * (the FilmWindow typedef in renderer/film-window.js), and outlives entering and leaving edit mode.
 */
/** A placement in progress (gate feedback G2, 2026-10-11): one shape for every kind.
 * @typedef {Object} Placing
 *  @property {string} code
 *  @property {(Pt|null)[]} points     one slot per step (placementSteps(code).need), null until that point is set
 *  @property {number} current         the slot the next film click sets (a femoral head: its first empty slot)
 *  @property {number[]} history       the set slots, in the order they were last set, each at most once (UNDO's order)
 */

import { fitCircle } from '../viewer/geometry.js';
import { SEGMENTAL_PAIRS } from './segmental.js';
// Disc heights (disc-heights.js DISC_LEVEL_PAIRS) read the same five lumbar pairs as the segmental angles,
// so they add no dependency entries of their own; test/levels.test.js pins that equality.

const EN_DASH = '\u2013';
const EM_DASH = '\u2014';
const MID_DOT = '\u00B7';
const ELLIPSIS = '\u2026';

// ---------- codes, groups, names ----------

export const LEVEL_CODES = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T4', 'L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'FH1', 'FH2'];

export const LEVEL_GROUPS = [
  { key: 'cervical', title: 'Cervical', range: `C2${EN_DASH}C7`, codes: ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'] },
  { key: 'thoracic', title: 'Thoracic', range: `T1 ${MID_DOT} T4`, codes: ['T1', 'T4'] },
  { key: 'lumbar', title: 'Lumbar', range: `L1${EN_DASH}L5`, codes: ['L1', 'L2', 'L3', 'L4', 'L5'] },
  { key: 'sacral', title: 'Sacral', range: 'S1 ENDPLATE', codes: ['S1'] },
  { key: 'femoral', title: 'Femoral heads', range: `2${EN_DASH}4 RIM POINTS`, codes: ['FH1', 'FH2'] },
];

const GROUPS = new Map(LEVEL_GROUPS.map(group => [group.key, group]));
const GROUP_OF = new Map(LEVEL_GROUPS.flatMap(group => group.codes.map(code => [code, group.key])));
const REGIONS = ['lumbar', 'cervical', 'full_spine'];

const KINDS = new Map(LEVEL_CODES.map(code => [code,
  code === 'C2' ? 'c2'
    : code === 'T4' ? 'centroid'
      : code === 'T1' || code === 'S1' ? 'endplate'
        : code.startsWith('FH') ? 'circle' : 'body']));

/** @returns {'c2'|'body'|'endplate'|'centroid'|'circle'} */
export function kindOf(code) { return KINDS.get(code); }

export function groupOf(code) { return GROUP_OF.get(code); }

// (2026-10-21, partial endplates, spec §3) The parts of each kind and the placement steps that set them. A part is
// whole or null: a body's superior pair and inferior pair, C2's inferior pair and centroid.
const PART_STEPS = new Map([
  ['body', [['superior', [0, 1]], ['inferior', [2, 3]]]],
  ['c2', [['inferior', [0, 1]], ['centroid', [2]]]],
  ['endplate', [['superior', [0, 1]]]],
  ['centroid', [['centroid', [0]]]],
  ['circle', []],
]);
// (2026-10-22, round 2, spec §12 N9) The bodies that carry an optional centroid part as a third part: C7 only. It stays
// kind 'body'; the sites that enumerate a body's parts, steps, handles or keys consult the code.
export const CENTROID_BODIES = ['C7'];

/** (2026-10-22, round 2, N9) Whether a level carries an optional centroid part beside its endplates (C7). */
export function hasCentroid(code) { return CENTROID_BODIES.includes(code); }

// The part table of a level: its kind's, with the centroid appended for a centroid body.
const partTable = code => {
  const parts = PART_STEPS.get(kindOf(code));
  return parts && hasCentroid(code) ? [...parts, ['centroid', [parts.reduce((n, [, steps]) => n + steps.length, 0)]]] : parts;
};
const HANDLE_PARTS = { SA: 'superior', SP: 'superior', IA: 'inferior', IP: 'inferior', CENTROID: 'centroid' };

/**
 * (2026-10-21, partial endplates, spec §3) The parts of a kind, in placement order, with the steps that place each.
 * A fresh array each call.
 * @returns {{key: string, steps: number[]}[]}
 */
export function partsOf(code) {
  return (partTable(code) ?? []).map(([key, steps]) => ({ key, steps: [...steps] }));
}

/** (2026-10-21, spec §3) The part a handle belongs to, or null for a rim handle or a handle the kind lacks (C2 has no SA). */
export function partOfHandle(code, handle) {
  const key = HANDLE_PARTS[handle];
  return key && partsOf(code).some(part => part.key === key) ? key : null;
}

/** (2026-10-21, spec §3) The keys of the parts a placed level lacks; [] for a whole level, a circle and null geometry. */
export function missingParts(code, geometry) {
  if (!geometry) return [];
  return partsOf(code).filter(part => geometry[part.key] == null).map(part => part.key);
}

/** (2026-10-21, spec §3) Whether a placed level lacks a part. */
export function isPartial(code, geometry) { return missingParts(code, geometry).length > 0; }

/**
 * (2026-10-22, the final review, M4) Whether Place... resumes a level rather than starting it afresh: a visible,
 * placed, partial body or C2. The panel's Place... and the wiring's startPlace share it.
 */
export function canResume(code, entry) {
  return Boolean(entry?.visible && entry.geometry) && ['body', 'c2'].includes(kindOf(code)) && isPartial(code, entry.geometry);
}

// The first handle of each part, by kind.
const PART_HANDLE = new Map([['body', { superior: 'SA', inferior: 'IA', centroid: 'CENTROID' }], ['c2', { inferior: 'IA', centroid: 'CENTROID' }],
  ['endplate', { superior: 'SA' }], ['centroid', { centroid: 'CENTROID' }]]);

/**
 * (2026-10-21, spec §3) The handle a selected level focuses: the first handle of its first part that exists (R0 for a
 * head). Defined here, not read from viewer/level-handles.js, because that file imports this one; a test pins that
 * the two agree.
 * @returns {string|null}
 */
export function firstHandle(code, geometry) {
  const kind = kindOf(code);
  if (kind === 'circle') return 'R0';
  const part = geometry ? partsOf(code).find(({ key }) => geometry[key] != null) : null;
  return part ? PART_HANDLE.get(kind)[part.key] : null;
}

const ROW_NAMES = new Map([['T1', 'T1 endplate'], ['T4', 'T4 centroid'], ['FH1', 'Head 1'], ['FH2', 'Head 2']]);
const FULL_NAMES = new Map([['T1', 'T1 superior endplate'], ['T4', 'T4 centroid'],
  ['FH1', 'femoral head 1'], ['FH2', 'femoral head 2']]);

/** The panel row's name. */
export function rowName(code) { return ROW_NAMES.get(code) ?? code; }

/** The name used inside sentences ("T1 superior endplate", "femoral head 1"). */
export function fullName(code) { return FULL_NAMES.get(code) ?? code; }

// "a", "a and b", "a, b and c" (no Oxford comma).
function joinList(items) {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------- film-type defaults ----------

function codesOf(...groupKeys) { return groupKeys.flatMap(key => GROUPS.get(key).codes); }

/**
 * The levels that start visible for a film type (D5, D6): lumbar -> lumbar, sacral and femoral groups;
 * cervical -> the cervical group and T1 only; full spine, Auto, null and anything else -> all sixteen.
 * @returns {Set<string>}
 */
export function filmTypeDefaults(region) {
  if (region === 'lumbar') return new Set(codesOf('lumbar', 'sacral', 'femoral'));
  if (region === 'cervical') return new Set([...codesOf('cervical'), 'T1']);
  return new Set(LEVEL_CODES);
}

// ---------- comparing geometry, deriving state ----------

// A circle compares by centre and radius: the rim points are how it was fitted, not what it is.
function comparable(geometry) {
  return geometry && typeof geometry === 'object' && 'radius' in geometry
    ? { center: geometry.center, radius: geometry.radius } : geometry;
}

function near(a, b, eps) {
  if (typeof a === 'number' || typeof b === 'number') {
    return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => near(v, b[i], eps));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key => near(a[key], b[key], eps));
  }
  return a === b;
}

// How far apart two values may be and still be the same, in pixels (a radius too): levelState's test, and
// changedPoints's, so the two never disagree (ruling R38).
const SAME_EPS = 1e-6;

/** Same level geometry within `eps` pixels; two nulls are the same. */
export function sameGeometry(a, b, eps = SAME_EPS) {
  if (a == null || b == null) return a == null && b == null;
  return near(comparable(a), comparable(b), eps);
}

/** @returns {'not_visible'|'not_placed'|'manual'|'segmented'|'edited'} */
export function levelState(entry, modelGeometry) {
  if (!entry.visible) return 'not_visible';
  if (!entry.geometry) return 'not_placed';
  if (!modelGeometry) return 'manual';
  return sameGeometry(entry.geometry, modelGeometry) ? 'segmented' : 'edited';
}

// (Gate feedback G5, plan D18) Each kind's points under the keys the label record writes them with, in record order,
// and where each one is in the editor's geometry. These are every value sameGeometry compares for the kind's shape
// (a circle's rim is not one: `comparable`), which is what keeps changedPoints and levelState in agreement (R38).
const POINTS = {
  body: [['sa', g => g.superior?.[0]], ['sp', g => g.superior?.[1]], ['ia', g => g.inferior?.[0]], ['ip', g => g.inferior?.[1]]],
  c2: [['ia', g => g.inferior?.[0]], ['ip', g => g.inferior?.[1]], ['centroid', g => g.centroid]],
  endplate: [['sa', g => g.superior?.[0]], ['sp', g => g.superior?.[1]]],
  centroid: [['centroid', g => g.centroid]],
  circle: [['center', g => g.center], ['radius', g => g.radius]],
};

const pointsOf = code => {
  const points = POINTS[kindOf(code)] ?? [];
  return hasCentroid(code) ? [...points, ['centroid', g => g.centroid]] : points;   // (2026-10-22, N9) C7's fifth key
};

/**
 * The label record's geometry keys for a level, in record order (D18): a body 'sa', 'sp', 'ia', 'ip'; C2 'ia', 'ip',
 * 'centroid'; T1 and S1 'sa', 'sp'; T4 'centroid'; a femoral head 'center', 'radius'. A fresh array each call.
 */
export function pointKeys(code) {
  return pointsOf(code).map(([key]) => key);
}

/**
 * The points of `geometry` that differ from `modelGeometry`, as record keys in pointKeys order (D18): each point (a
 * head's radius, a number) is compared by the test levelState uses, within the same eps, so for the geometry the
 * editor holds `levelState(...) === 'edited'` exactly when this is not empty (R38). A head compares its centre, then
 * its radius, never its rim: a rim-only change lists nothing. No model geometry: every key the geometry holds (a manual level). No
 * geometry: nothing. Pure; a fresh array each call.
 * @returns {string[]}
 */
export function changedPoints(code, geometry, modelGeometry) {
  if (geometry == null) return [];
  const points = pointsOf(code);
  // (2026-10-21, partial endplates) a manual level lists the points it holds: a part that is null lists nothing.
  if (modelGeometry == null) return points.filter(([, at]) => at(geometry) != null).map(([key]) => key);
  return points.filter(([, at]) => !near(at(geometry), at(modelGeometry), SAME_EPS)).map(([key]) => key);
}

const BADGES = new Map([
  ['segmented', { className: 'badge badge-seg', label: 'Segmented' }],
  ['edited', { className: 'badge badge-ok', label: 'Edited' }],
  ['manual', { className: 'badge badge-ok', label: 'Manual' }],
  ['not_placed', { className: 'badge badge-rev', label: 'Not placed' }],
  ['not_visible', { className: 'badge badge-proc', label: 'Not visible' }],
]);
const PLACING_BADGE = { className: 'badge badge-rev', label: `Placing${ELLIPSIS}` };

/** Badge for a state; `placing === true` overrides every state. */
export function badgeFor(state, placing) {
  const badge = placing === true ? PLACING_BADGE : BADGES.get(state);
  return badge && { ...badge };
}

// ---------- placement steps ----------

const step = (label, help, colorKey) => ({ label, help, colorKey });

function stepsFor(code) {
  switch (kindOf(code)) {
    case 'body': return [
      step('SA', 'Click the superior-anterior corner (SA).', 'SA'),
      step('SP', 'Click the superior-posterior corner (SP).', 'SP'),
      step('IA', 'Click the inferior-anterior corner (IA).', 'IA'),
      step('IP', 'Click the inferior-posterior corner (IP).', 'IP'),
      // (2026-10-22, round 2, N9) C7's optional fifth step.
      ...(hasCentroid(code) ? [step('CENTROID', `Click the centroid of the ${code} body.`, 'level')] : []),
    ];
    case 'c2': return [
      step('IA', 'Click the inferior-anterior corner of C2 (IA).', 'IA'),
      step('IP', 'Click the inferior-posterior corner of C2 (IP).', 'IP'),
      step('CENTROID', 'Click the centroid of the C2 body.', 'level'),
    ];
    case 'endplate': return [
      step('ANT', `Click the anterior corner of the ${code} superior endplate.`, 'SA'),
      step('POST', `Click the posterior corner of the ${code} superior endplate.`, 'SP'),
    ];
    case 'centroid': return [step('CENTROID', `Click the centroid of ${code}.`, 'level')];
    case 'circle': return [
      step('P1', 'Click a point on the rim of the femoral head.', 'trace'),
      step('P2', 'Click a second rim point. Two points are read as the ends of a diameter.', 'trace'),
      step('P3', 'Fit now, or click up to 2 more rim points for a better fit.', 'trace'),
      step('P4', 'Fit now, or click one more rim point.', 'trace'),
    ];
    default: return [];
  }
}

/**
 * What a placement needs: `need` clicks finish it; `fitFrom` is the fewest clicks a femoral head may be fitted from
 * (2 rim points; every other kind carries `need`). A body or C2 may also finish early, with one whole part (2 clicks
 * for a body, 1 for C2: canFinishPlacing), which `fitFrom` does not describe.
 * @returns {{need: number, fitFrom: number, steps: {label: string, help: string, colorKey: string}[]}}
 */
export function placementSteps(code) {
  const steps = stepsFor(code);
  return { need: steps.length, fitFrom: kindOf(code) === 'circle' ? 2 : steps.length, steps };
}

// ---------- circles ----------

const copyPoint = p => [p[0], p[1]];
const copyPair = pair => [copyPoint(pair[0]), copyPoint(pair[1])];
const round1 = v => Math.round(v * 10) / 10;

function diameter(a, b, rim) {
  return {
    center: [round1((a[0] + b[0]) / 2), round1((a[1] + b[1]) / 2)],
    radius: round1(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2),
    rim,
  };
}

function farthestPair(points) {
  let best = [points[0], points[1]];
  let far = -1;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
      if (d > far) { far = d; best = [points[i], points[j]]; }
    }
  }
  return best;
}

/**
 * Fit a femoral head to 2-4 rim points. Two points are the ends of a diameter (a tiny radius is
 * accepted, handoff §11); three or more are fitted with `fitCircle`, falling back to the farthest pair
 * as a diameter when the fit is degenerate, non-finite or wider than `maxRadius`. Centre and radius are
 * rounded to 0.1 px; `rim` is a copy of the points as given. Fewer than two points: null.
 * @returns {CircleGeometry|null}
 */
export function fitRim(points, maxRadius = Infinity) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const rim = points.map(copyPoint);
  if (rim.length === 2) return diameter(rim[0], rim[1], rim);
  const fit = fitCircle(rim);
  if (fit && fit.every(Number.isFinite) && fit[2] <= maxRadius) {
    return { center: [round1(fit[0]), round1(fit[1])], radius: round1(fit[2]), rim };
  }
  const [a, b] = farthestPair(rim);
  return diameter(a, b, rim);
}

/** Four rim points at -45, 45, 135 and 225 degrees on a circle (x right, y down), for a model circle with no rim yet. */
export function synthesizeRim(circle) {
  const [cx, cy] = circle.center;
  return [-45, 45, 135, 225].map(degrees => {
    const t = (degrees * Math.PI) / 180;
    return [cx + circle.radius * Math.cos(t), cy + circle.radius * Math.sin(t)];
  });
}

/**
 * The geometry a finished placement stores. `imageSize` ({width, height}) bounds a femoral fit: a radius
 * beyond the image diagonal is a bad fit (the prototype's fixed 1000 px made image-relative).
 * @returns {LevelGeometry|null}
 */
export function geometryFromPoints(code, points, imageSize) {
  const kind = kindOf(code);
  if (kind === 'circle') {
    return fitRim(points.filter(Boolean).map(copyPoint), imageSize ? Math.hypot(imageSize.width, imageSize.height) : Infinity);
  }
  const parts = partTable(code);
  if (!parts) return null;
  // (2026-10-21, partial endplates, spec §3) `points` is the slot array with nulls. Per part: every slot set -> written,
  // every slot empty -> null, else (half a part) no geometry. A body or C2 may hold one part; an endplate or a centroid
  // has one part and needs it whole. The canonical shape carries every key of the kind, the missing ones null.
  const geometry = {};
  for (const [key, steps] of parts) {
    const slots = steps.map(step => points[step] ?? null);
    if (slots.every(slot => slot === null)) geometry[key] = null;
    else if (slots.some(slot => slot === null)) return null;
    else geometry[key] = steps.length === 1 ? copyPoint(slots[0]) : slots.map(copyPoint);
  }
  return Object.values(geometry).some(value => value !== null) ? geometry : null;
}

// ---------- reading the study geometry ----------

const isPoint = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isPair = pair => Array.isArray(pair) && pair.length === 2 && isPoint(pair[0]) && isPoint(pair[1]);

// (2026-10-21, partial endplates, spec §3) One stored part: a copy when it is well formed, null when absent, and
// undefined (reject the level) when it is present but malformed, such as half a pair.
const partFrom = (value, valid, copy) => (value == null ? null : valid(value) ? copy(value) : undefined);

// A body or C2 keeps whichever of its parts are whole; with no part at all it is no geometry. The shape is canonical:
// every key present, a missing part null.
function partialFrom(parts) {
  const values = Object.values(parts);
  return values.some(value => value === undefined) || values.every(value => value === null) ? null : parts;
}

function bodyFrom(vertebra, withCentroid = false) {
  return partialFrom({
    superior: partFrom(vertebra?.superior, isPair, copyPair),
    inferior: partFrom(vertebra?.inferior, isPair, copyPair),
    // (2026-10-22, round 2, N10) A centroid body's canonical shape carries the key; the study's c7_centroid is never
    // read back as the part (it is the projection's derived mean), so it is null here.
    ...(withCentroid ? { centroid: null } : {}),
  });
}

function circleFrom(circle) {
  return Array.isArray(circle) && circle.length >= 3 && circle.slice(0, 3).every(Number.isFinite)
    ? { center: [circle[0], circle[1]], radius: circle[2], rim: null } : null;
}

function levelFromGeometry(code, geometry) {
  switch (code) {
    case 'C2': {
      return partialFrom({
        inferior: partFrom(geometry.vertebrae?.C2?.inferior, isPair, copyPair),
        centroid: partFrom(geometry.c2_centroid, isPoint, copyPoint),
      });
    }
    case 'S1': return isPair(geometry.s1_superior) ? { superior: copyPair(geometry.s1_superior) } : null;
    case 'FH1': return circleFrom(geometry.femoral_circles?.[0]);
    case 'FH2': return circleFrom(geometry.femoral_circles?.[1]);
    default: return kindOf(code) === 'body' ? bodyFrom(geometry.vertebrae?.[code], hasCentroid(code)) : null;   // T1, T4: never in a study
  }
}

/**
 * The level model's view of a study's geometry: one entry per code, null where the geometry carries
 * nothing usable. T1 and T4 are always null (no study geometry holds them). A fresh object each call.
 * @returns {Object<string, LevelGeometry|null>}
 */
export function levelsFromGeometry(geometry) {
  return Object.fromEntries(LEVEL_CODES.map(code => [code, geometry ? levelFromGeometry(code, geometry) : null]));
}

// ---------- opening the editor ----------

const copyEntry = ({ visible, source, geometry }) => ({ visible, source, geometry });

function snapshot(levels) {
  return Object.fromEntries(LEVEL_CODES.map(code => [code, copyEntry(levels[code])]));
}

const HEADS = ['FH1', 'FH2'];

// `study.geometry.femoral_circles` is a compact array of [x, y, r]: a film whose Head 1 is hidden and Head 2 placed
// stores one circle at slot 0, which levelsFromGeometry reads as FH1 (R9), and no circle there carries a rim. With a
// saved record each study circle is matched to the head whose recorded circle it equals (centre and radius), and
// that head takes the RECORD's geometry (copied, rim included), so the annotator's rim clicks survive a reopen.
// Circles that match nothing fill the heads still free in order FH1, FH2, preferring a head the record does not
// mark not visible (a hidden head is used only when no other is free). Without a record the slots stand as read:
// slot 0 is Head 1, slot 1 is Head 2.
function copyCircle(geometry) {
  return {
    center: copyPoint(geometry.center),
    radius: geometry.radius,
    rim: Array.isArray(geometry.rim) ? geometry.rim.map(copyPoint) : null,
  };
}

function assignHeads(fromStudy, saved) {
  if (!saved) return fromStudy;
  const slots = { FH1: null, FH2: null };
  const unmatched = [];
  for (const circle of HEADS.map(code => fromStudy[code]).filter(Boolean)) {
    const code = HEADS.find(head => !slots[head] && saved.levels?.[head]?.geometry
      && sameGeometry(circle, saved.levels[head].geometry));
    if (code) slots[code] = copyCircle(saved.levels[code].geometry); else unmatched.push(circle);
  }
  for (const circle of unmatched) {
    const free = HEADS.filter(head => !slots[head]);
    const code = free.find(head => saved.levels?.[head]?.visible !== false) ?? free[0];
    if (code) slots[code] = circle;
  }
  return { ...fromStudy, ...slots };
}

// (2026-10-22, round 2, spec §12 N10) The study gives a centroid body its corners and never its centroid (a derived mean
// is not a placed point), so the record's centroid is merged in when the study holds the body; a body the study lacks
// comes whole from the record in openEditor, as before.
function mergeCentroids(fromStudy, saved) {
  const merged = { ...fromStudy };
  for (const code of CENTROID_BODIES) {
    const centroid = saved?.levels?.[code]?.geometry?.centroid;
    if (merged[code] && Array.isArray(centroid) && centroid.length === 2 && centroid.every(Number.isFinite)) {
      merged[code] = { ...merged[code], centroid: [...centroid] };
    }
  }
  return merged;
}

/**
 * Start editing a study. `study` is read for `geometry`, `labelFile`, `labelComment`, the failure it carries
 * (`processingError`, `processingErrorAt`) and (optionally) `id`.
 * `modelGeometry` is the prediction's study-shaped geometry (or null). `saved` is the label record on
 * disk converted to `{ file, levels }` (levels keyed by code with `{visible, source, geometry}`), or null;
 * with it, the study's femoral circles are matched to the heads by value, not by slot, and a match takes the
 * record's geometry, rim included (assignHeads).
 * @returns {LevelEditor}
 */
export function openEditor({ study, region, modelGeometry, saved }) {
  const fromStudy = mergeCentroids(assignHeads(levelsFromGeometry(study?.geometry), saved), saved);
  const model = levelsFromGeometry(modelGeometry);
  const defaults = filmTypeDefaults(region);
  const levels = {};
  for (const code of LEVEL_CODES) {
    const record = saved?.levels?.[code];
    const geometry = fromStudy[code] ?? record?.geometry ?? null;
    levels[code] = {
      visible: record?.visible ?? (defaults.has(code) || geometry != null),
      source: record?.source ?? (model[code] ? 'model' : 'film_type'),
      geometry,
    };
  }
  // A saved record that lacks a code (an older one) falls back to that level's opening state.
  const baseline = saved
    ? Object.fromEntries(LEVEL_CODES.map(code => [code, saved.levels?.[code] ?? levels[code]]))
    : snapshot(levels);
  // (annotation editor round 2, spec §3.3) The record on disk is the source of the comment; the study's
  // `labelComment` is only its display copy, read when no record was handed in. A saved object without a
  // `comment` key (one that predates it) reads empty. Nothing is trimmed or capped here.
  const comment = saved
    ? (typeof saved.comment === 'string' ? saved.comment : '')
    : (typeof study?.labelComment === 'string' ? study.labelComment : '');
  return {
    studyId: study?.id ?? null,
    region: REGIONS.includes(region) ? region : 'auto',
    levels,
    model,
    baseline,
    record: { file: saved?.file ?? study?.labelFile ?? null, exists: Boolean(saved) },
    selected: null,
    handle: null,
    aiming: false,
    placing: null,
    open: Object.fromEntries(LEVEL_GROUPS.map(group => [group.key, group.codes.some(code => levels[code].visible)])),
    exitPrompt: null,
    comment,
    savedComment: comment,
    // (The final review of round 2, I1) The failure the film carried at entry. The first hand-placed commit clears the
    // study's failure (spec §4.3); emptying the film of every level again puts this one back, since nothing about the
    // film's runs changed. Every step spreads the editor, so it rides along; markSaved and revertToBaseline leave it.
    entryFailure: {
      processingError: study?.processingError ?? null,
      processingErrorAt: study?.processingErrorAt ?? null,
    },
  };
}

// ---------- visibility and panel state ----------

function setEntry(editor, code, patch) {
  return { ...editor, levels: { ...editor.levels, [code]: { ...editor.levels[code], ...patch } } };
}

/** Flip one level. Geometry is kept while hidden; hiding the level being placed cancels the placement. */
export function toggleVisible(editor, code) {
  const visible = !editor.levels[code].visible;
  const next = setEntry(editor, code, { visible, source: 'annotator' });
  return !visible && editor.placing?.code === code ? { ...next, placing: null } : next;
}

/** All visible -> all hidden; anything else -> all visible. A placement whose level is hidden is cancelled. */
export function toggleGroup(editor, groupKey) {
  const group = GROUPS.get(groupKey);
  if (!group) return editor;
  const visible = !group.codes.every(code => editor.levels[code].visible);
  const levels = { ...editor.levels };
  for (const code of group.codes) levels[code] = { ...levels[code], visible, source: 'annotator' };
  const placing = !visible && editor.placing && group.codes.includes(editor.placing.code) ? null : editor.placing;
  return { ...editor, levels, placing };
}

export function toggleOpen(editor, groupKey) {
  return { ...editor, open: { ...editor.open, [groupKey]: !editor.open[groupKey] } };
}

/** 'all' | 'none' | 'mixed': the group checkbox's state. */
export function groupCheckState(editor, groupKey) {
  const group = GROUPS.get(groupKey);
  const visible = group ? group.codes.filter(code => editor.levels[code].visible).length : 0;
  if (visible === 0) return 'none';
  return visible === group.codes.length ? 'all' : 'mixed';
}

// ---------- selecting and placing ----------

/** Select a row. Another level's placement is cancelled; a visible level with geometry focuses its first handle. */
export function selectLevel(editor, code) {
  const placing = editor.placing && editor.placing.code !== code ? null : editor.placing;
  const entry = editor.levels[code];
  const handle = !placing && entry?.visible && entry.geometry ? { code, handle: firstHandle(code, entry.geometry) } : null;
  return { ...editor, selected: code, placing, handle, aiming: false };
}

/**
 * (2026-10-21) A chip of the selected placed level, clicked: the point is focused and ARMED, so the next film click
 * places it there (the wiring's placeAimedPoint, through viewer/level-handles.js moveHandle). The level must be
 * visible and placed; a placement in progress keeps its own chips, so nothing is armed under one. Armed at that
 * point already: the editor unchanged. Any other focus, a row selection or a placement disarms.
 */
export function aimHandle(editor, code, handle) {
  const entry = editor.levels[code];
  if (editor.placing || !entry?.visible || !entry.geometry) return editor;
  // (2026-10-21, partial endplates, spec §4) A point the level lacks (a null part, or a handle the kind has none of) is not armed.
  if (kindOf(code) !== 'circle' && entry.geometry[partOfHandle(code, handle)] == null) return editor;
  if (editor.aiming && editor.handle?.code === code && editor.handle.handle === handle) return editor;
  return { ...editor, selected: code, handle: { code, handle }, aiming: true };
}

/** Disarm, keeping the focus on the point (Escape, the chip clicked again, the click that placed it). */
export function cancelAim(editor) {
  return editor.aiming ? { ...editor, aiming: false } : editor;
}

/** Begin a placement: every slot empty, the first step current, nothing to undo. */
export function startPlacing(editor, code) {
  const { need } = placementSteps(code);
  return { ...editor, placing: { code, points: Array(need).fill(null), current: 0, history: [] }, selected: code, handle: null, aiming: false };
}

/**
 * (2026-10-21, partial endplates, spec §3) Resume a visible, partially placed body or C2: a placement with its set
 * slots pre-filled and nothing to undo. `step` names the empty slot that is current; any other value (a set slot, none)
 * leaves the first empty one current. Refused (the editor unchanged) while a placement runs, for a hidden, unplaced,
 * whole or other-kind level.
 */
export function resumePlacing(editor, code, step = null) {
  const entry = editor.levels[code];
  const kind = kindOf(code);
  if (editor.placing || !entry?.visible || !entry.geometry || (kind !== 'body' && kind !== 'c2')) return editor;
  if (!isPartial(code, entry.geometry)) return editor;
  const points = Array(placementSteps(code).need).fill(null);
  for (const { key, steps } of partsOf(code)) {
    const value = entry.geometry[key];
    if (value == null) continue;
    steps.forEach((slot, index) => { points[slot] = copyPoint(steps.length === 1 ? value : value[index]); });
  }
  const current = Number.isInteger(step) && points[step] === null ? step : points.indexOf(null);
  return { ...editor, placing: { code, points, current, history: [] }, selected: code, handle: null, aiming: false };
}

const clampPoint = (point, size) => (size
  ? [Math.max(0, Math.min(size.width - 1, point[0])), Math.max(0, Math.min(size.height - 1, point[1]))]
  : copyPoint(point));

const within1px = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1;

const placedPoints = placing => placing.points.filter(Boolean);

// For every kind but a centroid body: the first empty slot after `from`, wrapping to the start; `from` itself when no
// slot is empty.
// (2026-10-22, round 2, spec §12 N9) A centroid body's optional centroid slot (its last) is never current by default:
// the next empty CORNER slot after `from` is (wrapping among the corners; a centroid click starts at the first corner),
// and only with every corner set does an empty centroid slot become current. setPlacingStep(4) still chooses it.
function nextEmpty(points, from, code) {
  if (hasCentroid(code)) {
    const corners = points.length - 1;
    for (let step = 1; step <= corners; step += 1) {
      const index = from >= corners ? step - 1 : (from + step) % corners;
      if (points[index] === null) return index;
    }
    return points[corners] === null ? corners : from;
  }
  for (let step = 1; step < points.length; step += 1) {
    const index = (from + step) % points.length;
    if (points[index] === null) return index;
  }
  return from;
}

/**
 * Add a click to the placement (gate feedback G2). The slot is `current` for a body, C2, an endplate or a centroid
 * (the step chip the annotator chose, else the next empty one) and the first empty slot for a femoral head (rim points
 * stay unordered); a head with no empty slot left takes no click. The click is clamped to [0, w-1] x [0, h-1] and
 * dropped when it lands within 1 px of ANY OTHER point of this placement (ruling R26, which generalises the earlier
 * previous-point rule and keeps R22's rule for a head: a zero-length endplate is a 422 from /measure, and two identical
 * rim points give a radius of 0); a slot's own earlier point is no other point, so a re-placed point may land beside
 * it. A double-click therefore counts once: the second click lands on the point the first one set. The slot moves to
 * the end of `history` (a re-placed point counts once, R27) and `current` moves to the next empty slot after it,
 * wrapping. With no slot left empty the placement finishes by itself.
 */
export function addPoint(editor, point, imageSize) {
  const placing = editor.placing;
  if (!placing) return editor;
  const slot = kindOf(placing.code) === 'circle' ? placing.points.indexOf(null) : placing.current;
  if (!(slot >= 0 && slot < placing.points.length)) return editor;
  const clicked = clampPoint(point, imageSize);
  if (placing.points.some((other, index) => index !== slot && other && within1px(clicked, other))) return editor;
  const points = placing.points.map((existing, index) => (index === slot ? clicked : existing));
  const history = [...placing.history.filter(index => index !== slot), slot];
  const next = { ...editor, placing: { code: placing.code, points, current: nextEmpty(points, slot, placing.code), history } };
  // (2026-10-22, round 2, N9) A centroid body finishes by itself at its endplates: its centroid slot may stay empty.
  const required = hasCentroid(placing.code) ? points.slice(0, points.length - 1) : points;
  return required.includes(null) ? next : finishPlacing(next, imageSize);
}

/** UNDO: the most recently set point is cleared and its step becomes the current one; a no-op with nothing set. */
export function undoPoint(editor) {
  const placing = editor.placing;
  if (!placing || placing.history.length === 0) return editor;
  const slot = placing.history[placing.history.length - 1];
  return {
    ...editor,
    placing: {
      code: placing.code,
      points: placing.points.map((existing, index) => (index === slot ? null : existing)),
      current: slot,
      history: placing.history.slice(0, -1),
    },
  };
}

/**
 * A step chip (gate feedback G2): the step the next film click sets, for a body, C2, an endplate or a centroid.
 * A placed step may be chosen, and the click then re-places it. A femoral head (its rim points are unordered), no
 * placement, an index that names no step, or the step already current: the editor unchanged.
 */
export function setPlacingStep(editor, index) {
  const placing = editor.placing;
  if (!placing || kindOf(placing.code) === 'circle') return editor;
  if (!Number.isInteger(index) || index < 0 || index >= placing.points.length || index === placing.current) return editor;
  return { ...editor, placing: { ...placing, current: index } };
}

export function cancelPlacing(editor) {
  return editor.placing ? { ...editor, placing: null } : editor;
}

// The smallest femoral head a placement may finish with (ruling R22) or a rim-point drag may leave (R25, in
// viewer/level-handles.js moveHandle): the label record's schema needs a radius above 0, and two rim points 1 px
// apart, the closest addPoint keeps, give 0.5.
export const MIN_RADIUS = 0.5;

// The geometry the placement would finish with now, or null when it may not finish: too few points set, an endplate or
// centroid with any step still empty, a body or C2 with no part whole or one half set, or a femoral head whose fitted radius is under MIN_RADIUS (or not
// finite). A head fits its placed rim points in slot order; every other kind passes its points in step order.
function finishedGeometry(placing, imageSize) {
  if (kindOf(placing.code) === 'circle' && placedPoints(placing).length < placementSteps(placing.code).fitFrom) return null;
  // (2026-10-21, partial endplates, spec §3) A body or C2 may finish once a part is whole and none is half set; the
  // other kinds only at every slot. geometryFromPoints returns null exactly when the placement may not finish.
  const geometry = geometryFromPoints(placing.code, placing.points, imageSize);
  if (!geometry) return null;
  if (kindOf(placing.code) === 'circle' && !(Number.isFinite(geometry.radius) && geometry.radius >= MIN_RADIUS)) return null;
  return geometry;
}

/**
 * Whether the placement in progress may finish now: FIT's enabled state. False when nothing is being placed,
 * below the minimum (a head's `fitFrom`; a body or C2 with no whole part), and for a femoral head whose fit would have a radius under 0.5 px (R22).
 */
export function canFinishPlacing(editor, imageSize) {
  return Boolean(editor?.placing && finishedGeometry(editor.placing, imageSize));
}

/**
 * Finish the placement now (FIT for a femoral head from 2 points; a body or C2 with one whole part; any other kind only at `need`). A no-op
 * whenever canFinishPlacing is false.
 */
export function finishPlacing(editor, imageSize) {
  const placing = editor.placing;
  if (!placing) return editor;
  const geometry = finishedGeometry(placing, imageSize);
  if (!geometry) return editor;
  return {
    ...setEntry(editor, placing.code, { visible: true, source: 'annotator', geometry }),
    placing: null,
    selected: placing.code,
  };
}

/**
 * (2026-10-21, partial endplates, spec §3) Null the part of a placed body or C2 that the focused handle belongs to.
 * Refused (the editor unchanged) for a hidden or unplaced level, while it is being placed, for a handle with no part,
 * a part already null, or the last part standing. The focus moves to the first handle that remains.
 */
export function removePart(editor, code, handle) {
  const entry = editor.levels[code];
  if (!entry?.visible || !entry.geometry || editor.placing?.code === code) return editor;
  const key = partOfHandle(code, handle);
  if (!key || entry.geometry[key] == null) return editor;
  const keys = partsOf(code).map(part => part.key);
  if (!keys.some(other => other !== key && entry.geometry[other] != null)) return editor;
  const geometry = Object.fromEntries(keys.map(other => [other, other === key ? null : copyGeometry(entry.geometry[other] ?? null)]));
  return {
    ...setEntry(editor, code, { geometry, source: 'annotator' }),
    handle: { code, handle: firstHandle(code, geometry) },
    aiming: false,
  };
}

/** Remove the geometry of a manual level (one the model never found); a no-op for every other state. */
export function clearLevel(editor, code) {
  const entry = editor.levels[code];
  if (!entry || levelState(entry, editor.model[code]) !== 'manual') return editor;
  const next = setEntry(editor, code, { geometry: null, source: 'annotator' });
  return editor.handle?.code === code ? { ...next, handle: null } : next;
}

// A copy of a level's geometry with every point array new, so nothing is shared with the source.
const copyGeometry = value => (Array.isArray(value) ? value.map(copyGeometry)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyGeometry(inner)])) : value);

/**
 * REVERT (annotation editor round 2, spec §5.1): a no-op unless `levelState(entry, editor.model[code]) === 'edited'`
 * and no placement is running for `code`. Otherwise the entry's `geometry` becomes a copy of `editor.model[code]`
 * (point arrays copied; a femoral head takes the model circle's `center` and `radius` with `rim: null`) and its
 * `source` becomes `model` (E7). `visible` and the selection stay; the focused handle stays when the model's geometry
 * has that point, and otherwise (the focus was on a point the annotator added to a partial model level) moves to the
 * level's first handle with `aiming` false (2026-10-22, the final review, M1); nothing else on the editor changes.
 * The level then reads Segmented, by the same sameGeometry test that made it Edited. A no-op returns the editor itself.
 */
export function revertLevel(editor, code) {
  const entry = editor.levels[code];
  const model = editor.model[code];
  if (!entry || !model || editor.placing?.code === code || levelState(entry, model) !== 'edited') return editor;
  const geometry = kindOf(code) === 'circle'
    ? { center: copyPoint(model.center), radius: model.radius, rim: null }
    : copyGeometry(model);
  const next = setEntry(editor, code, { geometry, source: 'model' });
  // (2026-10-22, the final review, M1) A focus on a point the model's geometry lacks moves to the level's first handle.
  const part = editor.handle?.code === code ? partOfHandle(code, editor.handle.handle) : null;
  return part && geometry[part] == null
    ? { ...next, handle: { code, handle: firstHandle(code, geometry) }, aiming: false }
    : next;
}

export function setLevelGeometry(editor, code, geometry) {
  return setEntry(editor, code, { geometry, source: 'annotator' });
}

// ---------- unsaved changes, save and revert ----------

/** Replace the comment text, as typed. Nothing else on the editor changes (spec §3.3). */
export function setComment(editor, text) {
  return { ...editor, comment: String(text ?? '') };
}

/** True when the comment differs from the saved one, ignoring leading and trailing whitespace (the record trims it). */
export function commentChanged(editor) {
  return String(editor.comment ?? '').trim() !== String(editor.savedComment ?? '').trim();
}

/**
 * Levels whose (visible, geometry) pair differs from the baseline, plus one while the comment differs from the
 * saved one (annotation round 2, spec §3.3); a source change alone does not count.
 */
export function unsavedCount(editor) {
  const levels = LEVEL_CODES.filter(code => {
    const entry = editor.levels[code];
    const base = editor.baseline?.[code];
    return entry.visible !== base?.visible || !sameGeometry(entry.geometry, base?.geometry);
  }).length;
  return levels + (commentChanged(editor) ? 1 : 0);
}

/** Save is allowed with changes, or once with none when the study has no record yet (D10). */
export function canSave(editor) {
  return unsavedCount(editor) > 0 || !editor.record.exists;
}

export function unsavedText(n) {
  if (n <= 0) return 'NOTHING TO SAVE';
  return n === 1 ? '1 UNSAVED CHANGE' : `${n} UNSAVED CHANGES`;
}

/**
 * After a successful save: the levels become the baseline and the record exists. `file` defaults to the current one.
 * The comment becomes its trimmed text, as the record holds it, and that text is the saved one. The wiring's caller
 * (`saveLevelEdits`) takes `savedComment` only (plan ruling P3): the live `comment` stays as typed, so text typed during
 * the write stays unsaved and a trailing space survives in the box until the next save.
 */
export function markSaved(editor, file) {
  const comment = String(editor.comment ?? '').trim();
  return {
    ...editor,
    baseline: snapshot(editor.levels),
    record: { file: file ?? editor.record.file ?? null, exists: true },
    comment,
    savedComment: comment,
  };
}

/** Discard: every level back to the baseline and the comment to the saved text, any placement and focused handle dropped. */
export function revertToBaseline(editor) {
  return { ...editor, levels: snapshot(editor.baseline), comment: editor.savedComment, placing: null, handle: null };
}

// ---------- counts and training status ----------

function countLevels(codes, levels) {
  const counts = { placed: 0, toPlace: 0, notVisible: 0 };
  for (const code of codes) {
    const { visible, geometry } = levels[code];
    if (!visible) counts.notVisible += 1;
    else if (geometry) counts.placed += 1;
    else counts.toPlace += 1;
  }
  return counts;
}

const clause = (n, text) => (n > 0 ? `${n} ${text}` : null);
const joinClauses = parts => parts.filter(Boolean).join(` ${MID_DOT} `);

/** '7 PLACED · 1 TO PLACE · 8 NOT VISIBLE': PLACED is always written, the other clauses only when non-zero. */
export function summaryText(editor) {
  const { placed, toPlace, notVisible } = countLevels(LEVEL_CODES, editor.levels);
  return joinClauses([`${placed} PLACED`, clause(toPlace, 'TO PLACE'), clause(notVisible, 'NOT VISIBLE')]);
}

/** One group's header count, every zero clause omitted (as the prototype does); '' when nothing is left to say. */
export function groupCountText(editor, groupKey) {
  const group = GROUPS.get(groupKey);
  if (!group) return '';
  const { placed, toPlace, notVisible } = countLevels(group.codes, editor.levels);
  return joinClauses([clause(placed, 'PLACED'), clause(toPlace, 'TO PLACE'), clause(notVisible, 'NOT VISIBLE')]);
}

/** The training-label footer: complete when no visible level lacks geometry. */
export function trainingStatus(editor) {
  const missing = LEVEL_CODES
    .filter(code => editor.levels[code].visible && !editor.levels[code].geometry)
    .map(fullName);
  if (missing.length === 0) {
    return { complete: true, label: `TRAINING LABEL ${MID_DOT} COMPLETE`, text: 'Every level is placed or marked not visible.', missing };
  }
  const list = joinList(missing);
  const sentence = missing.length === 1
    ? `is visible but not placed ${EM_DASH} place it or uncheck it.`
    : `are visible but not placed ${EM_DASH} place them or uncheck them.`;
  return {
    complete: false,
    label: `TRAINING LABEL ${MID_DOT} INCOMPLETE`,
    text: `${list.charAt(0).toUpperCase()}${list.slice(1)} ${sentence}`,
    missing,
  };
}

// ---------- the edit bar while placing ----------

/**
 * 'PLACING L3 · 2 OF 4' (the current step: the point the next click sets) or, for a head,
 * 'PLACING FEMORAL HEAD 1 · 2 OF 4 RIM POINTS' (points placed).
 */
export function placingLabel(editor) {
  const placing = editor.placing;
  if (!placing) return null;
  const { need } = placementSteps(placing.code);
  const name = fullName(placing.code).toUpperCase();
  return kindOf(placing.code) === 'circle'
    ? `PLACING ${name} ${MID_DOT} ${placedPoints(placing).length} OF ${need} RIM POINTS`
    : `PLACING ${name} ${MID_DOT} ${placing.current + 1} OF ${need}`;
}

/** The help for the next click (the current step's; a head's next rim point's), or null when not placing. */
export function placingHelp(editor) {
  const placing = editor.placing;
  if (!placing) return null;
  const { need, steps } = placementSteps(placing.code);
  const index = kindOf(placing.code) === 'circle' ? Math.min(placedPoints(placing).length, need - 1) : placing.current;
  return steps[index]?.help ?? null;
}

// ---------- which levels each measurement reads ----------

const LUMBAR_REGIONS = ['lumbar', 'full_spine'];
const CERVICAL_REGIONS = ['cervical', 'full_spine'];
const input = (key, label, regions, codes) => ({ key, label, regions: [...regions], codes: [...codes] });
const pairInput = regions => ([upper, lower]) => input(`${upper}-${lower}`, `${upper}${EN_DASH}${lower}`, regions, [upper, lower]);

/**
 * The measurements, in the Measurements panel's order, with the levels each one reads and the film types
 * that report it. A level that is not visible leaves these measurements as an em dash (dependencyNote).
 */
export const MEASUREMENT_INPUTS = [
  input('LL', 'LL', LUMBAR_REGIONS, ['L1', 'S1']),
  input('PI', 'PI', LUMBAR_REGIONS, ['S1', 'FH1', 'FH2']),
  input('PT', 'PT', LUMBAR_REGIONS, ['S1', 'FH1', 'FH2']),
  input('SS', 'SS', LUMBAR_REGIONS, ['S1']),
  input('PILL', `PI${EN_DASH}LL`, LUMBAR_REGIONS, ['L1', 'S1', 'FH1', 'FH2']),
  input('L1PA', 'L1PA', LUMBAR_REGIONS, ['L1', 'S1', 'FH1', 'FH2']),
  ...SEGMENTAL_PAIRS.cervical.map(pairInput(CERVICAL_REGIONS)),
  ...SEGMENTAL_PAIRS.lumbar.map(pairInput(LUMBAR_REGIONS)),
  input('C2C7_COBB', `C2${EN_DASH}C7 Cobb`, CERVICAL_REGIONS, ['C2', 'C7']),
  input('C2C7_SVA', `C2${EN_DASH}C7 SVA`, CERVICAL_REGIONS, ['C2', 'C7']),
  input('GLOBAL_SVA', `C7${EN_DASH}S1 SVA`, ['full_spine'], ['C7', 'S1']),
];

/**
 * 'LL, PI–LL, L1PA and L1–L2 will show —' for the measurements a film of this type loses when `code` is not
 * visible; null when none. An Auto (or absent) region counts as every region. Names measurements only:
 * the dash is what they will render, never a value.
 */
export function dependencyNote(code, region) {
  const anyRegion = !REGIONS.includes(region);
  const labels = MEASUREMENT_INPUTS
    .filter(m => m.codes.includes(code) && (anyRegion || m.regions.includes(region)))
    .map(m => m.label);
  return labels.length ? `${joinList(labels)} will show ${EM_DASH}` : null;
}
