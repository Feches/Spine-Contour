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
/** @typedef {{superior: [Pt, Pt], inferior: [Pt, Pt]}} BodyGeometry   superior = [SA, SP], inferior = [IA, IP] */
/** @typedef {{inferior: [Pt, Pt], centroid: Pt}} C2Geometry */
/** @typedef {{superior: [Pt, Pt]}} EndplateGeometry   T1 and S1 */
/** @typedef {{centroid: Pt}} CentroidGeometry   T4 */
/** @typedef {{center: Pt, radius: number, rim: Pt[]|null}} CircleGeometry   rim: 2-4 points, null for unedited model output */
/** @typedef {BodyGeometry|C2Geometry|EndplateGeometry|CentroidGeometry|CircleGeometry} LevelGeometry */
/** @typedef {{visible: boolean, source: 'model'|'annotator'|'film_type', geometry: LevelGeometry|null}} LevelEntry */

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

/** Same level geometry within `eps` pixels; two nulls are the same. */
export function sameGeometry(a, b, eps = 1e-6) {
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
 * What a placement needs: `need` clicks finish it; `fitFrom` is the fewest clicks that may be finished
 * early (a femoral head fits from 2 rim points; every other kind only at `need`).
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
  const p = points.map(copyPoint);
  switch (kindOf(code)) {
    case 'body': return { superior: [p[0], p[1]], inferior: [p[2], p[3]] };
    case 'c2': return { inferior: [p[0], p[1]], centroid: p[2] };
    case 'endplate': return { superior: [p[0], p[1]] };
    case 'centroid': return { centroid: p[0] };
    case 'circle': return fitRim(p, imageSize ? Math.hypot(imageSize.width, imageSize.height) : Infinity);
    default: return null;
  }
}

// ---------- reading the study geometry ----------

const isPoint = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isPair = pair => Array.isArray(pair) && pair.length === 2 && isPoint(pair[0]) && isPoint(pair[1]);

function bodyFrom(vertebra) {
  return isPair(vertebra?.superior) && isPair(vertebra?.inferior)
    ? { superior: copyPair(vertebra.superior), inferior: copyPair(vertebra.inferior) } : null;
}

function circleFrom(circle) {
  return Array.isArray(circle) && circle.length >= 3 && circle.slice(0, 3).every(Number.isFinite)
    ? { center: [circle[0], circle[1]], radius: circle[2], rim: null } : null;
}

