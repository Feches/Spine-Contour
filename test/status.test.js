import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESIDUAL_LIMIT, CONFIDENCE_LIMIT, deriveStatus, statusLabel } from '../renderer/data/status.js';
import { isConsistent } from '../renderer/data/measurements.js';
import { reviewReasons, S1_CONFIDENCE_LIMIT } from '../renderer/data/status.js';
import {
  isReviewed, displayStatus, reviewedLabel, reviewBlockedReason,
  REVIEW_DEMO, REVIEW_NOTHING, REVIEW_RUNNING, REVIEW_PENDING,
} from '../renderer/data/status.js';

test('weak S1 and weak spine location require review despite a good femoral fit and consistent angles', () => {
  const study = { measurements: { PI: 60, PT: 20, SS: 40 }, qc: {
    femoral: { confidence: 0.95 },
    framing: { s1_confidence: 0.01, search_confidence: 0.01, searched: true },
  } };
  assert.equal(deriveStatus(study), 'rev');
  assert.equal(reviewReasons(study).length, 2);
  assert.match(reviewReasons(study)[0], /S1/);
  study.qc.framing.s1_confidence = S1_CONFIDENCE_LIMIT;
  assert.equal(deriveStatus(study), 'rev', 'the crop search still needs review');
  study.qc.framing.search_confidence = S1_CONFIDENCE_LIMIT;
  assert.equal(deriveStatus(study), 'seg', 'the review threshold is inclusive');
});

test('invalid or missing S1 score in a framing record cannot pass; legacy absent framing remains readable', () => {
  const study = { measurements: { PI: 60, PT: 20, SS: 40 }, qc: { framing: {} } };
  for (const score of [undefined, null, NaN, Infinity, -0.1, 1.1, '0.95']) {
    study.qc.framing.s1_confidence = score;
    assert.equal(deriveStatus(study), 'rev', String(score));
  }
  delete study.qc.framing;
  assert.equal(deriveStatus(study), 'seg');
});

test('RESIDUAL_LIMIT is 1.0 degrees and CONFIDENCE_LIMIT is 0.6', () => {
  assert.equal(RESIDUAL_LIMIT, 1.0);
  assert.equal(CONFIDENCE_LIMIT, 0.6);
});

test('deriveStatus returns proc when the study itself is null or undefined', () => {
  assert.equal(deriveStatus(null), 'proc');
  assert.equal(deriveStatus(undefined), 'proc');
});

test('deriveStatus returns proc when measurements is null', () => {
  const study = { measurements: null, qc: null };
  assert.equal(deriveStatus(study), 'proc');
});

test('deriveStatus returns seg when residual and confidence both pass', () => {
  const study = { measurements: { PI: 50, PT: 20, SS: 30 }, qc: { femoral: { confidence: 0.9 } } };
  assert.equal(deriveStatus(study), 'seg');
});

test('deriveStatus returns rev when the residual exceeds the limit', () => {
  // |PI - (PT + SS)| = |50 - 48| = 2
  const study = { measurements: { PI: 50, PT: 20, SS: 28 }, qc: { femoral: { confidence: 0.9 } } };
  assert.equal(deriveStatus(study), 'rev');
});

test('deriveStatus returns rev when confidence is below the limit', () => {
  const study = { measurements: { PI: 50, PT: 20, SS: 30 }, qc: { femoral: { confidence: 0.5 } } };
  assert.equal(deriveStatus(study), 'rev');
});

test('deriveStatus returns rev when both the residual and confidence fail', () => {
  const study = { measurements: { PI: 50, PT: 20, SS: 28 }, qc: { femoral: { confidence: 0.1 } } };
  assert.equal(deriveStatus(study), 'rev');
});

test('a residual of exactly 1.0 is inclusive-pass (seg, not rev)', () => {
  // |51 - (20 + 30)| = 1.0 exactly
  const study = { measurements: { PI: 51, PT: 20, SS: 30 }, qc: { femoral: { confidence: 0.9 } } };
  assert.equal(deriveStatus(study), 'seg');
});

test('a confidence of exactly 0.6 is inclusive-pass (seg, not rev)', () => {
  const study = { measurements: { PI: 50, PT: 20, SS: 30 }, qc: { femoral: { confidence: 0.6 } } };
  assert.equal(deriveStatus(study), 'seg');
});

test('a residual of 1.01 fails (rev)', () => {
  const study = { measurements: { PI: 51.01, PT: 20, SS: 30 }, qc: { femoral: { confidence: 0.9 } } };
  assert.equal(deriveStatus(study), 'rev');
});

test('a confidence of 0.59 fails (rev)', () => {
  const study = { measurements: { PI: 50, PT: 20, SS: 30 }, qc: { femoral: { confidence: 0.59 } } };
  assert.equal(deriveStatus(study), 'rev');
});

