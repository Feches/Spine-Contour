import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelLabel, describeModels } from '../renderer/data/models.js';
import { landmarkReviewReasons } from '../renderer/data/status.js';
import { measurementGeometry } from '../renderer/data/measurement-sources.js';
import { globalSvaMeasurements, globalSvaMeasureGeometry } from '../renderer/data/global-sva.js';
import { constructionLabel } from '../renderer/viewer/canvas.js';

// Results segmented by 1.5.0 and 1.5.1 (the fixed seven-measurement pipeline, PR #72) stay in libraries after 1.6.0
// restored the earlier pipeline. They must read as they did when they were measured.

test('1.5.x model provenance still reads HRNET', () => {
  assert.equal(modelLabel('vertebrae', 'seven-measurements-20261023'), 'HRNET');
  assert.equal(modelLabel('vertebrae', 'cervical_slope_hrnet'), 'HRNET');
  assert.equal(describeModels({ models: { vertebrae: 'seven-measurements-20261023' } }), 'HRNET');
});

test('a 1.5.x cervical result keeps its cervical review reasons and gets no S1 warning', () => {
  const reasons = landmarkReviewReasons({ models: { vertebrae: 'cervical_slope_hrnet', cervical: 'cervical_slope_hrnet' },
    framing: { window: [0, 0, 400, 600] } });
  assert.ok(reasons.includes('Verify C2/C7 landmarks and the inferred anterior image side.'));
  assert.ok(!reasons.some(reason => reason.startsWith('S1 detection')));
});

function fullSpine() {
  const main = { c7_centroid: [140, 100], s1_superior: [[120, 900], [180, 920]], femoral_circles: [[110, 980, 10], [130, 980, 10]] };
  return { region: 'full_spine', anterior_side: 'left', image_width: 500, image_height: 1000,
    coordinate_space: 'original_image', vertebrae: {}, hip_midpoint: [120, 980], l1_center: null, ...structuredClone(main),
    pipeline_revision: 'seven-measurements-20261023',
    measurement_sources: {
      global_sva: { c7_centroid: [140, 100], s1_superior: [[120, 900], [160, 920]] },
      pelvic_tilt: { s1_superior: [[120, 900], [180, 920]], femoral_circles: [[110, 990, 10], [130, 990, 10]], vertebrae: {} },
    },
    source_geometry: structuredClone(main) };
}

test('an unedited 1.5.x film draws and measures each routed measurement from its own anchors', () => {
  const g = fullSpine();
  assert.deepEqual(measurementGeometry(g, 'global_sva').s1_superior, [[120, 900], [160, 920]]);
  const pt = measurementGeometry(g, 'pelvic_tilt');
  assert.deepEqual(pt.femoral_circles, [[110, 990, 10], [130, 990, 10]]);
  assert.deepEqual(pt.hip_midpoint, [120, 990]);
  assert.equal(pt.vertebrae, g.vertebrae, 'the route never replaces the shared levels');
  assert.equal(measurementGeometry(g, null), g);
  assert.equal(globalSvaMeasurements({ region: 'full_spine', geometry: g }).GLOBAL_SVA_PX, 20);
  // S1 midpoint [150, 910], route hip [120, 990]: the PT construction is labelled halfway along that line.
  assert.deepEqual(constructionLabel(g, 'PT', { PT: 10 }).anchor, [135, 950]);
});

test('a moved shared anchor supersedes the route, and a result without routes reads its own geometry', () => {
  const g = fullSpine();
  g.s1_superior = [[120, 905], [180, 925]];
  assert.equal(measurementGeometry(g, 'global_sva'), g);
  assert.equal(measurementGeometry(g, 'pelvic_tilt'), g);
  const plain = { region: 'full_spine', c7_centroid: [140, 100], s1_superior: [[120, 900], [180, 920]] };
  assert.equal(measurementGeometry(plain, 'global_sva'), plain);
  assert.equal(measurementGeometry(null, 'global_sva'), null);
});

test('re-measuring a 1.5.x full-spine film drops its routes, so the backend and the viewer read the same anchors', () => {
  const sent = globalSvaMeasureGeometry(fullSpine(), null);
  assert.equal('measurement_sources' in sent, false);
  assert.equal('source_geometry' in sent, false);
  assert.deepEqual(sent.s1_superior, [[120, 900], [180, 920]]);
  assert.equal(sent.pipeline_revision, 'seven-measurements-20261023');
});
