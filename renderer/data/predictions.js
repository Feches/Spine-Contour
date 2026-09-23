import { studyRegion } from './cervical.js';

// The sidecar must belong to the saved result, not merely to this study's reusable
// filename/id. In particular, a failed sidecar write after a rerun must not restore
// the old model's image or make its landmarks the reset target.
export function predictionMatchesStudy(study, sidecar) {
  if (!study?.geometry || !study.measurements || !sidecar?.geometry || !sidecar.measurements) return false;
  if (study.predictionId && study.predictionId !== sidecar.prediction_id) return false;
  if (studyRegion(study) !== studyRegion({ geometry: sidecar.geometry })) return false;
  const current = study.geometry, saved = sidecar.geometry;
  if (['cervical', 'full_spine'].includes(current.region) && current.anterior_side !== saved.anterior_side) return false;
  for (const key of ['source_sha256', 'image_width', 'image_height', 'coordinate_space']) {
    if (current[key] != null && current[key] !== saved[key]) return false;
  }
  return true;
}
