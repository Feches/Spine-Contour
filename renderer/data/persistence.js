/**
 * Study store logic: ids, shape validation, demo/real merge, and the
 * save-on-change coalescer (spec 13, 13.1; architecture contract
 * "renderer/data/persistence.js"). Pure — no fs, no Electron, no DOM —
 * safe to load in the browser via <script type="module"> and under
 * node --test alike. Disk I/O (atomic write, corrupt-store recovery)
 * lives in the root-level store-io.js, which only main.js imports.
 *
 * Accepted limitation: createStudySaver has no flush-at-quit. A change
 * committed and the window closed inside the same write cycle (two
 * sub-millisecond writes) loses the trailing write.
 */

import { DEMO_STUDIES } from './demo-studies.js';
import { FILM_DATE } from './timepoints.js';
import { normalizeCalibration } from './calibration.js';

export const STORE_VERSION = 1;

/**
 * @param {object[]} studies real + demo, merged or not
 * @returns {string} 'SP-1000' or higher, scanning real studies only
 */
export function nextId(studies) {
  let max = 999; // so the first id is SP-1000
  for (const study of studies || []) {
    if (!study || study.source !== 'real') continue;
    const match = /^SP-(\d+)$/.exec(study.id || '');
    if (!match) continue;
    const n = Number(match[1]);
    if (n > max) max = n;
  }
  const next = Math.max(max + 1, 1000);
  return `SP-${String(next).padStart(4, '0')}`;
}

/**
 * @param {object[]} realStudies
 * @returns {object[]} real studies first, then all nine demo studies
 */
export function merge(realStudies, { hideDemos = false } = {}) {
  return [...(realStudies || []), ...(hideDemos ? [] : DEMO_STUDIES)];
}

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

// A non-empty string as given, else null: the rule for every optional text field on the record.
function optionalText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function point(p) {
  return Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]);
}

function points(list, n) {
  return Array.isArray(list) && list.length === n && list.every(point);
}

function isValidMeasurements(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const nullable = value => value === null || finite(value);
  if (![m.PI, m.PT, m.SS].every(nullable)) return false;
  if (!m.LL || typeof m.LL !== 'object' || Array.isArray(m.LL) || !nullable(m.LL['L1-S1'])) return false;
  if (m.L1PA != null && !finite(m.L1PA)) return false;
  for (const level of ['L2-S1', 'L3-S1', 'L4-S1', 'L5-S1']) {
    if (m.LL[level] != null && !finite(m.LL[level])) return false;
  }
  return true;
}

function isValidGeometry(g) {
  if (!g || typeof g !== 'object') return false;
  if (!g.vertebrae || typeof g.vertebrae !== 'object' || Array.isArray(g.vertebrae)) return false;
  for (const [level, v] of Object.entries(g.vertebrae)) {
    if (!['L1', 'L2', 'L3', 'L4', 'L5'].includes(level)) return false;
    if (!v || typeof v !== 'object') return false;
    if (!points(v.superior, 2)) return false;
    if (!points(v.inferior, 2)) return false;
    if (!points(v.quadrilateral, 4)) return false;
    if (v.anterior_confirmed != null && typeof v.anterior_confirmed !== 'boolean') return false;
  }
  if (g.s1_superior !== null && !points(g.s1_superior, 2)) return false;
  if (g.vertebrae.L1 ? !point(g.l1_center) : g.l1_center !== null) return false;
  if (!Array.isArray(g.femoral_circles) || ![0, 1, 2].includes(g.femoral_circles.length)) return false;
  if (g.femoral_circles.length === 2 ? !point(g.hip_midpoint) : g.hip_midpoint !== null) return false;
  for (const circle of g.femoral_circles) {
    if (!Array.isArray(circle) || circle.length !== 3) return false;
    const [cx, cy, r] = circle;
    if (!finite(cx) || !finite(cy) || !finite(r) || !(r > 0)) return false;
  }
  return Object.keys(g.vertebrae).length > 0 || g.s1_superior !== null || g.femoral_circles.length > 0 || g.manually_cleared === true;
}

function measurementsHaveLandmarks(m, g) {
  if (!m || !g) return false;
  if (m.SS !== null && !g.s1_superior) return false;
  if ((m.PI !== null || m.PT !== null) && (!g.s1_superior || !g.hip_midpoint)) return false;
  if (m.L1PA != null && (!g.l1_center || !g.s1_superior || !g.hip_midpoint)) return false;
  return ['L1', 'L2', 'L3', 'L4', 'L5'].every(level => m.LL[`${level}-S1`] == null
    || Boolean(g.vertebrae[level] && g.s1_superior));
}

/**
 * @param {*} raw the parsed contents of studies.json ({version, studies})
 * @returns {object[]} normalized real Study[]
 * @throws {Error} when raw is not a well-formed store, or a record's
 *   identity fields are wrong
 */
export function validate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Study store is not an object.');
  if (raw.version !== STORE_VERSION) {
    throw new Error(`Study store version ${raw.version ?? 'missing'} is not supported by this build (expected ${STORE_VERSION}).`);
  }
  if (!Array.isArray(raw.studies)) throw new Error('Study store is missing a "studies" array.');
  return raw.studies.map((entry, index) => validateStudy(entry, index));
}

