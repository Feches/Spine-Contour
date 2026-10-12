import { test } from 'node:test';
import assert from 'node:assert/strict';

// disablePersistence is irreversible module state with no re-enable, so this test lives in its
// own file: node --test runs each test file in its own process, which removes any hazard from
// running after (or before) another test that touches the same module instance.
async function withWindow(windowValue, fn) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previousWindow = globalThis.window;
  globalThis.window = windowValue;
  try {
    await fn();
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
}

test('after disablePersistence, saveStudies and savePrediction reject without touching the bridge', async () => {
  const { disablePersistence, persistenceDisabledReason, saveStudies, savePrediction } = await import('../renderer/api.js');
  let touched = 0;
  await withWindow({ spineContour: { saveStudies: async () => { touched += 1; }, savePrediction: async () => { touched += 1; } } }, async () => {
    assert.equal(persistenceDisabledReason(), null);
    disablePersistence('the store was written by a newer version');
    assert.equal(persistenceDisabledReason(), 'the store was written by a newer version');
    await assert.rejects(saveStudies([]), /not being saved: the store was written by a newer version/);
    await assert.rejects(savePrediction('SP-1000', {}), /not being saved/);
    assert.equal(touched, 0);
  });
});

// Appended by plan 05's final review (Minor 1). Runs after the test above, which has already
// disabled persistence -- that is the state the guard has to survive.
test('a falsy reason cannot re-enable persistence: the contract has no re-enable path', async () => {
  const { disablePersistence, persistenceDisabledReason, saveStudies } = await import('../renderer/api.js');
  const original = persistenceDisabledReason();
  assert.ok(original, 'precondition: persistence is already disabled by the test above');

  for (const bad of ['', null, undefined, 0, false, '   ']) {
    disablePersistence(bad);
    assert.equal(persistenceDisabledReason(), original, `disablePersistence(${JSON.stringify(bad)}) cleared the reason`);
  }

  await withWindow({ spineContour: { saveStudies: async () => { throw new Error('the bridge must not be reached'); } } }, async () => {
    await assert.rejects(saveStudies([]), /not being saved/);
  });
});

// Appended by plan 06 Task 7. Runs after the two tests above, so persistence is already off.
test('after disablePersistence, deletePrediction rejects without touching the bridge', async () => {
  const { deletePrediction, persistenceDisabledReason } = await import('../renderer/api.js');
  assert.ok(persistenceDisabledReason(), 'precondition: persistence is already disabled by the first test');
  let touched = 0;
  await withWindow({ spineContour: { deletePrediction: async () => { touched += 1; } } }, async () => {
    await assert.rejects(deletePrediction('SP-1000'), /not being saved/);
  });
  assert.equal(touched, 0);
});

// Appended by the level editor's Task 6. The label record is a write like any other: after
// disablePersistence the save and the delete reject without touching the bridge, while the load is a
// read and still reaches it (loadPrediction is the precedent). Runs after the tests above, so
// persistence is already off.
test('after disablePersistence, saveLabelRecord and deleteLabelRecord reject without touching the bridge; loadLabelRecord still reads', async () => {
  const { saveLabelRecord, deleteLabelRecord, loadLabelRecord, persistenceDisabledReason } = await import('../renderer/api.js');
  const reason = persistenceDisabledReason();
  assert.ok(reason, 'precondition: persistence is already disabled by the first test');
  let writes = 0;
  const reads = [];
  await withWindow({
    spineContour: {
      saveLabelRecord: async () => { writes += 1; },
      deleteLabelRecord: async () => { writes += 1; },
      loadLabelRecord: async (name) => { reads.push(name); return null; },
    },
  }, async () => {
    await assert.rejects(saveLabelRecord('a.label.json', {}), (err) => {
      assert.match(err.message, /not being saved/);
      assert.ok(err.message.includes(reason));
      return true;
    });
    await assert.rejects(deleteLabelRecord('a.label.json'), (err) => {
      assert.match(err.message, /not being saved/);
      assert.ok(err.message.includes(reason));
      return true;
    });
    assert.equal(await loadLabelRecord('a.label.json'), null);
  });
  assert.equal(writes, 0);
  assert.deepEqual(reads, ['a.label.json']);
});
