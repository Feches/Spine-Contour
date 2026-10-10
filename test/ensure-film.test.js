/**
 * ensureFilm (2026-10-10, level editor, Task 8): the open study's film and its decoded original for
 * the display-only window / level. The window-stub harness of test/failure-run.test.js: the bridge
 * is stubbed on globalThis.window, `document` and `ImageData` get the minimum imagesFromRaw needs,
 * and the store and globals are put back after every test. Every film is SP-98nn, an id no other
 * test file uses, and no two tests here share one.
 *
 * Not covered here: a study with a result (the sidecar restore and the stored image need
 * createImageBitmap), the toolbar crop and the width check on a stored image, and the hand-off to a
 * live viewer (render() is never called here). The pure parts are in test/window-level.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newStudy } from '../renderer/screens/studies.js';
import { ensureFilm, setFilePayload } from '../renderer/screens/analysis.js';
import { getState, setState } from '../renderer/store.js';

const ADDED_AT = '2026-10-10T08:00:00.000Z';
const BYTES = new Uint8Array([1, 2, 3]);

function film(id, patch = {}) {
  return { ...newStudy({ id, fileName: `${id}.dcm`, filePath: null }), addedAt: ADDED_AT, ...patch };
}

// What the main process's decode-film handler returns: two pixels, values 0 and 100.
function decoded() {
  return { width: 2, height: 1, bitsStored: 16, valueMin: 0, valueMax: 100, window: null, scaled: false,
    pixels: new Uint8Array([0, 0, 100, 0]) };
}

class FakeImageData {
  constructor(data, width, height) { Object.assign(this, { data, width, height }); }
}

async function withBridge(t, bridge, studies, body) {
  const saved = getState();
  const globals = { window: globalThis.window, document: globalThis.document, ImageData: globalThis.ImageData };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = { spineContour: bridge };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {} }) }) };
  globalThis.ImageData = FakeImageData;
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
    assert.deepEqual(await ensureFilm(study.id), { images: null, raw: null, reason: 'The source film could not be found.' });
  });
});

test('a decode failure is the reason, without the IPC prefix, and nothing throws', async (t) => {
  const study = film('SP-9803');
  const message = 'The upload is not a readable image or grayscale DICOM file';
  const bridge = { decodeFilm: async () => { throw new Error(`Error invoking remote method 'decode-film': Error: ${message}`); } };
  await withBridge(t, bridge, [study], async () => {
    setFilePayload(study.id, BYTES);
    assert.deepEqual(await ensureFilm(study.id), { images: null, raw: null, reason: message });
  });
});

test('an incomplete decode is a reason, not a throw', async (t) => {
  const study = film('SP-9804');
  const bridge = { decodeFilm: async () => ({ ...decoded(), pixels: new Uint8Array([0, 0]) }) };
  await withBridge(t, bridge, [study], async () => {
    setFilePayload(study.id, BYTES);
    assert.deepEqual(await ensureFilm(study.id), { images: null, raw: null, reason: 'The decoded film is incomplete.' });
  });
});

test('a study deleted during the decode is superseded, and a new film under its id decodes afresh', async (t) => {
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
    assert.deepEqual(await ensureFilm(study.id), { images: null, raw: null, reason: 'superseded' });
    const fresh = await ensureFilm(study.id);
    assert.equal(fresh.reason, null);
    assert.deepEqual(names, ['SP-9805.dcm', 'other.png'], 'the stale decode was not cached for the new film');
  });
});

test('a study that is not in the library is a reason', async (t) => {
  await withBridge(t, {}, [], async () => {
    assert.deepEqual(await ensureFilm('SP-9806'), { images: null, raw: null, reason: 'The study is no longer in the library.' });
  });
});
