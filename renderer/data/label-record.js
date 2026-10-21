// The label record: one JSON file per film, written on Save edits, that carries the annotator's work as
// training data (handoff §9; plan 2026-10-10 Task 5; schema docs/design/level-editor/label-record.schema.json).
//
// `toLabelRecord` writes the level model (levels.js) as a record; `recordLevels` reads a record back into
// `{ visible, source, geometry }` per code, in exactly the geometry shapes the editor holds, so
// `openEditor({ saved })` and the baseline comparison (`sameGeometry` tells a missing key from null) see
// identical shapes. Pure: no DOM, no store, no I/O, and nothing shares point arrays with its input.
//
// Points are [x, y] in pixels of the stored image, origin top-left.

import { LEVEL_CODES, kindOf, levelState, trainingStatus, changedPoints } from './levels.js';
import { projectionRegion } from './level-projection.js';
import { fileStem, safeStem } from './labels.js';
import { VERSION_LABEL } from './version.js';

export const LABEL_SCHEMA = 'spinecontour.segmentation-label/1';

const HEADS = ['FH1', 'FH2'];
const PLACED_STATES = ['segmented', 'edited', 'manual'];
const STATES = [...PLACED_STATES, 'not_placed', 'not_visible'];
const SOURCES = ['model', 'annotator', 'film_type'];

// ---------- small helpers ----------

