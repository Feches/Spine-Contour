import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predict, measure, loadStudies, readFile, pathForFile, storeLoadNotice, persistenceDisabledReason, chooseFolder, scanFolder, chooseCsv, readCsv, deletePrediction, loadLabelRecord, saveLabelRecord, deleteLabelRecord, exportBundle, readBundle, hashFilms, importBundle } from '../renderer/api.js';

const GENERIC_FALLBACK_MESSAGE = 'The application encountered an unexpected error.';
const BRIDGE_UNAVAILABLE_MESSAGE =
  'The application bridge is unavailable. Try restarting Spine Contour.';

// api.js reads the bare identifier `window`, which resolves through the
// module's global scope to `globalThis.window`. Each test stubs it and
// restores the previous value in `finally` so no test leaks state into the
// next one (tests in this file run sequentially, same as test/store.test.js,
// but nothing here should rely on that beyond what this helper already does).
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

test('a plain Error message passes through with the inner message preserved', async () => {
  await withWindow({ spineContour: { predict: async () => { throw new Error('boom'); } } }, async () => {
    await assert.rejects(predict({}), (err) => {
      assert.equal(err.message, 'boom');
      return true;
    });
  });
});

test('a TypeError IPC wrapper strips down to the inner message (Fix 1 regression)', async () => {
  await withWindow({
    spineContour: {
      predict: async () => {
        throw new Error("Error invoking remote method 'predict': TypeError: fetch failed");
      },
    },
  }, async () => {
    await assert.rejects(predict({}), (err) => {
      assert.equal(err.message, 'fetch failed');
      return true;
    });
  });
});

test('a RangeError IPC wrapper strips down to the inner message (Fix 1 regression)', async () => {
  await withWindow({
    spineContour: {
      measure: async () => {
        throw new Error("Error invoking remote method 'measure': RangeError: bad port");
      },
    },
  }, async () => {
    await assert.rejects(measure({}), (err) => {
      assert.equal(err.message, 'bad port');
      return true;
    });
  });
});

test('a plain Error IPC wrapper strips down to the inner message', async () => {
  await withWindow({
    spineContour: {
      measure: async () => {
        throw new Error("Error invoking remote method 'measure': Error: bad geometry");
      },
    },
  }, async () => {
    await assert.rejects(measure({}), (err) => {
      assert.equal(err.message, 'bad geometry');
      return true;
    });
  });
});

test('a wrapper whose inner message itself contains "Error: " keeps the inner text intact', async () => {
  await withWindow({
    spineContour: {
      predict: async () => {
        throw new Error("Error invoking remote method 'predict': Error: Model Error: weights missing");
      },
    },
  }, async () => {
    await assert.rejects(predict({}), (err) => {
      assert.equal(err.message, 'Model Error: weights missing');
      return true;
    });
  });
});

test('a bare message containing "Error: " with no IPC wrapper passes through whole', async () => {
  await withWindow({
    spineContour: {
      predict: async () => {
        throw new Error('Something Error: still here');
      },
    },
  }, async () => {
    await assert.rejects(predict({}), (err) => {
      assert.equal(err.message, 'Something Error: still here');
      return true;
    });
  });
});

test('a thrown undefined yields the generic fallback message', async () => {
  await withWindow({ spineContour: { predict: async () => { throw undefined; } } }, async () => {
    await assert.rejects(predict({}), (err) => {
      assert.equal(err.message, GENERIC_FALLBACK_MESSAGE);
      return true;
    });
  });
});

test('a thrown null yields the generic fallback message', async () => {
  await withWindow({ spineContour: { predict: async () => { throw null; } } }, async () => {
    await assert.rejects(predict({}), (err) => {
      assert.equal(err.message, GENERIC_FALLBACK_MESSAGE);
      return true;
    });
  });
});

test('a thrown bare object yields the generic fallback message', async () => {
  await withWindow({ spineContour: { predict: async () => { throw {}; } } }, async () => {
    await assert.rejects(predict({}), (err) => {
      assert.equal(err.message, GENERIC_FALLBACK_MESSAGE);
      return true;
    });
  });
});

