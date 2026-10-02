import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentalRows, segmentalValues, segmentalEndplates } from '../renderer/data/segmental.js';
import { parameterValues } from '../renderer/data/parameters.js';
import { toCsv, toPairedCsv, parse } from '../renderer/data/csv.js';
import { pairStudies } from '../renderer/data/pairing.js';
import { constructionLabel } from '../renderer/viewer/canvas.js';

// Analytic line geometry tests, not segmentation accuracy evidence.
function study(region = 'lumbar') {
  const names = region === 'cervical' ? ['C3', 'C4'] : ['L4', 'L5'];
  return { region, source: 'real', id: 'test', fileName: 'test.png', measurements: {},
    geometry: { region, image_width: 500, image_height: 500, vertebrae: {
      [names[0]]: { superior: [[10, 10], [30, 10]], inferior: [[10, 30], [30, 40]] },
      [names[1]]: { superior: [[10, 60], [30, 80]] },
    } } };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
test('issue 15 distinguishes adjacent superior/superior from facing disc endplates in both regions', () => {
  for (const region of ['lumbar', 'cervical']) {
    const s = study(region), pair = region === 'lumbar' ? 'L4-L5' : 'C3-C4';
    const values = segmentalValues(s);
    assert.equal(segmentalRows(s).length, 10);
    near(values[`SEG_lordosis_${pair}`], 45);
    near(values[`SEG_angulation_${pair}`], 45 - Math.atan(.5) * 180 / Math.PI);
    near(parameterValues(s)[`SEG_lordosis_${pair}`], 45);
    assert.match(constructionLabel(s.geometry, `SEG_lordosis_${pair}`, values).text, /45.0°/);
    assert.deepEqual(segmentalEndplates(s.geometry, `SEG_angulation_${pair}`)[0], s.geometry.vertebrae[pair.split('-')[0]].inferior);
  }
});
test('missing, degenerate, out of bounds and unsegmented results are unavailable independently', () => {
  const s = study();
  delete s.geometry.vertebrae.L4.inferior;
  assert.equal(segmentalValues(s)['SEG_angulation_L4-L5'], null);
  near(segmentalValues(s)['SEG_lordosis_L4-L5'], 45);
  s.geometry.vertebrae.L5.superior = [[10, 60], [10, 60]];
  assert.equal(segmentalValues(s)['SEG_lordosis_L4-L5'], null);
  s.geometry.vertebrae.L5.superior = [[10, 60], [500, 80]];
  assert.equal(segmentalValues(s)['SEG_lordosis_L4-L5'], null);
  assert.ok(segmentalRows({ ...study(), measurements: null }).every(r => r.absent));
});
test('angle is invariant to endpoint reversal, reflection and translation; edits and reload recalculate', () => {
  const s = study(), before = segmentalValues(s);
  for (const body of Object.values(s.geometry.vertebrae)) for (const plate of Object.values(body)) {
    plate.reverse(); for (const p of plate) { p[0] = 400 - p[0]; p[1] += 10; }
  }
  assert.deepEqual(segmentalValues(s), before);
  s.geometry.vertebrae.L5.superior[1][1] = s.geometry.vertebrae.L5.superior[0][1];
  near(segmentalValues(JSON.parse(JSON.stringify(s)))['SEG_lordosis_L4-L5'], 0);
});
test('L5-S1 uses sacral superior; full-spine includes both regions without bridging gaps', () => {
  const s = study(); s.geometry.s1_superior = [[10, 100], [30, 100]];
  near(segmentalValues(s)['SEG_lordosis_L5-S1'], 45);
  s.region = s.geometry.region = 'full_spine';
  Object.assign(s.geometry.vertebrae, study('cervical').geometry.vertebrae);
  assert.equal(segmentalRows(s).length, 20);
  near(segmentalValues(s)['SEG_lordosis_C3-C4'], 45);
  assert.equal(segmentalValues(s)['SEG_lordosis_C2-C3'], null);
});
test('single and paired CSV export both regional segmental measurements and deltas', () => {
  for (const region of ['cervical', 'lumbar']) {
    const pre = { ...study(region), subjectId: 'subject', timepoint: 'Pre-op' };
    const post = { ...structuredClone(pre), id: 'post', fileName: 'post.png', timepoint: 'Post-op' };
    const level = region === 'lumbar' ? 'L5' : 'C4';
    post.geometry.vertebrae[level].superior = [[10, 60], [30, 60]];
    const pair = region === 'lumbar' ? 'L4-L5' : 'C3-C4';
    const column = `Segmental lordosis ${pair} (deg)`;
    const csv = toCsv([pre]).split('\r\n');
    assert.equal(csv[3].split(',')[csv[2].split(',').indexOf(column)], '45');
    const paired = parse(toPairedCsv(pairStudies([pre, post])).split('\r\n').slice(2).join('\r\n'));
    assert.equal(paired.rows[0][`Delta ${column} Post-op`], '-45');
  }
});

test('anisotropic spacing is current, bound to the source, and cleared calibration never reuses old geometry spacing', () => {
  const s = study();
  s.geometry.source_sha256 = 'a'.repeat(64);
  s.geometry.pixel_spacing = [2, 1];
  s.calibration = { version: 1, source_sha256: 'a'.repeat(64), width: 500, height: 500,
    coordinate_space: 'original_image', status: 'dicom', candidates: [], selected_index: null,
    spacing: { row_mm: 2, column_mm: 1, source: 'dicom_pixel_spacing' } };
  near(segmentalValues(s)['SEG_lordosis_L4-L5'], Math.atan(2) * 180 / Math.PI);
  s.calibration.source_sha256 = 'b'.repeat(64);
  near(segmentalValues(s)['SEG_lordosis_L4-L5'], 45);
  s.calibration.source_sha256 = 'a'.repeat(64);
  s.calibration.status = 'cleared'; s.calibration.spacing = null;
  near(segmentalValues(s)['SEG_lordosis_L4-L5'], 45);
});
