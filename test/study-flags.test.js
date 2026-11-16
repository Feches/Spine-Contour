/**
 * The one writer of a study's flags (study-flags spec §4.8, 2026-11-16): renderer/study-flags.js, through the real
 * store, with the main process's label-record channels stubbed on `window.spineContour` as
 * test/level-editor-wiring.test.js stubs them. The store is put back after every test. Every film is SP-96nn, an id no
 * other test file uses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getState, setState, subscribe } from '../renderer/store.js';
import { newStudy } from '../renderer/screens/studies.js';
import { setFlagsBusy, flagsRefusal, setStudyFlags } from '../renderer/study-flags.js';

const STORED_AT = '2026-10-01T00:00:00.000Z';

const studyOf = (id) => getState().studies.find((study) => study.id === id);

function film(id, patch = {}) {
  return { ...newStudy({ id, fileName: `lumbar_${id.slice(3)}.png`, filePath: null }), ...patch };
}

// The label folder: a load reads the last record saved under that name, else the seeded one; `onSave` may refuse.
function folderBridge(seed = {}, onSave = null) {
  const saved = [];
  const spineContour = {
    saveLabelRecord: async (name, record) => {
      saved.push({ name, record: structuredClone(record) });
      if (onSave) await onSave(name, record);
    },
    deleteLabelRecord: async () => {},
    loadLabelRecord: async (name) => {
      const last = saved.filter((entry) => entry.name === name).at(-1);
      if (last) return structuredClone(last.record);
      return Object.hasOwn(seed, name) ? structuredClone(seed[name]) : null;
    },
  };
  return { spineContour, saved };
}

async function withLibrary(studies, bridge, body) {
  const before = getState();
  const had = Object.hasOwn(globalThis, 'window');
  const previous = globalThis.window;
  globalThis.window = { spineContour: bridge.spineContour };
  try {
    setState({ studies, deletingStudies: false, toast: '' });
    await body();
  } finally {
    setFlagsBusy(null);
    if (had) globalThis.window = previous;
    else delete globalThis.window;
    setState(before);
  }
}

test('setStudyFlags writes one store update and leaves everything else alone', async () => {
  const a = film('SP-9600', { reviewedAt: '2026-11-01T00:00:00.000Z', measurements: { SS: 40 } });
  const b = film('SP-9601');
  await withLibrary([a, b], folderBridge(), async () => {
    let fired = 0;
    const unsubscribe = subscribe(() => { fired += 1; });
    try {
      const result = await setStudyFlags([{ id: a.id, flags: [' hardware ', 'Hardware'] }, { id: b.id, flags: [] }]);
      assert.deepEqual(result, { changed: [a.id], failed: [] });
    } finally {
      unsubscribe();
    }
    const after = studyOf(a.id);
    assert.deepEqual(after.flags, ['hardware']);
    assert.notEqual(after, a, 'a new object');
    assert.equal(after.reviewedAt, a.reviewedAt);
    assert.equal(after.labelFile, a.labelFile);
    assert.equal(after.measurements, a.measurements);
    assert.equal(studyOf(b.id), b, 'an unchanged study keeps its reference');
    assert.deepEqual(a.flags, [], 'the old study was not mutated');
    assert.equal(fired, 1, 'one store update');
  });
});

test('setStudyFlags ignores a demo study and an unknown id', async () => {
  const demo = film('SP-9602', { source: 'demo' });
  await withLibrary([demo], folderBridge(), async () => {
    const studies = getState().studies;
    const result = await setStudyFlags([{ id: demo.id, flags: ['cement'] }, { id: 'SP-9699', flags: ['cement'] }]);
    assert.deepEqual(result.changed, []);
    assert.equal(getState().studies, studies, 'the studies array is the same reference');
  });
});

test('setStudyFlags refuses while a delete, an import or an export runs', async () => {
  const study = film('SP-9603');
  const bridge = folderBridge();
  await withLibrary([study], bridge, async () => {
    setState({ deletingStudies: true });
    const studies = getState().studies;
    assert.deepEqual(await setStudyFlags([{ id: study.id, flags: ['cement'] }]), { changed: [], failed: [] });
    assert.equal(getState().studies, studies, 'nothing written');
    assert.equal(flagsRefusal(), 'Wait for the delete to finish.');
    assert.equal(getState().toast, 'Wait for the delete to finish.', 'the refusal is said');
    setState({ deletingStudies: false });

    setFlagsBusy('import');
    assert.equal(flagsRefusal(), 'Wait for the import to finish.');
    assert.deepEqual(await setStudyFlags([{ id: study.id, flags: ['cement'] }]), { changed: [], failed: [] });
    setFlagsBusy('export');
    assert.equal(flagsRefusal(), 'Wait for the export to finish.');
    assert.deepEqual(await setStudyFlags([{ id: study.id, flags: ['cement'] }]), { changed: [], failed: [] });
    assert.equal(getState().studies, studies, 'still nothing written');

    setFlagsBusy(null);
    assert.equal(flagsRefusal(), '');
    assert.equal(flagsRefusal({ deletingStudies: true }), 'Wait for the delete to finish.', 'reads the state it is given');
    assert.equal(bridge.saved.length, 0);
  });
});

test('setStudyFlags reports a record it could not update, once', async () => {
  const file = 'lumbar_9604.label.json';
  const study = film('SP-9604', { labelFile: file });
  const bridge = folderBridge({ [file]: { saved_at: STORED_AT, flags: [] } }, async () => { throw new Error('refused'); });
  await withLibrary([study], bridge, async () => {
    const result = await setStudyFlags([{ id: study.id, flags: ['cement'] }]);
    assert.deepEqual(result, { changed: [study.id], failed: [study.id] });
    assert.deepEqual(studyOf(study.id).flags, ['cement'], 'the study\'s flags stand');
    assert.equal(bridge.saved.length, 1, 'one attempt');
    assert.equal(getState().toast, 'Flags saved. The label record could not be updated for 1 film.');
  });
});
