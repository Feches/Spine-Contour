import { getState, setState } from './store.js';
import { normalizeCalibration } from './data/calibration.js';

// Folder scans precede study creation. Keep compact results by full path until Load;
// after that the ordinary study saver persists them. Backend hashes verify reused bytes.
const byPath = new Map();

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
    changed = true;
    return { ...study, calibration };
  });
  if (changed) setState({ studies });
}

export function attachCalibrations(studies) {
  return studies.map(study => {
    const calibration = byPath.get(study.filePath);
    if (!calibration || (study.geometry && study.calibration?.source_sha256 !== calibration.source_sha256)) return study;
    return { ...study, calibration };
  });
}
