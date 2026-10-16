// The level editor's way into and out of `study.geometry` (plan 2026-10-10 Task 2).
//
// `levels.js` owns the level model (sixteen items, each { visible, source, geometry }); the app's measure
// queue, the persistence validator and studies.json all speak `study.geometry`. `projectGeometry` writes the
// levels a film's region measures into that shape; `levelsFromGeometry` (levels.js) reads it back. T1 and T4
// are never projected: no measurement reads them, so they live in the level model and the label record only.
//
// Pure: no DOM, no store, no I/O. Nothing here mutates its arguments, and the result shares no point arrays
// with the editor, so a later in-place edit of a cloned geometry cannot reach the level model.

import { kindOf } from './levels.js';
import { CERVICAL_LEVELS, requestedRegion, studyRegion, validAnteriorSide } from './cervical.js';
import { isHandPlaced } from './predictions.js';

const LUMBAR_BODIES = ['L1', 'L2', 'L3', 'L4', 'L5'];
const FEMORAL_HEADS = ['FH1', 'FH2'];
const LUMBAR_LEVELS = [...LUMBAR_BODIES, 'S1', ...FEMORAL_HEADS];
// The order the anterior side is read in: C2 (its inferior endplate), then every body, then T1 and S1.
const SIDE_ORDER = [...CERVICAL_LEVELS, ...LUMBAR_BODIES, 'T1', 'S1'];

const copyPoint = p => [p[0], p[1]];
const copyPair = pair => [copyPoint(pair[0]), copyPoint(pair[1])];
const mean = points => [0, 1].map(axis => points.reduce((sum, p) => sum + p[axis], 0) / points.length);

/** `[SA, SP, IP, IA]`: the superior pair, then the inferior pair reversed (the order `setLandmarkAt` keeps). */
export function quadrilateral(body) {
  return [body.superior[0], body.superior[1], body.inferior[1], body.inferior[0]].map(copyPoint);
}

// The entry for a level that is visible and has geometry, else null.
function placed(editor, code) {
  const entry = editor?.levels?.[code];
  return entry?.visible && entry.geometry ? entry : null;
}

const anyPlaced = (editor, codes) => codes.some(code => placed(editor, code));

/**
 * (Ruling R20, the final review's I1) Whether the film's region is read from the levels placed on it rather than
 * from the study: an editor opened as Auto, or an Auto film no model run produced (`isHandPlaced`, data/predictions.js)
 * or whose result names no region. A level-editor commit writes `geometry.region`, so reading that back would lock
 * an Auto film to whatever its first commit said (L3 placed first: lumbar, and a C3 placed after it never commits).
 * The one rule behind `projectionRegion`, `projectsLevel` and the region the level editor opens with.
 */
export function regionFollowsLevels(editor, study) {
  if (editor?.region === 'auto') return true;
  if (requestedRegion(study) !== 'auto') return false;
  return isHandPlaced(study) || studyRegion(study) === 'auto';
}

/**
 * The region the projection takes: the study's own when it is fixed (chosen, or resolved by a model run); when it
 * follows the levels (regionFollowsLevels), what the visible placed levels say on every projection (a C level ->
 * cervical, an L, S1 or femoral level -> lumbar, both -> full spine, neither -> lumbar).
 * @returns {'lumbar'|'cervical'|'full_spine'}
 */
export function projectionRegion(editor, study) {
  if (!regionFollowsLevels(editor, study)) return studyRegion(study);
  const cervical = anyPlaced(editor, CERVICAL_LEVELS);
  const lumbar = anyPlaced(editor, LUMBAR_LEVELS);
  if (cervical && lumbar) return 'full_spine';
  return cervical ? 'cervical' : 'lumbar';
}

/**
 * Whether a change to `code` can change this study's projection, so the level editor commits it: T1 and T4 never
 * do; a film whose region follows its levels takes every other code (placing C3 can turn a lumbar projection into
 * a full spine); a lumbar film L1-L5, S1 and the heads; a cervical one C2-C7; a full-spine film all of those.
 */
export function projectsLevel(code, editor, study) {
  if (code === 'T1' || code === 'T4') return false;
  if (regionFollowsLevels(editor, study)) return true;
  const region = studyRegion(study);
  if (region === 'lumbar') return LUMBAR_LEVELS.includes(code);
  if (region === 'cervical') return CERVICAL_LEVELS.includes(code);
  return true;
}

/**
 * Which side of the image the anterior is on, read from the first visible placed level that gives one
 * (a level whose anterior and posterior corners share an x gives none): C2 by IA.x against IP.x, every
 * other level by SA.x against SP.x (the anterior corner sitting at the smaller x is `left`). Otherwise
 * `fallback`, when it is `left` or `right`, else null. A side is never invented. (This is the general helper:
 * it derives first. `projectGeometry` consults the film's stored side before calling it.)
 * @returns {'left'|'right'|null}
 */
export function anteriorSideFrom(editor, fallback) {
  for (const code of SIDE_ORDER) {
    const entry = placed(editor, code);
    if (!entry) continue;
    const [anterior, posterior] = kindOf(code) === 'c2' ? entry.geometry.inferior : entry.geometry.superior;
    if (anterior[0] !== posterior[0]) return anterior[0] < posterior[0] ? 'left' : 'right';
  }
  return validAnteriorSide(fallback) ? fallback : null;
}

// ---------- the pieces of each region ----------

