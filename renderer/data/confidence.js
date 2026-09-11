import { reviewReasons } from './status.js';
import { normalizeCalibration, calibrationSummary } from './calibration.js';

export function scorePercent(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? `${Math.round(value * 100)}%` : '—';
}

/** Overall review assessment, not a calibrated probability of measurement accuracy. */
export function imageConfidence(study, pending = false) {
  const explanation = 'Based on available quality checks, not a probability of correct measurements. Vertebral segmentation has no calibrated confidence score.';
  if (pending) return { label: 'Updating…', tone: 'unknown', details: ['Measurements are being updated.', explanation] };
  if (!study?.geometry || !study.measurements || study.source === 'demo') {
    return { label: '—', tone: 'unknown', details: ['No image assessment available.', explanation] };
  }
  const { geometry: g, qc } = study;
  const reasons = reviewReasons(study);
  const available = ['L1', 'L2', 'L3', 'L4', 'L5'].filter(level => g.vertebrae[level]);
  if (g.s1_superior) available.push('S1');
  const count = g.femoral_circles.length;
  const missing = ['L1', 'L2', 'L3', 'L4', 'L5', 'S1'].filter(level => !available.includes(level));
  if ((missing.length || count !== 2) && !qc?.coverage?.partial) reasons.push('Partial anatomy — only available landmarks can be measured.');
  if (Object.values(g.vertebrae).some(body => body.anterior_confirmed === false)
    && !qc?.coverage?.unoriented?.length) reasons.push('Anterior/posterior orientation needs review.');
  const calibration = normalizeCalibration(study.calibration);
  if (!calibration?.spacing) reasons.push('Image scale unavailable — disc heights in mm require image calibration.');
  const scores = [qc?.framing?.s1_confidence, qc?.femoral?.confidence];
  if (qc?.framing?.searched) scores.push(qc.framing.search_confidence);
  const incomplete = scores.some(score => scorePercent(score) === '—') || !qc?.coverage;
  if (incomplete) reasons.push('Some original model quality checks are unavailable.');
  const original = qc?.manual_edits?.landmarks ? 'Original ' : '';
  const details = [
    ...reasons,
    `Visible landmarks: ${available.join(', ') || 'none'}; ${count}/2 femoral circles.${missing.length ? ` Missing: ${missing.join(', ')}.` : ''}`,
    `${original}S1 detection score: ${scorePercent(qc?.framing?.s1_confidence)}.`,
    `${original}femoral fit score: ${scorePercent(qc?.femoral?.confidence)}${qc?.manual_edits?.femoral ? ' (before circle edits)' : ''}.`,
    qc?.framing?.searched ? `${original}crop localizer score: ${scorePercent(qc.framing.search_confidence)}.` : 'Crop search: not used or not recorded.',
    `Calibration: ${calibrationSummary(study.calibration)}`,
    explanation,
  ];
  const needsReview = reasons.length > (incomplete ? 1 : 0);
  // No tone may equal a statusLabel string ('Segmented'/'Needs review'/'Processing'/'Reviewed'):
  // this badge sits beside the status badge in the Analysis header and the two derive from
  // different inputs, so shared words read as the screen contradicting itself. Wording only --
  // the tones and the conditions that pick them are unchanged.
  return { label: needsReview ? 'Review recommended' : incomplete ? 'Limited information' : 'Checks passed',
    tone: needsReview ? 'review' : incomplete ? 'unknown' : 'pass', details };
}
