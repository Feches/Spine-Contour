/**
 * The level editor's wiring through the real store (2026-10-10, the final review's I1, ruling R20). An Auto film
 * that no model run produced takes its region from the levels placed on it at every projection: on a failed Auto
 * film, L3 and then C3 commit twice, and the second projection, the study and the label record all read full spine.
 * `commitGeometry` is the real measure queue (viewer/measure-queue.js, debounce 0 ms) over a stub /measure that
 * echoes what it is sent, wrapped in a recorder; ensureFilm and imageInfo are stubs, and getPrediction has no
 * snapshot (no model run). Nothing is mounted: the panel and the stage are the smoke suite's
 * (tools/smoke/smoke-levels.mjs). The store is put back after every test. Every film is SP-95nn, an id no other
 * test file uses, and no two tests here share one.
 *
 * (Gate feedback G6, 2026-10-12; plan D19) The last group drives writeReviewRecord, the label record Mark reviewed
 * writes for a film that has none, with a prediction snapshot and the film's image facts stubbed and the main
 * process's label-record channels stubbed on `window.spineContour`, as test/api.test.js stubs the bridge.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getState, setState } from '../renderer/store.js';
import { newStudy } from '../renderer/screens/studies.js';
import {
  configureLevelEditor, enterLevelEditor, exitNow, startPlace, placePoint, toggleLevelVisible, selectPlacingStep,
  restorePlacing, fitPlacing, writeReviewRecord, saveLevelEdits, hasStashedEditor, forgetLevelEditor,
} from '../renderer/level-editor.js';
// (Gate feedback G3, 2026-10-11; plan D15) The window / level belongs to the view: renderer/film-window.js.
import { configureFilmWindow, openWindowPanel, closeWindowPanel } from '../renderer/film-window.js';
import { createMeasureQueue } from '../renderer/viewer/measure-queue.js';
import { toLabelRecord } from '../renderer/data/label-record.js';
import { LEVEL_CODES } from '../renderer/data/levels.js';
import { validateAgainst } from './fixtures/schema-check.js';

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

// The wiring's dependencies, with every commit recorded before it reaches the real queue. `ensureFilm` may be
// replaced (the window re-review's minor: what entering edit mode does to a kept window), and so may `getPrediction`
// and `imageInfo` (G6: a model result's snapshot, a film read that fails or that the store changes under).
const NO_FILM = async () => ({ images: null, raw: null, reason: null, superseded: false });
const PLAIN_IMAGE = async () => ({ file: 'x', sha256: SHA, width: IMAGE.width, height: IMAGE.height, maskPixels: null, labels: null });

function wire(commits, ensureFilm = NO_FILM, { getPrediction = () => undefined, imageInfo = PLAIN_IMAGE } = {}) {
  const queue = createMeasureQueue({ measure, getState, setState, showToast: () => {}, debounceMs: 0 });
  configureLevelEditor({
    commitGeometry: (studyId, geometry) => {
      commits.push({ studyId, geometry });
      queue.commitGeometry(studyId, geometry);
    },
    getPrediction,
    ensureFilm,
    imageInfo,
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

// The window re-review's minor (2026-10-11, after R35): entering edit mode asks ensureFilm for the film (showFilm). When
// that outcome carries no decoded original, a READY window of the film is forgotten, the rule film-window.js
// redecodeKeptWindow applies at the mount, so the chip never claims a window the film layer does not draw after another
// study's run took the image cache. With an original the window is left exactly as it was.
function readyWindow(studyId) {
  return {
    studyId, open: false, status: 'ready', reason: null, width: 120, level: 60, defaultWidth: 200, defaultLevel: 100,
    min: 0, max: 255, range: { widthMin: 1, widthMax: 510, levelMin: -255, levelMax: 510 },
  };
}

test('entering edit mode forgets a ready window when the film comes back without its decoded original', async () => {
  const study = failedAutoFilm('SP-9506');
  const calls = [];
  wire([], async (studyId) => {
    calls.push(studyId);
    return { images: { width: IMAGE.width, height: IMAGE.height }, raw: null, reason: null, superseded: false };
  });
  await withStore(study, async () => {
    setState({ filmWindow: readyWindow(study.id) });
    await enterLevelEditor(study.id);
    await settle();
    assert.deepEqual(calls, [study.id], 'showFilm asked for the film once');
    assert.equal(getState().editing, true);
    assert.equal(getState().filmWindow, null, 'no original: the ready window is forgotten');
  });
});

test('entering edit mode leaves a ready window alone when the film outcome is superseded', async () => {
  const study = failedAutoFilm('SP-9509');
  wire([], async () => ({ images: null, raw: null, reason: null, superseded: true }));
  await withStore(study, async () => {
    const kept = readyWindow(study.id);
    setState({ filmWindow: kept });
    await enterLevelEditor(study.id);
    await settle();
    assert.equal(getState().editing, true);
    assert.equal(getState().filmWindow, kept, 'a superseded outcome says nothing about the film: the same window');
  });
});

test('entering edit mode keeps a ready window when the film comes back with its decoded original, and a loading one either way', async () => {
  const study = failedAutoFilm('SP-9507');
  const raw = { width: IMAGE.width, height: IMAGE.height, valueMin: 0, valueMax: 255 };
  wire([], async () => ({ images: { width: IMAGE.width, height: IMAGE.height, raw }, raw, reason: null, superseded: false }));
  await withStore(study, async () => {
    const kept = readyWindow(study.id);
    setState({ filmWindow: kept });
    await enterLevelEditor(study.id);
    await settle();
    assert.equal(getState().editing, true);
    assert.equal(getState().filmWindow, kept, 'the same window, untouched');
  });

  const other = failedAutoFilm('SP-9508');
  wire([], async () => ({ images: { width: IMAGE.width, height: IMAGE.height }, raw: null, reason: null, superseded: false }));
  await withStore(other, async () => {
    const loading = { ...readyWindow(other.id), status: 'loading', range: null };
    setState({ filmWindow: loading });
    await enterLevelEditor(other.id);
    await settle();
    assert.equal(getState().filmWindow, loading, 'a loading window is left to its own decode');
    exitNow();
    const elsewhere = readyWindow('SP-9599');
    setState({ filmWindow: elsewhere });
    await enterLevelEditor(other.id);
    await settle();
    assert.equal(getState().filmWindow, elsewhere, 'another film\'s window is not this film\'s to forget');
  });
});

// ---------------------------------------------------------------------------
// Gate feedback G6 (2026-10-12; plan D19, rulings R40 and R41): Mark reviewed writes the label record when the film
// has none yet. writeReviewRecord is what the Analysis panel's Mark reviewed calls once the mark is set (toggleReviewed
// writes reviewedAt first), so every fixture below is already marked unless the test says otherwise.

const SCHEMA = JSON.parse(fs.readFileSync(new URL('../docs/design/level-editor/label-record.schema.json', import.meta.url), 'utf8'));
const SAVED = 'Saved the label record.';
const NOT_WRITTEN = 'Marked reviewed. The label record could not be written: ';
const PLACED = ['segmented', 'edited', 'manual'];
const MARKED_AT = '2026-10-12T09:00:00.000Z';

// A lumbar model result in a 400x600 image: L1, L2, L4, L5, S1 and two heads, L3 missed. Corners [SA, SP, IA, IP].
const BODIES = {
  L1: [[150, 100], [230, 105], [148, 150], [228, 155]],
  L2: [[145, 170], [228, 174], [143, 220], [226, 224]],
  L4: [[140, 310], [225, 312], [142, 360], [227, 362]],
  L5: [[145, 380], [230, 378], [150, 430], [235, 425]],
};

function lumbarGeometry() {
  return {
    region: 'lumbar',
    vertebrae: Object.fromEntries(Object.entries(BODIES).map(([code, [sa, sp, ia, ip]]) => [code, { superior: [sa, sp], inferior: [ia, ip] }])),
    s1_superior: [[155, 450], [238, 440]],
    femoral_circles: [[120, 520, 30], [135, 512, 32]],
  };
}

// A model result (a prediction id and qc.models, so not isHandPlaced), marked reviewed, with no label record.
function segmentedFilm(id, patch = {}) {
  return {
    ...newStudy({ id, fileName: `lumbar_${id.slice(3)}.png`, filePath: null }),
    predictionId: `prediction-${id}`,
    measurements: { SS: 40, PI: 52, PT: 12, L1PA: 9, LL: { 'L1-S1': 48 } },
    geometry: lumbarGeometry(),
    qc: { models: { vertebrae: 'unet', femoral: 'unet', s1: 'keypointrcnn' }, model_versions: { vertebrae: 'onnx-1a2b3c' } },
    reviewedAt: MARKED_AT,
    labelFile: null,
    ...patch,
  };
}

// The viewer's prediction snapshot (getPrediction) for a model whose output is `geometry`.
const snapshotOf = (geometry) => () => ({ measurements: {}, geometry: structuredClone(geometry), qc: null });

// The film's image facts with a label mask: L1's label id (20) fills a box inside its corners, so a segmented L1
// carries the model's mask outline as its contour (R10).
async function maskedImage() {
  const mask = new Uint8ClampedArray(IMAGE.width * IMAGE.height * 4);
  for (let y = 110; y < 145; y += 1) for (let x = 155; x < 222; x += 1) mask[(y * IMAGE.width + x) * 4] = 20;
  return { file: 'x', sha256: SHA, width: IMAGE.width, height: IMAGE.height, maskPixels: mask, labels: { L1: 20 } };
}

// The main process's label-record channels, recorded. `onSave` runs inside a save, to refuse it or to change the
// store while the file is written.
function labelBridge(onSave = null) {
  const saved = [];
  const deleted = [];
  const spineContour = {
    saveLabelRecord: async (name, record) => {
      saved.push({ name, record: structuredClone(record) });
      if (onSave) await onSave(name, record);
    },
    deleteLabelRecord: async (name) => { deleted.push(name); },
    loadLabelRecord: async () => null,
  };
  return { spineContour, saved, deleted };
}

async function withBridge(bridge, body) {
  const had = Object.hasOwn(globalThis, 'window');
  const previous = globalThis.window;
  globalThis.window = { spineContour: bridge.spineContour };
  try {
    await body();
  } finally {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  }
}

const entriesOf = (record) => [...Object.values(record.levels), ...record.femoral_heads];
const unmark = (id) => setState((s) => ({ studies: s.studies.map((x) => (x.id === id ? { ...x, reviewedAt: null } : x)) }));
const remove = (id) => setState((s) => ({ studies: s.studies.filter((x) => x.id !== id) }));

test('G6: Mark reviewed on a segmented film with no record writes the zero-change record, outside edit mode (D19)', async () => {
  const study = segmentedFilm('SP-9510');
  wire([], NO_FILM, { getPrediction: snapshotOf(study.geometry), imageInfo: maskedImage });
  const bridge = labelBridge();
  await withBridge(bridge, () => withStore(study, async () => {
    assert.equal(await writeReviewRecord(study.id), 'written');
    assert.equal(bridge.saved.length, 1, 'one write');
    const [{ name, record }] = bridge.saved;
    assert.equal(name, 'lumbar_9510.label.json', 'named from the film\'s stem (D3)');
    const valid = validateAgainst(SCHEMA, record);
    assert.ok(valid.ok, valid.errors.join('; '));
    assert.equal(record.study, 'lumbar_9510');
    assert.deepEqual(record.image, { file: study.fileName, sha256: SHA, width_px: IMAGE.width, height_px: IMAGE.height });
    assert.deepEqual(record.model, { name: 'unet', version: 'onnx-1a2b3c' });
    assert.equal(record.film.region, 'lumbar');
    const placed = Object.entries(record.levels).filter(([, entry]) => PLACED.includes(entry.state));
    assert.deepEqual(placed.map(([code]) => code), ['L1', 'L2', 'L4', 'L5', 'S1'], 'the model\'s levels');
    assert.ok(placed.every(([, entry]) => entry.state === 'segmented' && entry.source === 'model'), 'every placed level reads segmented');
    assert.ok(record.femoral_heads.every((head) => head.state === 'segmented'), 'both heads segmented');
    assert.equal(record.levels.L3.state, 'not_placed', 'the missed level: visible on a lumbar film (D5), not placed');
    assert.equal(record.levels.C3.state, 'not_visible');
    assert.ok(entriesOf(record).every((entry) => entry.edited_points.length === 0), 'no entry lists an edited point');
    assert.deepEqual(record.edits, { segmented: 7, edited: 0, manual: 0, not_placed: 1, not_visible: 8, points_moved: 0, points_placed: 0 });
    assert.ok(Array.isArray(record.levels.L1.contour) && record.levels.L1.contour.length >= 3, 'L1 carries the model\'s mask outline (R10)');

    const after = studyOf(study.id);
    assert.equal(after.labelFile, name, 'the study names its record');
    assert.equal(after.reviewedAt, MARKED_AT, 'the mark is untouched');
    assert.equal(getState().toast, SAVED, 'the zero-change save\'s toast');
    assert.equal(getState().levelEditor, null, 'no editor was put in the store');
    assert.equal(getState().editing, false, 'no edit mode');
    assert.equal(hasStashedEditor(study.id), false, 'nothing stashed');
  }));
});

test('G6: the review record equals what Save edits writes right after entering edit mode with no change (D19)', async () => {
  // The stored geometry already differs from the prediction at L2's SA (an earlier correction): both records say so.
  const model = lumbarGeometry();
  const stored = lumbarGeometry();
  stored.vertebrae.L2.superior[0] = [139, 167];
  wire([], NO_FILM, { getPrediction: snapshotOf(model), imageInfo: maskedImage });
  const review = labelBridge();
  await withBridge(review, () => withStore(segmentedFilm('SP-9511', { geometry: structuredClone(stored) }), async () => {
    assert.equal(await writeReviewRecord('SP-9511'), 'written');
  }));
  const save = labelBridge();
  await withBridge(save, () => withStore(segmentedFilm('SP-9511', { geometry: structuredClone(stored) }), async () => {
    await enterLevelEditor('SP-9511');
    assert.equal(getState().editing, true);
    await saveLevelEdits();
    assert.equal(getState().toast, SAVED, 'a zero-change Save edits still writes the record (D10)');
    assert.equal(studyOf('SP-9511').labelFile, 'lumbar_9511.label.json');
  }));
  assert.equal(review.saved.length, 1);
  assert.equal(save.saved.length, 1);
  assert.equal(review.saved[0].name, save.saved[0].name, 'the same file name');
  const { saved_at: reviewedAt, ...fromReview } = review.saved[0].record;
  const { saved_at: savedAt, ...fromSave } = save.saved[0].record;
  assert.ok(reviewedAt && savedAt);
  assert.deepEqual(fromReview, fromSave, 'the same record but for saved_at');
  assert.equal(fromReview.levels.L2.state, 'edited', 'the stored correction is recorded, not hidden');
  assert.deepEqual(fromReview.levels.L2.edited_points, ['sa']);
  assert.equal(fromReview.edits.edited, 1);
  assert.equal(fromReview.edits.points_moved, 1);
});

test('G6: a film placed by hand with no model run (R16) gets its record: the placed level manual, model none', async () => {
  const study = {
    ...newStudy({ id: 'SP-9512', fileName: 'hand_9512.png', filePath: null }),
    measurements: { SS: null, PI: null, PT: null, L1PA: null, LL: { 'L3-S1': null } },
    geometry: { region: 'lumbar', vertebrae: { L3: { superior: [[100, 400], [140, 402]], inferior: [[102, 430], [142, 432]] } },
      s1_superior: null, femoral_circles: [] },
    reviewedAt: MARKED_AT,
    labelFile: null,
  };
  wire([], NO_FILM);
  const bridge = labelBridge();
  await withBridge(bridge, () => withStore(study, async () => {
    assert.equal(await writeReviewRecord(study.id), 'written');
    const [{ name, record }] = bridge.saved;
    assert.equal(name, 'hand_9512.label.json');
    const valid = validateAgainst(SCHEMA, record);
    assert.ok(valid.ok, valid.errors.join('; '));
    assert.deepEqual(record.model, { name: 'none', version: 'unknown' });
    assert.equal(record.levels.L3.state, 'manual');
    assert.deepEqual(record.levels.L3.edited_points, ['sa', 'sp', 'ia', 'ip']);
    assert.equal(record.film.region, 'lumbar', 'an Auto film with no model run takes its region from its levels (R20)');
    assert.equal(record.edits.manual, 1);
    assert.equal(record.edits.not_placed, 15, 'every other level visible, as edit mode opens an Auto film with no run (D6)');
    assert.equal(studyOf(study.id).labelFile, name);
    assert.equal(getState().toast, SAVED);
  }));
});

test('G6: Mark reviewed writes nothing for a study with a record, a demo, no result, no mark, its own run, or an editor open or stashed (R40)', async () => {
  const cases = [
    ['a study that already has a record (Save edits owns that file)', segmentedFilm('SP-9513', { labelFile: 'lumbar_9513.label.json' })],
    ['a demo study', segmentedFilm('SP-9514', { source: 'demo' })],
    ['a film with no result that is not hand-placed (nothing to label)',
      { ...newStudy({ id: 'SP-9515', fileName: 'lumbar_9515.png', filePath: null }), reviewedAt: MARKED_AT }],
    ['a study that is not marked reviewed', segmentedFilm('SP-9516', { reviewedAt: null })],
    ['a study whose own run is in flight', segmentedFilm('SP-9517'), () => setState({ running: 'SP-9517' })],
    ['a study whose editor is open (R40)', segmentedFilm('SP-9518'), () => enterLevelEditor('SP-9518')],
    ['a study whose editor is stashed with an unsaved change (R40)', segmentedFilm('SP-9519'), async () => {
      await enterLevelEditor('SP-9519');
      toggleLevelVisible('T1');                                         // one unsaved change, not projected
      setState({ openId: null, editing: false, levelEditor: null });    // another study opened (FRESH_VIEW)
      assert.equal(hasStashedEditor('SP-9519'), true, 'precondition: stashed');
    }],
  ];
  for (const [label, study, arrange] of cases) {
    wire([], NO_FILM, { getPrediction: snapshotOf(lumbarGeometry()), imageInfo: maskedImage });
    const bridge = labelBridge();
    await withBridge(bridge, () => withStore(study, async () => {
      if (arrange) await arrange();
      const before = studyOf(study.id);
      const editor = getState().levelEditor;
      assert.equal(await writeReviewRecord(study.id), 'skipped', label);
      assert.equal(bridge.saved.length, 0, `${label}: nothing written`);
      assert.equal(studyOf(study.id), before, `${label}: the study is untouched`);
      assert.equal(getState().levelEditor, editor, `${label}: the editor is untouched`);
      assert.equal(getState().toast, '', `${label}: nothing said`);
      if (label.includes('stashed')) assert.equal(hasStashedEditor(study.id), true, 'the stash is the annotator\'s');
    }));
    forgetLevelEditor(study.id);
  }
});

test('G6: a write that fails leaves the study reviewed and says why; nothing is set (R41)', async () => {
  const cases = [
    ['the film cannot be read', 'SP-9520', {}, { imageInfo: async () => { throw new Error('The saved segmentation was not found.'); } },
      null, 'The saved segmentation was not found.', 0],
    ['a model result whose prediction is not in memory', 'SP-9521', {}, { getPrediction: () => undefined },
      null, 'the model\'s prediction is not loaded.', 0],
    ['the main process refuses the file', 'SP-9522', {}, {},
      async () => { throw new Error('Invalid label file name.'); }, 'Invalid label file name.', 1],
    ['a study with no file name', 'SP-9523', { fileName: '' }, {}, null, 'the study has no file name.', 0],
  ];
  for (const [label, id, patch, deps, onSave, reason, attempts] of cases) {
    const study = segmentedFilm(id, patch);
    wire([], NO_FILM, { getPrediction: snapshotOf(study.geometry), imageInfo: maskedImage, ...deps });
    const bridge = labelBridge(onSave);
    await withBridge(bridge, () => withStore(study, async () => {
      assert.equal(await writeReviewRecord(id), 'failed', label);
      assert.equal(bridge.saved.length, attempts, `${label}: write attempts`);
      const after = studyOf(id);
      assert.equal(after.labelFile, null, `${label}: no labelFile`);
      assert.equal(after.reviewedAt, MARKED_AT, `${label}: the study stays reviewed`);
      assert.equal(getState().toast, `${NOT_WRITTEN}${reason}`, label);
    }));
  }
});

test('G6: a study deleted, re-added or unmarked while its film was read gets nothing; one deleted while the file was written loses the file (R41)', async () => {
  const readThen = (change) => async () => { change(); return maskedImage(); };

  const deleted = segmentedFilm('SP-9524');
  wire([], NO_FILM, { getPrediction: snapshotOf(deleted.geometry), imageInfo: readThen(() => remove('SP-9524')) });
  let bridge = labelBridge();
  await withBridge(bridge, () => withStore(deleted, async () => {
    assert.equal(await writeReviewRecord('SP-9524'), 'skipped', 'deleted while the film was read');
    assert.equal(bridge.saved.length, 0, 'nothing written');
    assert.equal(studyOf('SP-9524'), undefined, 'nothing set');
    assert.equal(getState().toast, '');
  }));

  const readded = { ...segmentedFilm('SP-9525'), addedAt: '2099-01-01T00:00:00.000Z' };
  wire([], NO_FILM, { getPrediction: snapshotOf(lumbarGeometry()), imageInfo: readThen(() => setState({ studies: [readded] })) });
  bridge = labelBridge();
  await withBridge(bridge, () => withStore(segmentedFilm('SP-9525'), async () => {
    assert.equal(await writeReviewRecord('SP-9525'), 'skipped', 're-added under the same id while the film was read');
    assert.equal(bridge.saved.length, 0);
    assert.equal(studyOf('SP-9525'), readded, 'the new record is left as it is');
  }));

  const unmarked = segmentedFilm('SP-9526');
  wire([], NO_FILM, { getPrediction: snapshotOf(unmarked.geometry), imageInfo: readThen(() => unmark('SP-9526')) });
  bridge = labelBridge();
  await withBridge(bridge, () => withStore(unmarked, async () => {
    assert.equal(await writeReviewRecord('SP-9526'), 'skipped', 'unmarked while the film was read');
    assert.equal(bridge.saved.length, 0);
    assert.equal(studyOf('SP-9526').labelFile, null);
  }));

  const late = segmentedFilm('SP-9527');
  wire([], NO_FILM, { getPrediction: snapshotOf(late.geometry), imageInfo: maskedImage });
  bridge = labelBridge(async () => remove('SP-9527'));
  await withBridge(bridge, async () => {
    await withStore(late, async () => {
      assert.equal(await writeReviewRecord('SP-9527'), 'skipped', 'deleted while the file was written');
      assert.equal(bridge.saved.length, 1);
      assert.equal(getState().toast, '');
    });
    await settle();
    assert.deepEqual(bridge.deleted, ['lumbar_9527.label.json'], 'the delete could not see the file: it is removed here');
  });
});

test('G6: a Save edits clicked while a review write reads the film waits for it, and the review write defers to the open editor (R40)', async () => {
  const study = segmentedFilm('SP-9528');
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let reads = 0;
  wire([], NO_FILM, { getPrediction: snapshotOf(study.geometry), imageInfo: async () => {
    reads += 1;
    if (reads === 1) await held;                                       // the review write's read, held
    return maskedImage();
  } });
  const bridge = labelBridge();
  await withBridge(bridge, () => withStore(study, async () => {
    const review = writeReviewRecord(study.id);
    await enterLevelEditor(study.id);
    assert.equal(getState().editing, true);
    const save = saveLevelEdits();
    await settle();
    assert.equal(reads, 1, 'the save waits: it has not read the film yet');
    release();
    assert.equal(await review, 'skipped', 'an editor opened while the film was read: its record is the annotator\'s to save');
    await save;
    assert.equal(reads, 2);
    assert.equal(bridge.saved.length, 1, 'one write, the save\'s');
    assert.equal(studyOf(study.id).labelFile, 'lumbar_9528.label.json');
    assert.equal(getState().toast, SAVED);
    assert.equal(getState().levelEditor.record.exists, true);
  }));
});

test('G6: a review write asked for while Save edits is writing waits for it, then finds the record and writes nothing', async () => {
  const study = segmentedFilm('SP-9529');
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  wire([], NO_FILM, { getPrediction: snapshotOf(study.geometry), imageInfo: maskedImage });
  const bridge = labelBridge(() => held);
  await withBridge(bridge, () => withStore(study, async () => {
    await enterLevelEditor(study.id);
    const save = saveLevelEdits();
    await settle();
    assert.equal(bridge.saved.length, 1, 'precondition: the save is writing');
    exitNow();                                                         // DONE: nothing unsaved, out at once
    const review = writeReviewRecord(study.id);
    release();
    await save;
    assert.equal(await review, 'skipped', 'the study has its record now');
    assert.equal(bridge.saved.length, 1, 'one write, the save\'s');
    assert.equal(studyOf(study.id).labelFile, 'lumbar_9529.label.json');
    assert.equal(getState().toast, SAVED);
  }));
});

// ---------------------------------------------------------------------------
// Review round 1 of G6 (2026-10-12; ruling R42): the review write reads the stored image only. screens/analysis.js
// imageInfo's full read can decode the original (POST /decode) and is superseded when another film takes the single
// image cache meanwhile; its `storedOnly` read takes a model result's stored image from memory or its sidecar and
// cannot be. imageInfo itself is DOM code (smoke-levels.mjs section 18 drives it); these pin the wiring's side.

// Every imageInfo call, with its options.
function recordingImageInfo(calls, read = maskedImage) {
  return async (studyId, options) => {
    calls.push({ studyId, options });
    return read(studyId, options);
  };
}

test('G6 review round 1: the review write asks for the stored image only; Save edits reads the film as before (R42)', async () => {
  const study = segmentedFilm('SP-9530');
  const calls = [];
  wire([], NO_FILM, { getPrediction: snapshotOf(study.geometry), imageInfo: recordingImageInfo(calls) });
  await withBridge(labelBridge(), () => withStore(study, async () => {
    assert.equal(await writeReviewRecord(study.id), 'written');
  }));
  assert.deepEqual(calls, [{ studyId: 'SP-9530', options: { storedOnly: true } }], 'one read, of the stored image only');

  calls.length = 0;
  await withBridge(labelBridge(), () => withStore(segmentedFilm('SP-9530'), async () => {
    await enterLevelEditor('SP-9530');
    await saveLevelEdits();
    assert.equal(getState().toast, SAVED);
  }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options?.storedOnly ?? false, false, 'Save edits keeps the full read');
});

test('G6 review round 1: another film opened straight after the click does not stop the review write (R42)', async () => {
  // The read models screens/analysis.js imageInfo: the next film is opened while it is in flight (FRESH_VIEW, and its
  // restore takes the single image cache), which supersedes a full read and leaves a stored-only read alone.
  const study = segmentedFilm('SP-9531');
  const next = segmentedFilm('SP-9532', { reviewedAt: null });
  const read = async (studyId, options) => {
    setState((s) => ({ studies: [...s.studies, next], openId: next.id, screen: 'analysis', editing: false,
      levelEditor: null, selection: null, filmWindow: null }));
    await settle();
    if (!options?.storedOnly) throw new Error('The film changed while it was being read. Try again.');
    return maskedImage();
  };
  wire([], NO_FILM, { getPrediction: snapshotOf(study.geometry), imageInfo: read });
  const bridge = labelBridge();
  await withBridge(bridge, () => withStore(study, async () => {
    assert.equal(await writeReviewRecord(study.id), 'written');
    assert.equal(getState().openId, next.id, 'precondition: the next film is open');
    assert.equal(bridge.saved.length, 1, 'the record is written');
    assert.equal(bridge.saved[0].name, 'lumbar_9531.label.json');
    assert.equal(studyOf(study.id).labelFile, 'lumbar_9531.label.json', 'named on the reviewed study');
    assert.equal(studyOf(study.id).reviewedAt, MARKED_AT);
    assert.equal(studyOf(next.id).labelFile, null, 'the next film is left alone');
    assert.equal(getState().toast, SAVED, 'no failure toast over the next film');
  }));
});

test('G6 review round 1: with no prediction snapshot, the geometry of the sidecar the read loaded is the model\'s (R42)', async () => {
  // Clicked before the film's restore landed, then another film opened: no snapshot was ever recorded, and the
  // stored-only read hands back the sidecar's geometry, the one a restore would have recorded.
  const model = lumbarGeometry();
  const stored = lumbarGeometry();
  stored.vertebrae.L2.superior[0] = [139, 167];
  const fromSidecar = async () => ({ ...(await maskedImage()), sidecarGeometry: structuredClone(model) });
  wire([], NO_FILM, { getPrediction: () => undefined, imageInfo: fromSidecar });
  const viaSidecar = labelBridge();
  await withBridge(viaSidecar, () => withStore(segmentedFilm('SP-9533', { geometry: structuredClone(stored) }), async () => {
    assert.equal(await writeReviewRecord('SP-9533'), 'written');
  }));
  wire([], NO_FILM, { getPrediction: snapshotOf(model), imageInfo: maskedImage });
  const viaSnapshot = labelBridge();
  await withBridge(viaSnapshot, () => withStore(segmentedFilm('SP-9533', { geometry: structuredClone(stored) }), async () => {
    assert.equal(await writeReviewRecord('SP-9533'), 'written');
  }));
  const { saved_at: a, ...sidecarRecord } = viaSidecar.saved[0].record;
  const { saved_at: b, ...snapshotRecord } = viaSnapshot.saved[0].record;
  assert.ok(a && b);
  assert.deepEqual(sidecarRecord, snapshotRecord, 'the same record but for saved_at');
  assert.equal(sidecarRecord.levels.L1.state, 'segmented', 'a model level reads segmented, not manual');
  assert.equal(sidecarRecord.levels.L2.state, 'edited', 'the stored correction is still measured against the model');
});