/** 'Standing lateral' -> 'standing_lateral'; an empty or missing view -> 'unknown'. */
export function viewSlug(view) {
  const slug = String(view ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  return slug === '' ? 'unknown' : slug;
}

/** 'v1.0.17' -> '1.0.17'. */
export function appVersion(label = VERSION_LABEL) {
  return String(label).trim().replace(/^v/i, '');
}

/**
 * '<stem>.label.json', or '<stem>-2.label.json', '-3', ... when `taken` (an iterable of file names) already
 * holds it. The stem is made safe first (safeStem, R12). Names compare ignoring case: Windows and macOS file
 * names do.
 */
export function labelFileName(stem, taken) {
  const safe = safeStem(stem);
  const used = new Set([...taken].map(name => String(name).toLowerCase()));
  let name = `${safe}.label.json`;
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${safe}-${n}.label.json`;
  return name;
}

const copyPoint = p => [p[0], p[1]];
const isPoint = p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

// ---------- editor -> record ----------

// The editor's geometry as the record's `corners`, per kind.
// (2026-10-21, partial endplates, spec §8, N4) A body may hold one endplate and C2 its centroid alone, so a corner
// the geometry does not hold is written null, by pair.
const pointOrNull = p => (isPoint(p) ? copyPoint(p) : null);
const bodyCorners = g => ({
  sa: pointOrNull(g.superior?.[0]), sp: pointOrNull(g.superior?.[1]),
  ia: pointOrNull(g.inferior?.[0]), ip: pointOrNull(g.inferior?.[1]),
});
const c2Corners = g => ({ ia: pointOrNull(g.inferior?.[0]), ip: pointOrNull(g.inferior?.[1]) });
const endplateCorners = g => ({ sa: copyPoint(g.superior[0]), sp: copyPoint(g.superior[1]) });

// The record's `contour` is a polygon of at least three points, or null.
const contourOf = polygon => (Array.isArray(polygon) && polygon.length >= 3 ? polygon.map(copyPoint) : null);

// (Gate feedback G5, plan D18) The points the annotator gave the entry, as keys of its own geometry: an edited
// entry's moved points (changedPoints, the test levelState uses, so `edited` always lists one and nothing else does:
// R38), every key of a manual one, and none for segmented, not placed and not visible (a hidden level keeps its
// geometry in the editor, but the record holds none of it).
function editedPoints(code, state, entry, model) {
  return state === 'edited' || state === 'manual' ? changedPoints(code, entry.geometry, model) : [];
}

// The model's own geometry is written only for an edited level; for every other placed state it is null.
function levelRecord(code, entry, model, contours) {
  const state = levelState(entry, model);
  const head = { state, source: entry.source, edited_points: editedPoints(code, state, entry, model) };
  if (!PLACED_STATES.includes(state)) return head;
  const g = entry.geometry;
  const edited = state === 'edited';
  switch (kindOf(code)) {
    case 'body':
      // The contour is the model's mask outline, so it is written only while the level still is the model's (R10).
      return {
        ...head, corners: bodyCorners(g), model_corners: edited ? bodyCorners(model) : null,
        contour: state === 'segmented' ? contourOf(contours?.[code]) : null,
      };
    case 'c2':
      return {
        ...head, corners: c2Corners(g), centroid: pointOrNull(g.centroid),
        model_corners: edited ? c2Corners(model) : null, model_centroid: edited ? pointOrNull(model.centroid) : null,
      };
    case 'endplate':
      return { ...head, corners: endplateCorners(g), model_corners: edited ? endplateCorners(model) : null };
    case 'centroid':
      return { ...head, centroid: copyPoint(g.centroid), model_centroid: edited ? copyPoint(model.centroid) : null };
    default:
      return head;
  }
}

function headRecord(id, code, entry, model) {
  const state = levelState(entry, model);
  const head = { id, state, source: entry.source, edited_points: editedPoints(code, state, entry, model) };
  if (!PLACED_STATES.includes(state)) return head;
  const g = entry.geometry;
  return {
    ...head,
    center: copyPoint(g.center),
    radius: g.radius,
    rim: Array.isArray(g.rim) ? g.rim.map(copyPoint) : null,
    model_circle: state === 'edited' ? { center: copyPoint(model.center), radius: model.radius } : null,
  };
}

// (D18) The edits summary: how many entries, the fourteen levels and the two heads together, are in each state, and
// how many points the edited ones moved and the manual ones placed. Read from the entries, so it always agrees with them.
function editsSummary(entries) {
  const edits = Object.fromEntries(STATES.map(state => [state, 0]));
  let moved = 0;
  let placed = 0;
  for (const entry of entries) {
    edits[entry.state] += 1;
    if (entry.state === 'edited') moved += entry.edited_points.length;
    if (entry.state === 'manual') placed += entry.edited_points.length;
  }
  return { ...edits, points_moved: moved, points_placed: placed };
}

/**
 * (annotation editor round 2, spec §3.1) The comment as the record writes it: the text trimmed, or null when it is
 * blank or not a string. The cap on its length belongs to the text box; nothing here truncates.
 * @returns {string|null}
 */
export function normalizeComment(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The comment a record holds, trimmed, or '' when it has none: the key absent (a record saved before comments),
 * null, or anything that is not a string. Never throws, whatever it is given.
 * @returns {string}
 */
export function recordComment(record) {
  const comment = record?.comment;
  return typeof comment === 'string' ? comment.trim() : '';
}

/**
 * The label record for one film, ready for JSON.stringify. `image` is `{ file, sha256, width, height }`, `model`
 * is `{ name, version }`, `savedAt` an ISO-8601 string and `contours` maps a level code to the model's mask
 * outline (`Pt[]`, or null); only a `segmented` body level takes its contour, an edited or manual one writes null
 * (R10). `study` supplies the file name (the stem is written, never the film's renamed
 * name or its SP id), the view, and the region when the editor's is Auto. Not-visible and not-placed levels
 * carry only `state`, `source` and an empty `edited_points`; a level's geometry is written only while it is visible
 * and placed. (D18) Every level and head lists `edited_points`, and `edits`, after `complete`, sums them.
 * (Round 2, spec §3.1) `comment`, after `edits`, is the editor's comment trimmed, or null when it is blank.
 */
export function toLabelRecord({ editor, study, image, model, appVersion: version = appVersion(), savedAt, contours = {} }) {
  const levels = {};
  for (const code of LEVEL_CODES) {
    if (kindOf(code) !== 'circle') levels[code] = levelRecord(code, editor.levels[code], editor.model[code], contours);
  }
  const femoralHeads = HEADS.map((code, index) => headRecord(index + 1, code, editor.levels[code], editor.model[code]));
  return {
    schema: LABEL_SCHEMA,
    study: fileStem(study?.fileName ?? ''),
    image: { file: image.file, sha256: image.sha256, width_px: image.width, height_px: image.height },
    film: {
      region: editor.region === 'auto' ? projectionRegion(editor, study) : editor.region,
      view: viewSlug(study?.view),
    },
    model: { name: model.name, version: model.version },
    app_version: version,
    saved_at: savedAt,
    complete: trainingStatus(editor).complete,
    edits: editsSummary([...Object.values(levels), ...femoralHeads]),
    comment: normalizeComment(editor.comment),
    levels,
    femoral_heads: femoralHeads,
  };
}

// ---------- record -> editor ----------

const pointPair = (a, b) => (isPoint(a) && isPoint(b) ? [copyPoint(a), copyPoint(b)] : null);

// (2026-10-21, partial endplates, spec §8, N4) A pair read from two corner keys: null when both are absent (a
// missing endplate), BAD when only one is a point or either is malformed (a half pair: the whole entry is unusable).
const BAD = Symbol('bad');
const pairOrNull = (a, b) => (a == null && b == null ? null : (pointPair(a, b) ?? BAD));

function geometryOf(code, raw) {
  switch (kindOf(code)) {
    case 'body': {
      const superior = pairOrNull(raw.corners?.sa, raw.corners?.sp);
      const inferior = pairOrNull(raw.corners?.ia, raw.corners?.ip);
      if (superior === BAD || inferior === BAD || (!superior && !inferior)) return null;
      return { superior, inferior };
    }
    case 'c2': {
      const inferior = pairOrNull(raw.corners?.ia, raw.corners?.ip);
      const centroid = isPoint(raw.centroid) ? copyPoint(raw.centroid) : (raw.centroid == null ? null : BAD);
      if (inferior === BAD || centroid === BAD || (!inferior && !centroid)) return null;
      return { inferior, centroid };
    }
    case 'endplate': {
      const superior = pointPair(raw.corners?.sa, raw.corners?.sp);
      return superior ? { superior } : null;
    }
    case 'centroid':
      return isPoint(raw.centroid) ? { centroid: copyPoint(raw.centroid) } : null;
    case 'circle': {
      if (!isPoint(raw.center) || !Number.isFinite(raw.radius) || !(raw.radius > 0)) return null;
      const rim = Array.isArray(raw.rim) && raw.rim.length >= 2 && raw.rim.length <= 4 && raw.rim.every(isPoint)
        ? raw.rim.map(copyPoint) : null;
      return { center: copyPoint(raw.center), radius: raw.radius, rim };
    }
    default:
      return null;
  }
}

/**
 * A label record as `{ code: { visible, source, geometry } }`, in LEVEL_CODES order, with the two femoral heads
 * as FH1 and FH2. `visible` is "state is not not_visible"; `geometry` is read only for a placed state, in the
 * editor's own shapes (`rim` null, not absent, when the record has none), and is null when the record does not
 * hold a usable one. A code the record does not describe (absent, or an unknown state or source) is left out, so
 * `openEditor` falls back to that level's opening state; nothing is invented.
 */
export function recordLevels(record) {
  const levels = {};
  for (const code of LEVEL_CODES) {
    const raw = kindOf(code) === 'circle'
      ? (Array.isArray(record?.femoral_heads) ? record.femoral_heads.find(head => head?.id === HEADS.indexOf(code) + 1) : null)
      : record?.levels?.[code];
    if (!raw || !STATES.includes(raw.state) || !SOURCES.includes(raw.source)) continue;
    levels[code] = {
      visible: raw.state !== 'not_visible',
      source: raw.source,
      geometry: PLACED_STATES.includes(raw.state) ? geometryOf(code, raw) : null,
    };
  }
  return levels;
}
