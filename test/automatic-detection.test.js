import test from 'node:test';
import assert from 'node:assert/strict';
import { newStudy } from '../renderer/screens/studies.js';
import { loadWorkspaceStudies } from '../renderer/screens/workspace.js';
import { folderRows } from '../renderer/data/seeding.js';
import { requestedRegion, studyRegion, regionRunReason } from '../renderer/data/cervical.js';
import { planBatch } from '../renderer/data/batch.js';
import { validate, STORE_VERSION } from '../renderer/data/persistence.js';
import { segmentStudy, setFilePayload } from '../renderer/screens/analysis.js';
import { createMeasureQueue } from '../renderer/viewer/measure-queue.js';
import { deriveStatus, reviewReasons } from '../renderer/data/status.js';
import { parameterValues } from '../renderer/data/parameters.js';
import { getState, setState } from '../renderer/store.js';

test('new picker and workspace studies default to automatic region and orientation, preserving manual folders', () => {
  const s = newStudy({ id: 'SP-9600', fileName: 'lateral.png', filePath: '/test/lateral.png' });
  assert.equal(s.region, 'auto'); assert.equal(s.anteriorSide, null); assert.equal(regionRunReason(s), null);
  assert.deepEqual(planBatch({ visible: [s], selected: [], running: null }).ids, [s.id]);
  const files = ['/test/a/1.png', '/test/b/2.png'];
  const rows = folderRows(files, '/test').map(row => row.folder === 'b' ? { ...row, region: 'full_spine', anteriorSide: 'right' } : row);
  const studies = loadWorkspaceStudies({ studies: [], wsFiles: files, wsFolder: '/test', wsFolderRows: rows }).studies;
  assert.equal(studies[0].region, 'auto'); assert.equal(studies[0].anteriorSide, null);
  assert.equal(studies[1].region, 'full_spine'); assert.equal(studies[1].anteriorSide, 'right');
  assert.equal(validate({ version: STORE_VERSION, studies: [s] })[0].region, 'auto');
});

test('auto requests use the requested mode after a detection and omit regional model overrides', async () => {
  const saved = getState(), oldWindow = globalThis.window;
  const s = { ...newStudy({ id: 'SP-9601', fileName: 'lateral.png', filePath: '/test/lateral.png' }),
    geometry: { region: 'full_spine', anterior_side: 'left' }, anteriorSide: 'right' };
  assert.equal(requestedRegion(s), 'auto'); assert.equal(studyRegion(s), 'full_spine');
  let request;
  globalThis.window = { spineContour: { predict: async payload => { request = payload; throw new Error('intentional transport stop'); } } };
  try {
    setState({ studies: [s], running: null, batch: null, deletingStudies: false });
    setFilePayload(s.id, new Uint8Array([1]));
    assert.equal((await segmentStudy(s.id, { batch: true })).ok, false);
    assert.equal(request.bodyPart, 'auto'); assert.equal(request.anteriorSide, 'right');
    assert.equal(Object.hasOwn(request, 'models'), false);
  } finally { globalThis.window = oldWindow; setState(saved); }
});


test('editing an automatically detected lumbar film preserves its resolved type and visible measurements', async () => {
  const s = { ...newStudy({ id: 'SP-9602', fileName: 'lumbar.png', filePath: '/test/lumbar.png' }),
    geometry: { region: 'lumbar', vertebrae: {}, s1_superior: [[10, 10], [20, 15]], femoral_circles: [] },
    measurements: { SS: 20, PI: null, PT: null, LL: { 'L1-S1': null } } };
  let state = { studies: [s], measurementDrafts: {} };
  const queue = createMeasureQueue({ getState: () => state,
    setState: patch => { state = { ...state, ...patch(state) }; }, showToast: message => assert.fail(message), debounceMs: 1,
    measure: async geometry => ({ geometry, measurements: { ...s.measurements, SS: 25 } }) });
  queue.replaceMeasured(s.id, s.geometry);
  queue.commitGeometry(s.id, structuredClone(s.geometry));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(state.studies[0].region, 'auto');
  assert.equal(studyRegion(state.studies[0]), 'lumbar');
  assert.equal(parameterValues(state.studies[0]).SS, 25);
});


test('automatic routing review guidance remains visible for otherwise complete lumbar results', () => {
  const study = { region: 'auto', geometry: { region: 'lumbar' }, measurements: { PI: 50, PT: 20, SS: 30 },
    qc: { film_detection: { warnings: ['Review the automatically detected film region.'], qc: { requires_review: true } } } };
  assert.equal(deriveStatus(study), 'rev');
  assert.ok(reviewReasons(study).includes('Review the automatically detected film region.'));
  study.qc.film_detection.warnings = [];
  assert.match(reviewReasons(study)[0], /automatically detected/);
});
