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

// (2026-10-10, level editor, ruling R16 as amended) True when no model run produced this study's record: it has no
// prediction id and its qc has no `models`. A model run always records `qc.models`, and from v1.0.10 a prediction
// id too; a level-editor commit through /measure writes neither (only qc.coverage and qc.manual_edits). So a study
// with geometry for which this is true got that geometry from the level editor alone: it has no sidecar and is
// shown from its decoded original. A study segmented before v1.0.10 (qc.models, no id) is still a model result.
export function isHandPlaced(study) {
  return study?.predictionId == null && !study?.qc?.models;
}
