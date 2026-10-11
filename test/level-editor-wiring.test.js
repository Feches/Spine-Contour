/**
 * The level editor's wiring through the real store (2026-10-10, the final review's I1, ruling R20). An Auto film
 * that no model run produced takes its region from the levels placed on it at every projection: on a failed Auto
 * film, L3 and then C3 commit twice, and the second projection, the study and the label record all read full spine.
 * `commitGeometry` is the real measure queue (viewer/measure-queue.js, debounce 0 ms) over a stub /measure that
 * echoes what it is sent, wrapped in a recorder; ensureFilm and imageInfo are stubs, and getPrediction has no
 * snapshot (no model run). Nothing is mounted: the panel and the stage are the smoke suite's
 * (tools/smoke/smoke-levels.mjs). The store is put back after every test. Every film is SP-95nn, an id no other
 * test file uses, and no two tests here share one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getState, setState } from '../renderer/store.js';
import { newStudy } from '../renderer/screens/studies.js';
import {
  configureLevelEditor, enterLevelEditor, exitNow, startPlace, placePoint, toggleLevelVisible, selectPlacingStep,
  restorePlacing, fitPlacing,
} from '../renderer/level-editor.js';
// (Gate feedback G3, 2026-10-11; plan D15) The window / level belongs to the view: renderer/film-window.js.
import { configureFilmWindow, openWindowPanel, closeWindowPanel } from '../renderer/film-window.js';
import { createMeasureQueue } from '../renderer/viewer/measure-queue.js';
import { toLabelRecord } from '../renderer/data/label-record.js';
import { LEVEL_CODES } from '../renderer/data/levels.js';

const IMAGE = { width: 400, height: 600 };
const SHA = 'a'.repeat(64);

// /measure, near enough for the wiring: it answers with the geometry it was sent. A lumbar request carries only
// vertebrae, s1_superior and femoral_circles, so its answer has no region and the queue writes 'lumbar' (the
// legacy-response rule in measure-queue.js); a cervical or full-spine request carries the whole geometry.
const measure = async (request) => ({ measurements: {}, geometry: structuredClone(request) });

// The debounce (0 ms) and the stub's answer have both run by the time a 20 ms timer fires.
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function failedAutoFilm(id) {
  return {
    ...newStudy({ id, fileName: `${id}_full_spine.png`, filePath: null }),
    processingError: 'No spine was found on this film.', processingErrorAt: '2026-10-10T08:00:00.000Z',
  };
}

const studyOf = (id) => getState().studies.find((study) => study.id === id);

// The wiring's dependencies, with every commit recorded before it reaches the real queue.
function wire(commits) {
  const queue = createMeasureQueue({ measure, getState, setState, showToast: () => {}, debounceMs: 0 });
  const ensureFilm = async () => ({ images: null, raw: null, reason: null, superseded: false });
  configureLevelEditor({
    commitGeometry: (studyId, geometry) => {
      commits.push({ studyId, geometry });
      queue.commitGeometry(studyId, geometry);
    },
    getPrediction: () => undefined,
    ensureFilm,
    imageInfo: async () => ({ file: 'x', sha256: SHA, width: IMAGE.width, height: IMAGE.height, maskPixels: null, labels: null }),
  });
  configureFilmWindow({ ensureFilm });
}

async function withStore(study, body) {
  const saved = getState();
  try {
    setState({ studies: [study], openId: study.id, screen: 'analysis', editing: false, levelEditor: null, selection: null,
      filmWindow: null, running: null, batch: null, measurementDrafts: {}, toast: '' });
    await body();
  } finally {
    exitNow();
    setState(saved);
  }
}

// A body's four corners, clicked in order SA, SP, IA, IP; anterior on the left (SA.x < SP.x).
function placeBody(code, [x, y]) {
  startPlace(code);
  for (const point of [[x, y], [x + 40, y + 2], [x + 2, y + 30], [x + 42, y + 32]]) placePoint(point, IMAGE);
}

test('a failed Auto film: L3 then C3 commits twice, and the projection, the study and the record read full spine (R20)', async () => {
  const study = failedAutoFilm('SP-9500');
  const commits = [];
  wire(commits);
  await withStore(study, async () => {
    await enterLevelEditor(study.id);
    const opened = getState().levelEditor;
    assert.equal(opened.region, 'auto', 'no model run: the editor opens as Auto');
    assert.ok(LEVEL_CODES.every((code) => opened.levels[code].visible), 'every level visible (D6)');

    placeBody('L3', [100, 400]);
    await settle();
    assert.equal(commits.length, 1);
    assert.equal(commits[0].geometry.region, 'lumbar');
    assert.equal(studyOf(study.id).geometry.region, 'lumbar', 'the measure queue wrote the first projection');

    placeBody('C3', [100, 100]);
    await settle();
    assert.equal(commits.length, 2, 'C3 commits although the geometry already says lumbar');
    const second = commits[1].geometry;
    assert.equal(second.region, 'full_spine');
    assert.equal(second.anterior_side, 'left', 'oriented from the placed levels (no stored or chosen side)');
    assert.deepEqual(Object.keys(second.vertebrae).sort(), ['C3', 'L3']);
    const after = studyOf(study.id);
    assert.equal(after.geometry.region, 'full_spine');
    assert.deepEqual(Object.keys(after.geometry.vertebrae).sort(), ['C3', 'L3']);

    const record = toLabelRecord({
      editor: getState().levelEditor, study: after,
      image: { file: after.fileName, sha256: SHA, width: IMAGE.width, height: IMAGE.height },
      model: { name: 'none', version: 'unknown' }, savedAt: '2026-10-10T09:00:00.000Z',
    });
    assert.equal(record.film.region, 'full_spine');
    assert.equal(record.levels.C3.state, 'manual');
    assert.equal(record.levels.L3.state, 'manual');
  });
});

test('the region keeps following: hiding C3 commits a lumbar projection, and a reopen still opens as Auto with C3 (R20)', async () => {
  const study = failedAutoFilm('SP-9501');
  const commits = [];
  wire(commits);
  await withStore(study, async () => {
    await enterLevelEditor(study.id);
    placeBody('L3', [100, 400]);
    placeBody('C3', [100, 100]);
    await settle();
    assert.equal(commits.length, 2);
    exitNow();
    await enterLevelEditor(study.id);
    const reopened = getState().levelEditor;
    assert.equal(reopened.region, 'auto', 'a hand-placed Auto film reopens as Auto, whatever its geometry says');
    assert.ok(reopened.levels.C3.visible && reopened.levels.C3.geometry, 'C3 is back from the study geometry');
    assert.ok(reopened.levels.L3.visible && reopened.levels.L3.geometry);

    toggleLevelVisible('C3');
    await settle();
    assert.equal(commits.length, 3, 'hiding C3 changes the projection');
    assert.equal(commits[2].geometry.region, 'lumbar');
    assert.equal(studyOf(study.id).geometry.region, 'lumbar');
  });
});

test('an Auto film a model run resolved keeps its region: a C level placed on a lumbar result does not commit', async () => {
  const study = {
    ...newStudy({ id: 'SP-9502', fileName: 'SP-9502_lumbar.png', filePath: null }),
    measurements: { SS: null, PI: null, PT: null, L1PA: null, LL: { 'L1-S1': null } },
    geometry: { region: 'lumbar', vertebrae: {}, s1_superior: null, femoral_circles: [] },
    qc: { models: { vertebrae: 'unet', femoral: 'unet', s1: 'keypointrcnn' } },
  };
  const commits = [];
  wire(commits);
  await withStore(study, async () => {
    await enterLevelEditor(study.id);
    assert.equal(getState().levelEditor.region, 'lumbar', 'the result\'s region is the film type');
    placeBody('C3', [100, 100]);
    await settle();
    assert.ok(getState().levelEditor.levels.C3.geometry, 'the level model keeps the placement');
    assert.equal(commits.length, 0, 'a lumbar film does not project C3');
    placeBody('L3', [100, 400]);
    await settle();
    assert.equal(commits.length, 1);
    assert.equal(commits[0].geometry.region, 'lumbar');
    assert.deepEqual(Object.keys(commits[0].geometry.vertebrae), ['L3']);
  });
});

test('a step chip (selectPlacingStep) chooses the next point, commits nothing, and waits while the W/L panel is open (G2)', async () => {
  const study = failedAutoFilm('SP-9503');
  const commits = [];
  wire(commits);
  await withStore(study, async () => {
    await enterLevelEditor(study.id);
    startPlace('L3');
    const started = getState().levelEditor;
    selectPlacingStep(3);
    const chosen = getState().levelEditor;
    assert.notEqual(chosen, started, 'a new editor, never the old one changed in place');
    assert.equal(chosen.placing.current, 3);
    assert.equal(started.placing.current, 0);
    assert.equal(chosen.levels, started.levels, 'no level changed');
    selectPlacingStep(3);
    assert.equal(getState().levelEditor, chosen, 'the step already current: nothing written');
    placePoint([142, 432], IMAGE);                       // IP first
    assert.deepEqual(getState().levelEditor.placing.points, [null, null, null, [142, 432]]);
    assert.equal(getState().levelEditor.placing.current, 0);

    openWindowPanel();
    const paused = getState().levelEditor;
    assert.equal(getState().filmWindow?.open, true, 'the view\'s window panel (D15)');
    assert.equal(getState().filmWindow.studyId, study.id);
    selectPlacingStep(2);
    assert.equal(getState().levelEditor, paused, 'paused while the window / level panel is open');
    placePoint([10, 10], IMAGE);
    assert.equal(getState().levelEditor, paused, 'a placement click waits while the panel is open');
    closeWindowPanel();

    selectPlacingStep(0);
    placePoint([100, 400], IMAGE);                       // SA
    placePoint([140, 402], IMAGE);                       // SP
    await settle();
    assert.equal(commits.length, 0, 'nothing is committed before the placement finishes');
    placePoint([102, 430], IMAGE);                       // IA: the last empty step finishes it
    await settle();
    assert.equal(commits.length, 1);
    assert.deepEqual(commits[0].geometry.vertebrae.L3.superior, [[100, 400], [140, 402]]);
    assert.deepEqual(commits[0].geometry.vertebrae.L3.inferior, [[102, 430], [142, 432]]);
    assert.equal(getState().levelEditor.placing, null);
  });
});

test('a chord takes back a re-placing press: restorePlacing puts the placing from before the press back (review F2)', async () => {
  const study = failedAutoFilm('SP-9504');
  const commits = [];
  wire(commits);
  await withStore(study, async () => {
    await enterLevelEditor(study.id);
    startPlace('L3');
    placePoint([100, 400], IMAGE);                       // SA
    selectPlacingStep(3);
    placePoint([142, 432], IMAGE);                       // IP
    selectPlacingStep(0);                                // the SA chip: the next click re-places SA
    const before = getState().levelEditor;
    const prior = before.placing;
    assert.deepEqual(prior.history, [0, 3]);

    placePoint([90, 395], IMAGE);                        // the press that a second button turns into a chord
    const pressed = getState().levelEditor.placing;
    assert.deepEqual(pressed.points[0], [90, 395], 'the press re-placed SA');
    assert.deepEqual(pressed.history, [3, 0]);

    restorePlacing(prior, pressed);
    const restored = getState().levelEditor;
    assert.notEqual(restored, before, 'a new editor, never the old one changed in place');
    assert.equal(restored.placing, prior, 'the placing from before the press');
    assert.deepEqual(restored.placing.points, [[100, 400], null, null, [142, 432]], 'SA is back at its first position');
    assert.deepEqual(restored.placing.history, [0, 3], 'history as before the press');
    assert.equal(restored.placing.current, 0);
    assert.equal(restored.levels, before.levels, 'no level changed');

    restorePlacing(prior, pressed);
    assert.equal(getState().levelEditor, restored, 'a stale press (the placing has moved on): nothing written');

    placePoint([90, 395], IMAGE);
    const again = getState().levelEditor.placing;
    placePoint([140, 402], IMAGE);                       // SP: the placing moves on before any chord
    const movedOn = getState().levelEditor;
    restorePlacing(prior, again);
    assert.equal(getState().levelEditor, movedOn, 'the placing moved on: the take-back is a no-op');

    const last = movedOn.placing;
    placePoint([102, 430], IMAGE);                       // IA: the last empty step finishes the placement
    assert.equal(getState().levelEditor.placing, null);
    const finished = getState().levelEditor;
    restorePlacing(last, null);
    assert.equal(getState().levelEditor, finished, 'a press that finished the placement is not taken back');
    await settle();
    assert.equal(commits.length, 1, 'only the finished placement committed');
    assert.deepEqual(commits[0].geometry.vertebrae.L3.superior, [[90, 395], [140, 402]]);
  });
});

// The review of G3/G4, finding 5: FIT, like a placement click and a step chip, waits while the view's W/L panel is open
// over the editor's film (D15; renderer/film-window.js), and works again once it closes.
test('FIT (fitPlacing) is a no-op while the W/L panel is open, and finishes the head once it closes', async () => {
  const study = failedAutoFilm('SP-9505');
  const commits = [];
  wire(commits);
  await withStore(study, async () => {
    await enterLevelEditor(study.id);
    startPlace('FH1');
    placePoint([100, 400], IMAGE);
    placePoint([140, 400], IMAGE);                       // two rim points: FIT is enabled
    const placing = getState().levelEditor.placing;
    assert.equal(placing.code, 'FH1');

    openWindowPanel();
    assert.equal(getState().filmWindow?.open, true, 'the view\'s window panel (D15)');
    const paused = getState().levelEditor;
    fitPlacing(IMAGE);
    assert.equal(getState().levelEditor, paused, 'FIT waits while the window / level panel is open: nothing written');
    assert.equal(getState().levelEditor.placing, placing);
    await settle();
    assert.equal(commits.length, 0, 'nothing committed while paused');

    closeWindowPanel();
    fitPlacing(IMAGE);
    const fitted = getState().levelEditor;
    assert.equal(fitted.placing, null, 'with the panel closed FIT finishes the placement');
    assert.deepEqual(fitted.levels.FH1.geometry.center, [120, 400]);
    assert.equal(fitted.levels.FH1.geometry.radius, 20);
    await settle();
    assert.equal(commits.length, 1, 'the fitted head is committed');
  });
});