test('an Error with an empty message yields the generic fallback message', async () => {
  await withWindow({ spineContour: { predict: async () => { throw new Error(''); } } }, async () => {
    await assert.rejects(predict({}), (err) => {
      assert.equal(err.message, GENERIC_FALLBACK_MESSAGE);
      return true;
    });
  });
});

test('a missing window.spineContour bridge yields the bridge-unavailable message', async () => {
  await withWindow({}, async () => {
    await assert.rejects(predict({}), (err) => {
      assert.equal(err.message, BRIDGE_UNAVAILABLE_MESSAGE);
      return true;
    });
  });
});

const IDENTITY = { id: 'SP-1000', source: 'real', fileName: 'film.dcm', addedAt: '2026-08-31T12:00:00.000Z', view: 'Standing lateral' };

test('loadStudies validates the raw store the bridge returns and fills in defaults', async () => {
  await withWindow({ spineContour: { loadStudies: async () => ({ version: 1, studies: [IDENTITY] }) } }, async () => {
    const studies = await loadStudies();
    assert.equal(studies.length, 1);
    assert.equal(studies[0].measurements, null);
    assert.deepEqual(studies[0].clinical, {});
  });
});

test('loadStudies rejects with a display-ready message when the store is not usable', async () => {
  await withWindow({ spineContour: { loadStudies: async () => ({ version: 2, studies: [] }) } }, async () => {
    await assert.rejects(loadStudies(), /version 2 is not supported/);
  });
  await withWindow({ spineContour: { loadStudies: async () => [] } }, async () => {
    await assert.rejects(loadStudies(), /not an object/);
  });
});

const QUARANTINE_NOTICE =
  'Your saved studies could not be read and were moved aside as studies.json.corrupt-42 '
  + '(with predictions.corrupt-42). Spine-Contour is running on the demo studies. To recover, '
  + 'quit and rename both back.';

test('storeLoadNotice is null before any load', () => {
  assert.equal(storeLoadNotice(), null);
});

test('loadStudies carries the raw store notice to storeLoadNotice and still validates', async () => {
  await withWindow({
    spineContour: {
      loadStudies: async () => ({ version: 1, studies: [IDENTITY], notice: QUARANTINE_NOTICE }),
    },
  }, async () => {
    const studies = await loadStudies();
    assert.equal(studies.length, 1);
    assert.equal(studies[0].id, 'SP-1000');
    assert.equal(storeLoadNotice(), QUARANTINE_NOTICE);
    // A quarantine alone leaves persistence ON: the empty store is a genuine fresh library
    // and its sidecars went aside with it, so nothing of the user's can be overwritten.
    assert.equal(persistenceDisabledReason(), null);
  });
});

test('storeLoadNotice reflects the LAST load: a healthy store clears it again', async () => {
  await withWindow({ spineContour: { loadStudies: async () => ({ version: 1, studies: [] }) } }, async () => {
    await loadStudies();
    assert.equal(storeLoadNotice(), null);
  });
});

test('a non-string or empty notice is treated as no notice', async () => {
  await withWindow({ spineContour: { loadStudies: async () => ({ version: 1, studies: [], notice: '' }) } }, async () => {
    await loadStudies();
    assert.equal(storeLoadNotice(), null);
  });
  await withWindow({ spineContour: { loadStudies: async () => ({ version: 1, studies: [], notice: { bad: true } }) } }, async () => {
    await loadStudies();
    assert.equal(storeLoadNotice(), null);
  });
});

test('readFile passes a null (missing file) through as null', async () => {
  await withWindow({ spineContour: { readFile: async () => null } }, async () => {
    assert.equal(await readFile('C:/missing.dcm'), null);
  });
});

test('pathForFile returns the bridge path, and null for a missing bridge, an empty path, or a throw', async () => {
  await withWindow({ spineContour: { pathForFile: () => 'C:/films/a.dcm' } }, async () => { assert.equal(pathForFile({}), 'C:/films/a.dcm'); });
  await withWindow({ spineContour: { pathForFile: () => '' } }, async () => { assert.equal(pathForFile({}), null); });
  await withWindow({ spineContour: { pathForFile: () => { throw new Error('nope'); } } }, async () => { assert.equal(pathForFile({}), null); });
  await withWindow({}, async () => { assert.equal(pathForFile({}), null); });
});

