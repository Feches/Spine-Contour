/**
 * The view's window / level (gate feedback G3 and G4, 2026-10-11; plan D15-D17) through the real store:
 * renderer/film-window.js, the only writer of `state.filmWindow`. The window belongs to the view, like zoom and pan:
 * it lasts while the film is open, FRESH_VIEW resets it, and entering or leaving edit mode keeps it. ensureFilm is a
 * stub whose every call waits until the test settles it, so each step of a decode can be read. Nothing is mounted: the
 * toolbar button, the panel, the chip and the right-button drag are the smoke suite's (tools/smoke/smoke-levels.mjs).
 * The store is put back after every test. Every film is SP-96nn, an id no other test file uses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getState, setState } from '../renderer/store.js';
import { newStudy, FRESH_VIEW } from '../renderer/screens/studies.js';
import {
  configureFilmWindow, openWindowPanel, ensureWindowLoaded, closeWindowPanel, setWindow, resetWindow, forgetFilmWindow,
  windowFor,
} from '../renderer/film-window.js';
import { configureLevelEditor, enterLevelEditor, exitNow } from '../renderer/level-editor.js';

const FILM_UNREADABLE = 'The original film could not be loaded.';

// A 12-bit film with its own DICOM window (centre 1000, width 2000), and one with none (the full range).
const RAW = { pixels: new Uint16Array(4), width: 2, height: 2, valueMin: 0, valueMax: 4095, bitsStored: 12,
  window: { center: 1000, width: 2000 }, scale: 1 };
const RAW_PLAIN = { ...RAW, window: null };
const RANGE = { widthMin: 64, widthMax: 4096, levelMin: 0, levelMax: 4095 };

const decodedOutcome = (raw) => ({ images: {}, raw, reason: null, superseded: false });
const failedOutcome = (reason) => ({ images: null, raw: null, reason, superseded: false });
const SUPERSEDED = { images: null, raw: null, reason: null, superseded: true };

// ensureFilm as a list of pending calls: each waits for the test to resolve it.
function stubFilm() {
  const calls = [];
  configureFilmWindow({ ensureFilm: (studyId) => new Promise((resolve) => calls.push({ studyId, resolve })) });
  return calls;
}

function film(id, patch = {}) {
  return { ...newStudy({ id, fileName: `${id}.dcm`, filePath: `C:/films/${id}.dcm` }), ...patch };
}

async function withStore(studies, openId, body) {
  const saved = getState();
  try {
    setState({ studies, openId, screen: 'analysis', ...FRESH_VIEW, running: null, batch: null, measurementDrafts: {}, toast: '' });
    await body();
  } finally {
    exitNow();
    setState(saved);
  }
}

const wl = () => getState().filmWindow;

test('FRESH_VIEW and the initial store hold no window (D15)', () => {
  assert.equal(FRESH_VIEW.filmWindow, null);
});

test('openWindowPanel: loading, then ready at the film\'s own window, the panel open throughout', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9600')], 'SP-9600', async () => {
    const done = openWindowPanel();
    const loading = wl();
    assert.deepEqual(loading, {
      studyId: 'SP-9600', open: true, status: 'loading', reason: null, width: 0, level: 0, defaultWidth: 0, defaultLevel: 0,
      min: 0, max: 0, range: null,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].studyId, 'SP-9600');
    openWindowPanel();
    assert.equal(wl(), loading, 'already open and loading: nothing written');
    assert.equal(calls.length, 1, 'one decode, not two');

    calls[0].resolve(decodedOutcome(RAW));
    await done;
    assert.deepEqual(wl(), {
      studyId: 'SP-9600', open: true, status: 'ready', reason: null, width: 2000, level: 1000, defaultWidth: 2000,
      defaultLevel: 1000, min: 0, max: 4095, range: RANGE,
    });
    assert.notEqual(wl(), loading, 'a new object, never the loading one changed in place');
    assert.equal(loading.status, 'loading');
  });
});

test('a film with no window of its own opens at its full value range', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9601')], 'SP-9601', async () => {
    const done = openWindowPanel();
    calls[0].resolve(decodedOutcome(RAW_PLAIN));
    await done;
    assert.equal(wl().width, 4095);
    assert.equal(wl().level, 2048);
    assert.equal(wl().defaultWidth, 4095);
    assert.equal(wl().defaultLevel, 2048);
  });
});

test('setWindow clamps to the range and writes only a change; resetWindow restores the film\'s default', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9602')], 'SP-9602', async () => {
    const done = openWindowPanel();
    const loading = wl();
    setWindow({ width: 500, level: 500 });
    resetWindow();
    assert.equal(wl(), loading, 'nothing to set before the film is decoded');
    calls[0].resolve(decodedOutcome(RAW));
    await done;

    const start = wl();
    setWindow({ width: 99999, level: -50 });
    assert.equal(wl().width, 4096, 'width clamped to the value range plus one');
    assert.equal(wl().level, 0, 'level clamped to the lowest value');
    assert.equal(start.width, 2000, 'the earlier window is never changed in place');
    const clamped = wl();
    setWindow({ width: 5000, level: -1 });
    assert.equal(wl(), clamped, 'the same window after clamping: same reference');
    setWindow({ width: 1500.4, level: 700.6 });
    assert.equal(wl().width, 1500);
    assert.equal(wl().level, 701);
    assert.equal(wl().defaultWidth, 2000, 'the default never moves');

    resetWindow();
    assert.equal(wl().width, 2000);
    assert.equal(wl().level, 1000);
    const reset = wl();
    resetWindow();
    assert.equal(wl(), reset, 'already at the default: nothing written');
  });
});

test('closeWindowPanel keeps the window; reopening a ready window decodes nothing', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9603')], 'SP-9603', async () => {
    const done = openWindowPanel();
    calls[0].resolve(decodedOutcome(RAW));
    await done;
    setWindow({ width: 800, level: 300 });
    closeWindowPanel();
    assert.equal(wl().open, false);
    assert.equal(wl().status, 'ready');
    assert.equal(wl().width, 800, 'the window outlives the panel');
    const closed = wl();
    closeWindowPanel();
    assert.equal(wl(), closed, 'already closed: nothing written');
    setWindow({ width: 900, level: 300 });
    assert.equal(wl().width, 900, 'a right-button drag sets the window with the panel closed (D16)');
    await openWindowPanel();
    assert.equal(wl().open, true);
    assert.equal(wl().width, 900);
    assert.equal(calls.length, 1, 'the decoded film is reused');
  });
});

test('ensureWindowLoaded decodes without opening the panel, once', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9604')], 'SP-9604', async () => {
    const done = ensureWindowLoaded();
    assert.equal(wl().status, 'loading');
    assert.equal(wl().open, false, 'the right-button drag does not open the panel (D16)');
    ensureWindowLoaded();
    assert.equal(calls.length, 1, 'one decode while loading');
    calls[0].resolve(decodedOutcome(RAW));
    await done;
    assert.equal(wl().status, 'ready');
    assert.equal(wl().open, false);
    const ready = wl();
    await ensureWindowLoaded();
    assert.equal(wl(), ready, 'ready: nothing written');
    assert.equal(calls.length, 1);
    openWindowPanel();
    assert.equal(wl().open, true, 'the panel opens on the window the drag loaded');
    assert.equal(calls.length, 1);
  });
});

test('an unavailable film keeps its reason; the panel retries it, the right-button drag does not (R30)', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9605')], 'SP-9605', async () => {
    let done = openWindowPanel();
    calls[0].resolve(failedOutcome('The source film could not be found.'));
    await done;
    assert.equal(wl().status, 'unavailable');
    assert.equal(wl().reason, 'The source film could not be found.');
    assert.equal(wl().open, true);
    assert.equal(wl().range, null);

    const unavailable = wl();
    await ensureWindowLoaded();
    assert.equal(wl(), unavailable, 'a right press does not decode again');
    assert.equal(calls.length, 1);
    setWindow({ width: 100, level: 100 });
    resetWindow();
    assert.equal(wl(), unavailable, 'nothing to set on an unavailable film');

    done = openWindowPanel();
    assert.equal(wl().status, 'loading', 'opening the panel tries again');
    assert.equal(calls.length, 2);
    calls[1].resolve(failedOutcome(null));
    await done;
    assert.equal(wl().reason, FILM_UNREADABLE, 'a failure with no reason of its own');
  });
});

test('a superseded decode is asked again, up to three times', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9606')], 'SP-9606', async () => {
    const done = openWindowPanel();
    calls[0].resolve(SUPERSEDED);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls.length, 2, 'superseded is not a failure: asked again');
    calls[1].resolve(decodedOutcome(RAW));
    await done;
    assert.equal(wl().status, 'ready');

    closeWindowPanel();
    forgetFilmWindow('SP-9606');
    const again = openWindowPanel();
    for (let index = 2; index < 5; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      calls[index].resolve(SUPERSEDED);
    }
    await again;
    assert.equal(calls.length, 5, 'three attempts, no fourth');
    assert.equal(wl().status, 'unavailable');
    assert.equal(wl().reason, FILM_UNREADABLE);
  });
});

test('a decode that finishes after FRESH_VIEW, or after another study opened, is dropped', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9607'), film('SP-9608')], 'SP-9607', async () => {
    const first = openWindowPanel();
    setState({ openId: 'SP-9608', ...FRESH_VIEW });
    assert.equal(wl(), null, 'FRESH_VIEW resets the window with the zoom and pan');
    calls[0].resolve(decodedOutcome(RAW));
    await first;
    assert.equal(wl(), null, 'the decode of the study left behind writes nothing');

    const second = openWindowPanel();
    setState({ openId: 'SP-9607', ...FRESH_VIEW });
    const third = openWindowPanel();
    assert.equal(wl().studyId, 'SP-9607');
    calls[1].resolve(decodedOutcome(RAW_PLAIN));
    await second;
    assert.equal(wl().studyId, 'SP-9607');
    assert.equal(wl().status, 'loading', 'SP-9608\'s decode does not land on SP-9607\'s window');
    calls[2].resolve(decodedOutcome(RAW));
    await third;
    assert.equal(wl().status, 'ready');
    assert.equal(wl().width, 2000, 'SP-9607\'s own film');
  });
});

test('windowFor reads the window of the study on the stage only', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9609'), film('SP-9610')], 'SP-9609', async () => {
    assert.equal(windowFor(getState(), { id: 'SP-9609' }), null, 'no window yet');
    const done = openWindowPanel();
    calls[0].resolve(decodedOutcome(RAW));
    await done;
    assert.equal(windowFor(getState(), { id: 'SP-9609' }), wl());
    assert.equal(windowFor(getState(), { id: 'SP-9610' }), null, 'another study\'s window is not this one\'s');
    assert.equal(windowFor(getState(), null), null);
    // A writer that changes openId without FRESH_VIEW (the calibration screen's return) leaves a window behind: it
    // is not the new study's, and the actions do not touch it.
    setState({ openId: 'SP-9610' });
    assert.equal(windowFor(getState(), { id: 'SP-9610' }), null);
    const stale = wl();
    setWindow({ width: 100, level: 100 });
    closeWindowPanel();
    assert.equal(wl(), stale, 'the actions work on the open study\'s window only');
  });
});

test('forgetFilmWindow drops only that study\'s window', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9611')], 'SP-9611', async () => {
    const done = openWindowPanel();
    calls[0].resolve(decodedOutcome(RAW));
    await done;
    const ready = wl();
    forgetFilmWindow('SP-9612');
    assert.equal(wl(), ready);
    forgetFilmWindow('SP-9611');
    assert.equal(wl(), null);
  });
});

test('openWindowPanel and ensureWindowLoaded do nothing for a demo study or with no study open', async () => {
  const calls = stubFilm();
  await withStore([film('SP-9613', { source: 'demo' })], 'SP-9613', async () => {
    await openWindowPanel();
    await ensureWindowLoaded();
    assert.equal(wl(), null);
    setState({ openId: null });
    await openWindowPanel();
    assert.equal(wl(), null);
    assert.equal(calls.length, 0);
  });
});

test('the window survives entering and leaving edit mode (D15)', async () => {
  const calls = stubFilm();
  configureLevelEditor({
    commitGeometry: () => {},
    getPrediction: () => undefined,
    ensureFilm: async () => ({ images: null, raw: null, reason: null, superseded: false }),
    imageInfo: async () => { throw new Error('not used'); },
  });
  await withStore([film('SP-9614')], 'SP-9614', async () => {
    const done = openWindowPanel();
    calls[0].resolve(decodedOutcome(RAW));
    await done;
    setWindow({ width: 1200, level: 600 });
    closeWindowPanel();
    const before = wl();

    await enterLevelEditor('SP-9614');
    assert.equal(getState().editing, true);
    assert.equal('window' in getState().levelEditor, false, 'the level editor carries no window');
    assert.equal(wl(), before, 'entering edit mode keeps the window');

    openWindowPanel();
    setWindow({ width: 1300, level: 600 });
    const editing = wl();
    exitNow();
    assert.equal(getState().editing, false);
    assert.equal(wl(), editing, 'leaving edit mode keeps the window, the panel too');
    assert.equal(wl().open, true);
    assert.equal(wl().width, 1300);
  });
});
