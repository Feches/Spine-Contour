/**
 * Status derivation (spec 13.1, architecture contract "renderer/data/status.js").
 * Status is never stored on a Study — it is computed from measurements and qc
 * every time it is needed. Pure. The residual threshold is measurements.js's,
 * re-exported, so the panel's consistency warning and the list's status can never
 * disagree.
 */

import { piResidual, RESIDUAL_LIMIT } from './measurements.js';

export { RESIDUAL_LIMIT };
export const CONFIDENCE_LIMIT = 0.6;
// Review threshold, not an estimate of measurement accuracy.
export const S1_CONFIDENCE_LIMIT = 0.6;

export function landmarkReviewReasons(qc) {
  const reasons = [];
  if (qc?.coverage?.partial) {
    const missing = Array.isArray(qc.coverage.missing) ? qc.coverage.missing.join(', ') : 'landmarks';
    reasons.push(`Partial segmentation — missing ${missing}. Only available landmarks are measured.`);
  }
  if (qc?.coverage?.unoriented?.length) reasons.push('Anterior/posterior orientation unavailable — only middle disc heights can be measured.');
  if (!qc?.manual_edits?.femoral && qc?.femoral?.qc_pass === false) {
    reasons.push(`Femoral measurements unavailable — ${qc.femoral.reason || 'no usable femoral fit'}.`);
  }
  const confidence = qc?.femoral?.confidence;
  if (!qc?.manual_edits?.femoral && typeof confidence === 'number' && confidence < CONFIDENCE_LIMIT) {
    reasons.push('Low femoral fit confidence — check the femoral landmarks.');
  }
  const framing = qc?.framing;
  // Older results without framing metadata remain readable. A framing record
  // must include usable scores; missing/invalid scores cannot silently pass.
  if (framing) {
    const weak = (score) => !Number.isFinite(score) || score < S1_CONFIDENCE_LIMIT || score > 1;
    if (weak(framing.s1_confidence)) reasons.push('S1 detection needs review — check the S1 endplate.');
    if (framing.searched && weak(framing.search_confidence)) {
      reasons.push('Spine location needs review — check the crop and vertebral levels.');
    }
  }
  if (qc?.manual_edits?.landmarks) reasons.push('Manually edited landmarks — verify the corrected positions. Original model scores do not assess these edits.');
  return reasons;
}

export function reviewReasons(study) {
  if (!study?.measurements) return [];
  const reasons = landmarkReviewReasons(study.qc);
  if (piResidual(study.measurements) > RESIDUAL_LIMIT) {
    reasons.unshift('Parameters inconsistent — check S1 and femoral landmarks.');
  }
  return reasons;
}

/** @returns {'seg'|'rev'|'proc'} */
export function deriveStatus(study) {
  if (!study || study.measurements == null) return 'proc';
  return reviewReasons(study).length ? 'rev' : 'seg';
}

export function statusLabel(status) {
  if (status === 'seg') return 'Segmented';
  if (status === 'rev') return 'Needs review';
  return 'Processing';
}