function validateStudy(entry, index) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Study at index ${index} is not an object.`);
  }
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    throw new Error(`Study at index ${index} is missing an id.`);
  }
  if (entry.source !== 'real') {
    throw new Error(`Study ${entry.id} has source "${entry.source}"; only "real" studies may be persisted.`);
  }
  if (typeof entry.fileName !== 'string') {
    throw new Error(`Study ${entry.id} is missing fileName.`);
  }
  if (typeof entry.addedAt !== 'string') {
    throw new Error(`Study ${entry.id} is missing addedAt.`);
  }
  if (typeof entry.view !== 'string') {
    throw new Error(`Study ${entry.id} is missing view.`);
  }

  const measurements = isValidMeasurements(entry.measurements) ? entry.measurements : null;
  const geometry = isValidGeometry(entry.geometry) ? entry.geometry : null;
  const complete = measurementsHaveLandmarks(measurements, geometry);
  if (!complete && (entry.measurements != null || entry.geometry != null)) {
    console.warn(`persistence: ${entry.id} has a malformed measurements/geometry payload; it will need to be re-run.`);
  }
  // (2026-09-07, pre-op/post-op spec §7.1) three more optional, null-default text fields, on the
  // same terms as name and workspaceFolder below. A film date that is not YYYY-MM-DD is dropped
  // with a warning rather than failing the record (§7.4): a bad date is not fatal.
  const filmDateText = optionalText(entry.filmDate);
  const filmDate = filmDateText !== null && FILM_DATE.test(filmDateText) ? filmDateText : null;
  if (filmDateText !== null && filmDate === null) {
    console.warn(`persistence: ${entry.id} has a film date that is not YYYY-MM-DD ("${filmDateText}"); it is dropped.`);
  }
  // (2026-09-10, studies-table spec 8.1) the review mark, on the same optional-null terms as the
  // three fields above. A value that is not a date is dropped with a warning rather than failing
  // the record: a bad mark is not fatal, and a dropped one only asks for the review again.
  const reviewedText = optionalText(entry.reviewedAt);
  const reviewedAt = reviewedText !== null && !Number.isNaN(Date.parse(reviewedText)) ? reviewedText : null;
  if (reviewedText !== null && reviewedAt === null) {
    console.warn(`persistence: ${entry.id} has a review mark that is not a date ("${reviewedText}"); it is dropped.`);
  }
  return {
    id: entry.id, source: 'real',
    filePath: typeof entry.filePath === 'string' ? entry.filePath : null,
    fileName: entry.fileName, addedAt: entry.addedAt, view: entry.view,
    // Both are optional and default to null, so no STORE_VERSION bump: a record written before
    // they existed loads fine and simply reads as its SP-nnnn id with no workspace. They must
    // be listed HERE or they are written to disk and then dropped on the next load, which looks
    // like the column working all session and going blank after a restart.
    name: typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name : null,
    workspaceFolder: typeof entry.workspaceFolder === 'string' ? entry.workspaceFolder : null,
    subjectId: optionalText(entry.subjectId),
    timepoint: optionalText(entry.timepoint),
    filmDate,
    // (2026-09-11) the note read from the filename or typed in the drawer; optional-null like the
    // three above, so no STORE_VERSION bump.
    note: optionalText(entry.note),
    reviewedAt,
    thumbnail: typeof entry.thumbnail === 'string' && entry.thumbnail.startsWith('data:image/') ? entry.thumbnail : null,
    measurements: complete ? measurements : null,
    geometry: complete ? geometry : null,
    qc: entry.qc && typeof entry.qc === 'object' ? entry.qc : null,
    calibration: normalizeCalibration(entry.calibration),
    clinical: entry.clinical && typeof entry.clinical === 'object' && !Array.isArray(entry.clinical) ? entry.clinical : {},
  };
}

// Save-on-change with coalescing: one save in flight at a time; changes that arrive meanwhile
// collapse into one trailing save of the latest list. No timers, so the last change before quit
// is written as soon as the previous write finishes. Demo studies are filtered out here, so the
// main process never sees them.
export function createStudySaver({ save, onError, disabledReason = null, initial = null }) {
  let lastSeen = initial;
  let latest = null;      // the real studies waiting to be written, or null
  let inFlight = null;    // the promise of the write loop, or null
  let reported = false;

  async function drain() {
    while (latest !== null) {
      const batch = latest;
      latest = null;
      try { await save(batch); } catch (error) { onError(new Error(`Could not save studies: ${error.message}`)); }
    }
    inFlight = null;
  }

  function notify(state) {
    if (state.studies === lastSeen) return;
    lastSeen = state.studies;
    if (disabledReason) {
      if (!reported) { reported = true; onError(new Error(`Studies are not being saved: ${disabledReason}`)); }
      return;
    }
    latest = state.studies.filter((study) => study.source === 'real');
    if (!inFlight) inFlight = drain();
  }

  const flush = () => inFlight ?? Promise.resolve();
  return { notify, flush };
}
