import { getState, setState } from './store.js';
import { normalizeCalibration } from './data/calibration.js';

// Folder scans precede study creation. Keep compact results by full path until Load;
// after that the ordinary study saver persists them. Backend hashes verify reused bytes.
const byPath = new Map();

// Deep equality with key order normalised: a record read from disk and one the backend just
// returned need not agree on key order, and a re-scan that finds the same ruler is not a change.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

// The one way a study's calibration is written (studies-table spec 2026-09-10, section 8.4, site 4). An
// unchanged scale returns the SAME record, so nothing repaints and nothing is un-reviewed; a
// changed scale replaces the record and clears the review mark, because the disc heights on it are
// about to change. Exported for its unit test.
export function withCalibration(study, calibration) {
  if (JSON.stringify(canonical(study.calibration ?? null)) === JSON.stringify(canonical(calibration ?? null))) return study;
  return { ...study, calibration, reviewedAt: null };
}

export function calibrationForStudy(study) {
  return byPath.get(study.filePath) ?? normalizeCalibration(study.calibration);
}

export function rememberCalibration(filePath, response) {
  const calibration = normalizeCalibration(response);
  if (!filePath || !calibration) return;
  byPath.set(filePath, calibration);
  const state = getState();
  let changed = false;
  const studies = state.studies.map(study => {
    if (study.source !== 'real' || study.filePath !== filePath) return study;
    // A changed file at the same path is not the film underlying old geometry.
    if (study.geometry && study.calibration?.source_sha256 !== calibration.source_sha256) return study;
    const next = withCalibration(study, calibration);
    if (next !== study) changed = true;
    return next;
  });
  if (changed) setState({ studies });
}

export function attachCalibrations(studies) {
  return studies.map(study => {
    const calibration = byPath.get(study.filePath);
    if (!calibration || (study.geometry && study.calibration?.source_sha256 !== calibration.source_sha256)) return study;
    return withCalibration(study, calibration);
  });
}