test('missing qc entirely does not by itself force rev', () => {
  const study = { measurements: { PI: 50, PT: 20, SS: 30 }, qc: null };
  assert.equal(deriveStatus(study), 'seg');
});

test('missing qc.femoral does not by itself force rev', () => {
  const study = { measurements: { PI: 50, PT: 20, SS: 30 }, qc: {} };
  assert.equal(deriveStatus(study), 'seg');
});

test('statusLabel maps every status to its display label', () => {
  assert.equal(statusLabel('seg'), 'Segmented');
  assert.equal(statusLabel('rev'), 'Needs review');
  assert.equal(statusLabel('proc'), 'Processing');
});

test('deriveStatus and isConsistent agree at the residual boundary (one RESIDUAL_LIMIT)', () => {
  const at = { PI: 20 + 30 + RESIDUAL_LIMIT, PT: 20, SS: 30 };
  const over = { PI: 20 + 30 + RESIDUAL_LIMIT + 0.01, PT: 20, SS: 30 };
  const qc = { femoral: { confidence: 0.9 } };
  assert.equal(deriveStatus({ measurements: at, qc }), 'seg');
  assert.equal(isConsistent(at), true);
  assert.equal(deriveStatus({ measurements: over, qc }), 'rev');
  assert.equal(isConsistent(over), false);
});

// (2026-09-10, studies-table spec 8) the review mark and the fourth status.
const CLEAN = { measurements: { PI: 60, PT: 20, SS: 40 }, qc: { femoral: { confidence: 0.95 } } };
const SUSPECT = { measurements: { PI: 60, PT: 20, SS: 40 }, qc: { femoral: { confidence: 0.2 } } };
const MARK = '2026-09-10T12:00:00.000Z';

test('a review mark makes a study Reviewed whether or not its qc would ask for review, and the warnings stay', () => {
  assert.equal(deriveStatus({ ...CLEAN, reviewedAt: MARK }), 'ok');
  assert.equal(deriveStatus({ ...SUSPECT, reviewedAt: MARK }), 'ok');
  assert.equal(reviewReasons({ ...SUSPECT, reviewedAt: MARK }).length, 1);
});

test('a review mark over no measurements is still Processing; a blank or non-string mark is no mark', () => {
  assert.equal(deriveStatus({ measurements: null, reviewedAt: MARK }), 'proc');
  assert.equal(deriveStatus({ ...SUSPECT, reviewedAt: '' }), 'rev');
  assert.equal(deriveStatus({ ...SUSPECT, reviewedAt: null }), 'rev');
  assert.equal(deriveStatus({ ...CLEAN, reviewedAt: 12 }), 'seg');
  assert.equal(isReviewed({ reviewedAt: '  ' }), false);
  assert.equal(isReviewed({ reviewedAt: MARK }), true);
  assert.equal(isReviewed(null), false);
});

test('displayStatus reads Processing for the running study and deriveStatus otherwise', () => {
  const study = { id: 'SP-1000', ...CLEAN, reviewedAt: MARK };
  assert.equal(displayStatus(study, 'SP-1000'), 'proc');
  assert.equal(displayStatus(study, 'SP-1001'), 'ok');
  assert.equal(displayStatus(study, null), 'ok');
  assert.equal(displayStatus(study), 'ok');
  assert.equal(displayStatus(null, null), 'proc');
});

test('statusLabel names the fourth status', () => {
  assert.equal(statusLabel('ok'), 'Reviewed');
});

test('reviewedLabel carries the date and never invents one', () => {
  // Noon UTC so the local date is the 10th in every zone the app is tested in.
  assert.equal(reviewedLabel(MARK), 'Reviewed \u00B7 Sep 10, 2026');
  assert.equal(reviewedLabel('not a date'), 'Reviewed');
  assert.equal(reviewedLabel(null), 'Reviewed');
  assert.equal(reviewedLabel(undefined), 'Reviewed');
});

test('reviewBlockedReason: demo, then running, then nothing to review, then pending, then enabled', () => {
  assert.equal(reviewBlockedReason({ study: { id: 'SP-0042', source: 'demo', ...CLEAN } }), REVIEW_DEMO);
  assert.equal(reviewBlockedReason({ study: { id: 'SP-1000', source: 'real', ...CLEAN }, running: 'SP-1000' }), REVIEW_RUNNING);
  assert.equal(reviewBlockedReason({ study: { id: 'SP-1000', source: 'real', measurements: null }, running: null }), REVIEW_NOTHING);
  assert.equal(reviewBlockedReason({ study: { id: 'SP-1000', source: 'real', ...CLEAN }, pending: true }), REVIEW_PENDING);
  assert.equal(reviewBlockedReason({ study: { id: 'SP-1000', source: 'real', ...CLEAN }, running: 'SP-1001' }), null);
  assert.equal(reviewBlockedReason({ study: null }), REVIEW_NOTHING);
});