function cervicalPart(editor) {
  const vertebrae = {};
  let c2Centroid = null;
  for (const code of CERVICAL_LEVELS) {
    const entry = placed(editor, code);
    if (!entry) continue;
    const { geometry } = entry;
    if (code === 'C2') {
      vertebrae.C2 = { superior: null, inferior: copyPair(geometry.inferior), quadrilateral: null };
      c2Centroid = copyPoint(geometry.centroid);
    } else {
      vertebrae[code] = { superior: copyPair(geometry.superior), inferior: copyPair(geometry.inferior), quadrilateral: quadrilateral(geometry) };
    }
  }
  const c7 = vertebrae.C7;
  return { vertebrae, c2_centroid: c2Centroid, c7_centroid: c7 ? mean(c7.quadrilateral) : null };
}

// A head the validator would reject (`r > 0`, finite) is left out rather than written: the persistence
// validator nulls the whole geometry of a film that holds one, which would discard every edit on reload.
const usableCircle = geometry => Array.isArray(geometry.center) && geometry.center.every(Number.isFinite)
  && Number.isFinite(geometry.radius) && geometry.radius > 0;

function lumbarPart(editor, base) {
  const vertebrae = {};
  for (const code of LUMBAR_BODIES) {
    const entry = placed(editor, code);
    if (!entry) continue;
    const { geometry } = entry;
    vertebrae[code] = {
      superior: copyPair(geometry.superior),
      inferior: copyPair(geometry.inferior),
      quadrilateral: quadrilateral(geometry),
      // the model's "this level's anterior is unconfirmed" flag holds only while the level is still the model's
      ...(base.vertebrae?.[code]?.anterior_confirmed === false && entry.source === 'model' ? { anterior_confirmed: false } : {}),
    };
  }
  const s1 = placed(editor, 'S1');
  const circles = FEMORAL_HEADS
    .map(code => placed(editor, code)?.geometry)
    .filter(geometry => geometry && usableCircle(geometry))
    .map(({ center, radius }) => [center[0], center[1], radius]);
  return {
    vertebrae,
    s1_superior: s1 ? copyPair(s1.geometry.superior) : null,
    femoral_circles: circles,
    // The backend recomputes both on /measure; the persistence validator needs them whenever L1 / two heads exist.
    l1_center: vertebrae.L1 ? mean(vertebrae.L1.quadrilateral) : null,
    hip_midpoint: circles.length === 2 ? mean(circles.map(circle => circle.slice(0, 2))) : null,
  };
}

/**
 * (The final review of round 2, I1) Whether a projection places nothing at all: `manually_cleared` (a lumbar film
 * with nothing left), or none of what a projection writes from the levels: no vertebra (C2-C7 and L1-L5), no S1
 * endplate, no femoral circle, no C2 or C7 centroid. True for every region's empty projection (lumbar, cervical and
 * full spine) and for null. Pure.
 * @param {object|null} geometry   a `projectGeometry` result
 */
export function projectionIsEmpty(geometry) {
  if (!geometry) return true;
  if (geometry.manually_cleared === true) return true;
  const hasVertebra = Boolean(geometry.vertebrae) && Object.keys(geometry.vertebrae).length > 0;
  const hasCircle = Array.isArray(geometry.femoral_circles) && geometry.femoral_circles.length > 0;
  return !hasVertebra && geometry.s1_superior == null && !hasCircle
    && geometry.c2_centroid == null && geometry.c7_centroid == null;
}

/**
 * The editor's levels as the `study.geometry` of the film's region, for `/measure` and the record; null only
 * when there is no editor. Only visible, placed levels are written. `study.geometry` supplies everything the
 * level model does not own (`image_width`, `image_height`, `source_sha256`, `coordinate_space`, ...); the keys
 * of a region the projection leaves out (C centroids on a lumbar film, the lumbar and sacral content on a
 * cervical one) are cleared, and `manually_cleared` is set exactly when a lumbar film has nothing left.
 * `anterior_side` of a cervical or full-spine film is, in order: the stored geometry's side, the study's chosen
 * side (each only when `left` or `right`), else what the placed levels show (`anteriorSideFrom`). A stored side is
 * never overridden by the landmarks, so dragging a corner cannot flip the sign of SVA. It is null when none of
 * the three says: a side is never guessed.
 */
export function projectGeometry(editor, study) {
  if (!editor) return null;
  const base = study?.geometry ?? {};
  const region = projectionRegion(editor, study);
  const { c2_centroid: _c2, c7_centroid: _c7, manually_cleared: _cleared, ...kept } = base;
  if (region === 'lumbar') {
    const lumbar = lumbarPart(editor, base);
    const empty = Object.keys(lumbar.vertebrae).length === 0 && lumbar.s1_superior === null && lumbar.femoral_circles.length === 0;
    return { ...kept, region, ...lumbar, ...(empty ? { manually_cleared: true } : {}) };
  }
  const { vertebrae: cervicalBodies, c2_centroid, c7_centroid } = cervicalPart(editor);
  // The film's stored or chosen side is authoritative (the backend signs SVA by it and never checks it against
  // the landmarks): the geometry's, then the study's. Only a film with neither is oriented from the placed levels.
  const anterior_side = [base.anterior_side, study?.anteriorSide].find(validAnteriorSide) ?? anteriorSideFrom(editor, null);
  if (region === 'cervical') {
    return {
      ...kept, region, anterior_side, c2_centroid, vertebrae: cervicalBodies,
      s1_superior: null, femoral_circles: [], hip_midpoint: null, l1_center: null,
    };
  }
  const lumbar = lumbarPart(editor, base);
  return {
    ...kept, region, anterior_side, c2_centroid, c7_centroid,
    ...lumbar, vertebrae: { ...cervicalBodies, ...lumbar.vertebrae },
  };
}
