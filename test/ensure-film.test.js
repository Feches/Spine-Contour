/**
 * ensureFilm (2026-10-10, level editor, Task 8): the open study's film and its decoded original for
 * the display-only window / level. The window-stub harness of test/failure-run.test.js: the bridge
 * is stubbed on globalThis.window; `document`, `ImageData` and `createImageBitmap` get the minimum
 * imagesFromRaw, loadStudyImages and thumbnailDataUri need (a stub canvas or bitmap records its own
 * close(), so a disposal is visible); the store and globals are put back after every test. Every
 * film is SP-98nn, an id no other test file uses, and no two tests here share one.
 *
 * Not covered here: the toolbar crop and the width check on a stored image, and the hand-off to a
 * live viewer (render() is never called here, so no study is ever on screen). The pure parts are in
 * test/window-level.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newStudy } from '../renderer/screens/studies.js';
import { ensureFilm, segmentStudy, setFilePayload } from '../renderer/screens/analysis.js';
import { getState, setState } from '../renderer/store.js';

const ADDED_AT = '2026-10-10T08:00:00.000Z';
const BYTES = new Uint8Array([1, 2, 3]);

function film(id, patch = {}) {
  return { ...newStudy({ id, fileName: `${id}.dcm`, filePath: null }), addedAt: ADDED_AT, ...patch };
}

const outcome = (reason, superseded = false) => ({ images: null, raw: null, reason, superseded });

// What the main process's decode-film handler returns: two pixels, values 0 and 100.
function decoded() {
  return { width: 2, height: 1, bitsStored: 16, valueMin: 0, valueMax: 100, window: null, scaled: false,
    pixels: new Uint8Array([0, 0, 100, 0]) };
}

class FakeImageData {
  constructor(data, width, height) { Object.assign(this, { data, width, height }); }
}

// A canvas with the 2D calls the film code makes. close() exists only so a test can see that
// disposeStudyImages reached it (a real canvas has none, and the code calls close?.()).
function fakeCanvas() {
  return {
    width: 0, height: 0, closed: false,
    close() { this.closed = true; },
    getContext: () => ({
      drawImage() {}, clearRect() {}, putImageData() {},
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    }),
    toDataURL: () => 'data:image/jpeg;base64,AAAA',
  };
}

async function withBridge(t, bridge, studies, body) {
  const saved = getState();
  const globals = { window: globalThis.window, document: globalThis.document, ImageData: globalThis.ImageData,
    createImageBitmap: globalThis.createImageBitmap };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = { spineContour: bridge };
  globalThis.document = { createElement: () => fakeCanvas() };
  globalThis.ImageData = FakeImageData;
  // The stored image and mask of a result: 2 x 1, the decoded original's size.
  globalThis.createImageBitmap = async () => ({ width: 2, height: 1, closed: false, close() { this.closed = true; } });
  try {
    setState({ studies, running: null, runStage: null, batch: null, deletingStudies: false, toast: '' });
    await body();
  } finally {
    Object.assign(globalThis, globals);
    setState(saved);
  }
}

test('a film with no result is decoded once and shown from its original pixels', async (t) => {
  const study = film('SP-9800');
  const requests = [];
  const bridge = { decodeFilm: async (request) => { requests.push(request); return decoded(); } };
  await withBridge(t, bridge, [study], async () => {
    setFilePayload(study.id, BYTES);
    const first = await ensureFilm(study.id);
    assert.equal(first.reason, null);
    assert.equal(first.superseded, false);
    assert.deepEqual(requests, [{ name: 'SP-9800.dcm', data: BYTES }]);
    assert.deepEqual([...first.raw.pixels], [0, 100]);
    assert.equal(first.raw.scale, 1);
    assert.equal(first.images.raw, first.raw);
    assert.equal(first.images.preview, true);
    assert.equal(first.images.mask, null);
    assert.equal(first.images.overlayCanvas, null);
    assert.deepEqual([first.images.width, first.images.height], [2, 1]);
    const second = await ensureFilm(study.id);
    assert.equal(requests.length, 1, 'the cached raw is reused');
    assert.equal(second.raw, first.raw);
    assert.equal(second.images, first.images);
    assert.equal(second.reason, null);
  });
});

test('two calls in flight for one study share one decode', async (t) => {
  const study = film('SP-9801');
  let decodes = 0;
  const bridge = { decodeFilm: async () => { decodes += 1; return decoded(); } };
  await withBridge(t, bridge, [study], async () => {
    setFilePayload(study.id, BYTES);
    const [a, b] = await Promise.all([ensureFilm(study.id), ensureFilm(study.id)]);
    assert.equal(decodes, 1);
    assert.equal(a.raw, b.raw);
    assert.equal(a.images, b.images);
  });
});

test('a film with no bytes and no path says the source film could not be found', async (t) => {
  const study = film('SP-9802');
  const bridge = { decodeFilm: async () => assert.fail('nothing to decode') };
  await withBridge(t, bridge, [study], async () => {
    assert.deepEqual(await ensureFilm(study.id), outcome('The source film could not be found.'));
  });
});

test('a decode failure is the reason, without the IPC prefix, and nothing throws', async (t) => {
  const study = film('SP-9803');
  const message = 'The upload is not a readable image or grayscale DICOM file';
  const bridge = { decodeFilm: async () => { throw new Error(`Error invoking remote method 'decode-film': Error: ${message}`); } };
  await withBridge(t, bridge, [study], async () => {
    setFilePayload(study.id, BYTES);
    assert.deepEqual(await ensureFilm(study.id), outcome(message));
  });
});

test('an incomplete decode is a reason, not a throw', async (t) => {
  const study = film('SP-9804');
  const bridge = { decodeFilm: async () => ({ ...decoded(), pixels: new Uint8Array([0, 0]) }) };
  await withBridge(t, bridge, [study], async () => {
    setFilePayload(study.id, BYTES);
    assert.deepEqual(await ensureFilm(study.id), outcome('The decoded film is incomplete.'));
  });
});

test('a study deleted during the decode is superseded with no reason, and a new film under its id decodes afresh', async (t) => {
  const study = film('SP-9805');
  const reused = film('SP-9805', { addedAt: '2026-10-10T09:00:00.000Z', fileName: 'other.png' });
  const names = [];
  const bridge = {
    decodeFilm: async ({ name }) => {
      names.push(name);
      // The first decode resolves after the record is deleted and its id reused by another film.
      if (names.length === 1) setState({ studies: [reused] });
      return decoded();
    },
  };
  await withBridge(t, bridge, [study], async () => {
    setFilePayload(study.id, BYTES);
    assert.deepEqual(await ensureFilm(study.id), outcome(null, true));
    const fresh = await ensureFilm(study.id);
    assert.equal(fresh.reason, null);
    assert.equal(fresh.superseded, false);
    assert.deepEqual(names, ['SP-9805.dcm', 'other.png'], 'the stale decode was not cached for the new film');
  });
});

test('a study that is not in the library is a reason', async (t) => {
  await withBridge(t, {}, [], async () => {
    assert.deepEqual(await ensureFilm('SP-9806'), outcome('The study is no longer in the library.'));
  });
});

// Review finding I1: a film shown from its decoded original, then segmented by a batch while off
// screen, must not keep that preview as its film. The batch drops and closes the study's cache entry,
// so the next ensureFilm restores the new sidecar (stored image and mask) and decodes afresh.
test('a batch run of an off-screen study drops its cached preview, so the result is restored next time', async (t) => {
  const study = film('SP-9807');
  const sidecars = new Map();
  let decodes = 0;
  const bridge = {
    decodeFilm: async () => { decodes += 1; return decoded(); },
    predict: async () => ({ measurements: { SS: 40 }, geometry: { region: 'lumbar', vertebrae: {} }, qc: null,
      image_png: 'AAAA', mask_png: 'AAAA', labels: {} }),
    savePrediction: async (id, response) => { sidecars.set(id, structuredClone(response)); },
    loadPrediction: async (id) => sidecars.get(id) ?? null,
  };
  await withBridge(t, bridge, [study], async () => {
    setFilePayload(study.id, BYTES);
    const before = await ensureFilm(study.id);
    assert.equal(before.images.preview, true);
    assert.deepEqual(await segmentStudy(study.id, { batch: true }), { ok: true });
    assert.equal(before.images.image.closed, true, 'the stale preview was disposed');
    const after = await ensureFilm(study.id);
    assert.equal(after.reason, null);
    assert.notEqual(after.images, before.images);
    assert.equal(after.images.preview, undefined, 'the stored image, not the preview');
    assert.ok(after.images.overlayCanvas, 'the result carries its mask overlay');
    assert.notEqual(after.raw, before.raw);
    assert.equal(decodes, 2);
    assert.equal(after.images.image.closed, false);
  });
});