// Workspace pickers and readers (plan 06). The two pickers resolve null on cancel, which the
// renderer treats as "nothing happened" -- the wrapper must hand that null through untouched.
test('chooseFolder and chooseCsv pass a cancelled picker (bridge null) through as null, and a chosen path as-is', async () => {
  await withWindow({ spineContour: { chooseFolder: async () => null, chooseCsv: async () => null } }, async () => {
    assert.equal(await chooseFolder(), null);
    assert.equal(await chooseCsv(), null);
  });
  await withWindow({ spineContour: { chooseFolder: async () => 'C:/films', chooseCsv: async () => 'C:/films/clinical.csv' } }, async () => {
    assert.equal(await chooseFolder(), 'C:/films');
    assert.equal(await chooseCsv(), 'C:/films/clinical.csv');
  });
});

test('scanFolder forwards the path and strips the IPC wrapper down to the handler message', async () => {
  const seen = [];
  await withWindow({
    spineContour: {
      scanFolder: async (dirPath) => {
        seen.push(dirPath);
        if (!dirPath) throw new Error("Error invoking remote method 'scan-folder': Error: No folder was selected.");
        return { files: [`${dirPath}/a.png`], skipped: 1 };
      },
    },
  }, async () => {
    assert.deepEqual(await scanFolder('C:/films'), { files: ['C:/films/a.png'], skipped: 1 });
    await assert.rejects(scanFolder(''), (err) => {
      assert.equal(err.message, 'No folder was selected.');
      return true;
    });
    assert.deepEqual(seen, ['C:/films', '']);
  });
});

test('readCsv forwards the path and strips the IPC wrapper down to the handler message', async () => {
  const seen = [];
  await withWindow({
    spineContour: {
      readCsv: async (filePath) => {
        seen.push(filePath);
        if (filePath.endsWith('missing.csv')) throw new Error("Error invoking remote method 'read-csv': Error: The CSV file was not found.");
        return 'study_id,age\r\na,58\r\n';
      },
    },
  }, async () => {
    assert.equal(await readCsv('C:/films/clinical.csv'), 'study_id,age\r\na,58\r\n');
    await assert.rejects(readCsv('C:/films/missing.csv'), (err) => {
      assert.equal(err.message, 'The CSV file was not found.');
      return true;
    });
    assert.deepEqual(seen, ['C:/films/clinical.csv', 'C:/films/missing.csv']);
  });
});

test('without the bridge, chooseFolder, scanFolder, chooseCsv and readCsv all reject with the bridge-unavailable message', async () => {
  await withWindow({}, async () => {
    // Thunks, not promises: a rejected promise created before its handler is attached would
    // trip Node's unhandled-rejection check while an earlier assert.rejects is still awaiting.
    const calls = [() => chooseFolder(), () => scanFolder('C:/films'), () => chooseCsv(), () => readCsv('C:/films/clinical.csv')];
    for (const call of calls) {
      await assert.rejects(call, (err) => {
        assert.equal(err.message, BRIDGE_UNAVAILABLE_MESSAGE);
        return true;
      });
    }
  });
});

test('deletePrediction hands the id to the bridge and strips the IPC prefix from a rejection', async () => {
  const calls = [];
  await withWindow({ spineContour: { deletePrediction: async (id) => { calls.push(id); } } }, async () => {
    assert.equal(await deletePrediction('SP-1000'), undefined);
    assert.deepEqual(calls, ['SP-1000']);
  });
  await withWindow({
    spineContour: {
      deletePrediction: async () => {
        throw new Error("Error invoking remote method 'delete-prediction': Error: Invalid study id.");
      },
    },
  }, async () => {
    await assert.rejects(deletePrediction('SP-0030'), (err) => {
      assert.equal(err.message, 'Invalid study id.');
      return true;
    });
  });
});