function levelFromGeometry(code, geometry) {
  switch (code) {
    case 'C2': {
      const inferior = geometry.vertebrae?.C2?.inferior;
      const centroid = geometry.c2_centroid;
      return isPair(inferior) && isPoint(centroid)
        ? { inferior: copyPair(inferior), centroid: copyPoint(centroid) } : null;
    }
    case 'S1': return isPair(geometry.s1_superior) ? { superior: copyPair(geometry.s1_superior) } : null;
    case 'FH1': return circleFrom(geometry.femoral_circles?.[0]);
    case 'FH2': return circleFrom(geometry.femoral_circles?.[1]);
    default: return kindOf(code) === 'body' ? bodyFrom(geometry.vertebrae?.[code]) : null;   // T1, T4: never in a study
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

/**
 * Start editing a study. `study` is read for `geometry`, `labelFile` and (optionally) `id`.
 * `modelGeometry` is the prediction's study-shaped geometry (or null). `saved` is the label record on
 * disk converted to `{ file, levels }` (levels keyed by code with `{visible, source, geometry}`), or null.
 * @returns {Object} LevelEditor (see the plan's Shared shapes)
 */
export function openEditor({ study, region, modelGeometry, saved }) {
  const fromStudy = levelsFromGeometry(study?.geometry);
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
  return {
    studyId: study?.id ?? null,
    region: REGIONS.includes(region) ? region : 'auto',
    levels,
    model,
    baseline,
    record: { file: saved?.file ?? study?.labelFile ?? null, exists: Boolean(saved) },
    selected: null,
    handle: null,
    placing: null,
    open: Object.fromEntries(LEVEL_GROUPS.map(group => [group.key, group.codes.some(code => levels[code].visible)])),
    window: null,
    exitPrompt: null,
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

const FIRST_HANDLE = new Map([['body', 'SA'], ['c2', 'IA'], ['endplate', 'SA'], ['centroid', 'CENTROID'], ['circle', 'R0']]);

/** Select a row. Another level's placement is cancelled; a visible level with geometry focuses its first handle. */
export function selectLevel(editor, code) {
  const placing = editor.placing && editor.placing.code !== code ? null : editor.placing;
  const entry = editor.levels[code];
  const handle = !placing && entry?.visible && entry.geometry ? { code, handle: FIRST_HANDLE.get(kindOf(code)) } : null;
  return { ...editor, selected: code, placing, handle };
}

export function startPlacing(editor, code) {
  return { ...editor, placing: { code, points: [] }, selected: code, handle: null };
}

const clampPoint = (point, size) => (size
  ? [Math.max(0, Math.min(size.width - 1, point[0])), Math.max(0, Math.min(size.height - 1, point[1]))]
  : copyPoint(point));

/**
 * Add a click to the placement: clamped to [0, w-1] x [0, h-1]; a click within 1 px of the previous
 * point is dropped for c2, body and endplate placements (a zero-length endplate is a 422 from /measure);
 * the placement finishes by itself at `need` points.
 */
export function addPoint(editor, point, imageSize) {
  const placing = editor.placing;
  if (!placing) return editor;
  const { need } = placementSteps(placing.code);
  if (placing.points.length >= need) return editor;
  const clicked = clampPoint(point, imageSize);
  const last = placing.points[placing.points.length - 1];
  if (last && kindOf(placing.code) !== 'circle' && Math.hypot(clicked[0] - last[0], clicked[1] - last[1]) < 1) return editor;
  const next = { ...editor, placing: { code: placing.code, points: [...placing.points, clicked] } };
  return next.placing.points.length >= need ? finishPlacing(next, imageSize) : next;
}

export function undoPoint(editor) {
  if (!editor.placing || editor.placing.points.length === 0) return editor;
  return { ...editor, placing: { code: editor.placing.code, points: editor.placing.points.slice(0, -1) } };
}

export function cancelPlacing(editor) {
  return editor.placing ? { ...editor, placing: null } : editor;
}

/** Finish the placement now (FIT for a femoral head from 2 points; any other kind only at `need`). */
export function finishPlacing(editor, imageSize) {
  const placing = editor.placing;
  if (!placing) return editor;
  const { fitFrom } = placementSteps(placing.code);
  if (placing.points.length < fitFrom) return editor;
  const geometry = geometryFromPoints(placing.code, placing.points, imageSize);
  if (!geometry) return editor;
  return {
    ...setEntry(editor, placing.code, { visible: true, source: 'annotator', geometry }),
    placing: null,
    selected: placing.code,
  };
}

/** Remove the geometry of a manual level (one the model never found); a no-op for every other state. */
export function clearLevel(editor, code) {
  const entry = editor.levels[code];
  if (!entry || levelState(entry, editor.model[code]) !== 'manual') return editor;
  const next = setEntry(editor, code, { geometry: null, source: 'annotator' });
  return editor.handle?.code === code ? { ...next, handle: null } : next;
}

export function setLevelGeometry(editor, code, geometry) {
  return setEntry(editor, code, { geometry, source: 'annotator' });
}

// ---------- unsaved changes, save and revert ----------

/** Levels whose (visible, geometry) pair differs from the baseline; a source change alone does not count. */
export function unsavedCount(editor) {
  return LEVEL_CODES.filter(code => {
    const entry = editor.levels[code];
    const base = editor.baseline?.[code];
    return entry.visible !== base?.visible || !sameGeometry(entry.geometry, base?.geometry);
  }).length;
}

/** Save is allowed with changes, or once with none when the study has no record yet (D10). */
export function canSave(editor) {
  return unsavedCount(editor) > 0 || !editor.record.exists;
}

export function unsavedText(n) {
  if (n <= 0) return 'NOTHING TO SAVE';
  return n === 1 ? '1 UNSAVED CHANGE' : `${n} UNSAVED CHANGES`;
}

/** After a successful save: the levels become the baseline and the record exists. `file` defaults to the current one. */
export function markSaved(editor, file) {
  return {
    ...editor,
    baseline: snapshot(editor.levels),
    record: { file: file ?? editor.record.file ?? null, exists: true },
  };
}

/** Discard: every level back to the baseline, any placement and focused handle dropped. */
export function revertToBaseline(editor) {
  return { ...editor, levels: snapshot(editor.baseline), placing: null, handle: null };
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

/** 'PLACING L3 · 2 OF 4' (the point being asked for) or, for a head, 'PLACING FEMORAL HEAD 1 · 2 OF 4 RIM POINTS' (points placed). */
export function placingLabel(editor) {
  const placing = editor.placing;
  if (!placing) return null;
  const { need } = placementSteps(placing.code);
  const name = fullName(placing.code).toUpperCase();
  const placed = placing.points.length;
  return kindOf(placing.code) === 'circle'
    ? `PLACING ${name} ${MID_DOT} ${placed} OF ${need} RIM POINTS`
    : `PLACING ${name} ${MID_DOT} ${Math.min(placed + 1, need)} OF ${need}`;
}

/** The help for the next click, or null when not placing. */
export function placingHelp(editor) {
  const placing = editor.placing;
  if (!placing) return null;
  const { need, steps } = placementSteps(placing.code);
  return steps[Math.min(placing.points.length, need - 1)]?.help ?? null;
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