test('the label-record wrappers hand the name (and record) to the bridge and strip the IPC prefix from a rejection', async () => {
  const calls = [];
  const record = { schema_version: 1 };
  await withWindow({
    spineContour: {
      loadLabelRecord: async (name) => { calls.push(['load', name]); return record; },
      saveLabelRecord: async (name, value) => { calls.push(['save', name, value]); },
      deleteLabelRecord: async (name) => { calls.push(['delete', name]); },
    },
  }, async () => {
    assert.equal(await loadLabelRecord('a.label.json'), record);
    assert.equal(await saveLabelRecord('a.label.json', record), undefined);
    assert.equal(await deleteLabelRecord('a.label.json'), undefined);
    assert.deepEqual(calls, [['load', 'a.label.json'], ['save', 'a.label.json', record], ['delete', 'a.label.json']]);
  });
  await withWindow({
    spineContour: {
      saveLabelRecord: async () => {
        throw new Error("Error invoking remote method 'save-label-record': Error: Invalid label file name.");
      },
    },
  }, async () => {
    await assert.rejects(saveLabelRecord('..', {}), (err) => {
      assert.equal(err.message, 'Invalid label file name.');
      return true;
    });
  });
});

test('without the bridge, the label-record wrappers reject with the bridge-unavailable message', async () => {
  await withWindow({}, async () => {
    const calls = [() => loadLabelRecord('a.label.json'), () => saveLabelRecord('a.label.json', {}), () => deleteLabelRecord('a.label.json')];
    for (const call of calls) {
      await assert.rejects(call, (err) => {
        assert.equal(err.message, BRIDGE_UNAVAILABLE_MESSAGE);
        return true;
      });
    }
  });
});

// (2026-10-15, annotation bundles) Persistence is on in this file, so importBundle reaches the bridge too; its gate is
// tested in api-persistence.test.js, where disablePersistence's irreversible state cannot leak into other tests.
test('the four bundle channels forward their arguments to the bridge', async () => {
  const calls = [];
  const exportRequest = { parent: 'C:/out', name: 'spinecontour-bundle-2026-10-15-1432', entries: [{ dir: 'a' }], appVersion: '1.2.0' };
  const importRequest = { dir: 'C:/out/bundle', actions: [{ kind: 'add', dir: 'a', id: 'SP-1001' }] };
  const filmPaths = ['C:/films/a.dcm', 'C:/films/b.dcm'];
  const results = {
    exportBundle: { path: 'C:/out/spinecontour-bundle-2026-10-15-1432', written: 1, filmsMissing: [], notRead: [] },
    readBundle: { manifest: { schema: 'spinecontour.bundle/1', studies: [] }, entries: [] },
    hashFilms: { 'C:/films/a.dcm': 'a'.repeat(64), 'C:/films/b.dcm': null },
    importBundle: { placed: ['SP-1001'], failed: null },
  };
  const bridge = {};
  for (const name of Object.keys(results)) {
    bridge[name] = async (...args) => { calls.push([name, ...args]); return results[name]; };
  }
  await withWindow({ spineContour: bridge }, async () => {
    assert.equal(await exportBundle(exportRequest), results.exportBundle);
    assert.equal(await readBundle('C:/out/bundle'), results.readBundle);
    assert.equal(await hashFilms(filmPaths), results.hashFilms);
    assert.equal(await importBundle(importRequest), results.importBundle);
  });
  assert.deepEqual(calls, [
    ['exportBundle', exportRequest],
    ['readBundle', 'C:/out/bundle'],
    ['hashFilms', filmPaths],
    ['importBundle', importRequest],
  ]);
  assert.equal(calls[0][1], exportRequest, 'the request object itself is handed on');

  // A handler's display-ready sentence arrives without Electron's IPC prefix.
  await withWindow({
    spineContour: {
      readBundle: async () => {
        throw new Error("Error invoking remote method 'read-bundle': Error: This folder is not a Spine Contour bundle.");
      },
    },
  }, async () => {
    await assert.rejects(readBundle('C:/films'), { message: 'This folder is not a Spine Contour bundle.' });
  });

  // Without the bridge, all four reject with the bridge-unavailable message.
  await withWindow({}, async () => {
    const thunks = [() => exportBundle(exportRequest), () => readBundle('C:/out/bundle'), () => hashFilms(filmPaths), () => importBundle(importRequest)];
    for (const call of thunks) await assert.rejects(call, { message: BRIDGE_UNAVAILABLE_MESSAGE });
  });
});
