import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { DEFAULT_PERFORMANCE, progressUpdate, progressTitle, progressDetail, validPerformance,
  processorChoices, processorNote, describeProcessor, processorTitle } from '../renderer/data/processing.js';
import { createBatchDriver } from '../renderer/data/batch.js';
const { postForm, normalizePerformance, normalizeProcessors } = createRequire(import.meta.url)('../backend-client.cjs');

const current = { requestId: 'current', mode: 'low-memory', stage: 'search', message: 'Searching',
  completed: 3, total: 85, elapsed_seconds: 4 };

test('resource defaults agree across the desktop and renderer; invalid settings are rejected', () => {
  assert.deepEqual(normalizePerformance(null), DEFAULT_PERFORMANCE);
  for (const value of [{ mode: 'fast', cpuThreads: 2 }, { mode: 'low-memory', cpuThreads: 0 },
    { mode: 'standard', cpuThreads: 2.5 }, { mode: 'low-memory', cpuThreads: 10 }]) {
    assert.equal(validPerformance(value), false);
    assert.throws(() => normalizePerformance(value));
  }
});

test('crop localizer defaults on for legacy preferences and persists explicit off', () => {
  const legacy = { mode: 'low-memory', cpuThreads: 1 };
  assert.deepEqual(normalizePerformance(legacy), { ...legacy, cropLocalizer: true, cropMethod: 'search', toolbarRemoval: false, processor: 'cpu', embeddings: true });
  const off = { ...legacy, cropLocalizer: false, cropMethod: 'search', toolbarRemoval: false, processor: 'cpu', embeddings: true };
  assert.deepEqual(normalizePerformance(JSON.parse(JSON.stringify(off))), off);
  assert.equal(validPerformance(off), true);
  for (const cropLocalizer of [null, 'false', 0, 1]) {
    assert.throws(() => normalizePerformance({ ...legacy, cropLocalizer }));
    assert.equal(validPerformance({ ...legacy, cropLocalizer }), false);
  }
});

test('toolbar removal defaults off for older preferences and saves independently of crop localizer', () => {
  const legacy = { mode: 'standard', cpuThreads: 2, cropLocalizer: false };
  assert.deepEqual(normalizePerformance(legacy), { ...legacy, cropMethod: 'search', toolbarRemoval: false, processor: 'cpu', embeddings: true });
  for (const toolbarRemoval of [true, false]) {
    const saved = { ...legacy, cropMethod: 'search', toolbarRemoval, processor: 'cpu', embeddings: true };
    assert.deepEqual(normalizePerformance(JSON.parse(JSON.stringify(saved))), saved);
    assert.equal(validPerformance(saved), true);
  }
  for (const toolbarRemoval of [null, 'false', 0, 1]) {
    assert.throws(() => normalizePerformance({ ...legacy, toolbarRemoval }));
    assert.equal(validPerformance({ ...legacy, toolbarRemoval }), false);
  }
});

test('appearance embeddings default on for older preferences and save independently of the other switches', () => {
  const legacy = { mode: 'standard', cpuThreads: 2, cropLocalizer: true, cropMethod: 'search', toolbarRemoval: false, processor: 'cpu' };
  assert.deepEqual(normalizePerformance(legacy), { ...legacy, embeddings: true });
  assert.deepEqual(DEFAULT_PERFORMANCE, { ...legacy, embeddings: true });
  for (const embeddings of [true, false]) {
    const saved = { ...legacy, embeddings };
    assert.deepEqual(normalizePerformance(JSON.parse(JSON.stringify(saved))), saved);
    assert.equal(validPerformance(saved), true);
  }
  for (const embeddings of [null, 'false', 0, 1]) {
    assert.throws(() => normalizePerformance({ ...legacy, embeddings }));
    assert.equal(validPerformance({ ...legacy, embeddings }), false);
  }
});

test('processor defaults to the CPU for older preferences; a GPU id survives save/load and bad ids fail in both', () => {
  const legacy = { mode: 'standard', cpuThreads: 2, cropLocalizer: true, cropMethod: 'search', toolbarRemoval: false, embeddings: true };
  assert.equal(normalizePerformance(legacy).processor, 'cpu');
  for (const processor of ['cpu', 'gpu:10de:2520', 'gpu:10de:2520:2', 'gpu:4d4f4351:36334330']) {
    const saved = { ...legacy, processor };
    assert.deepEqual(normalizePerformance(JSON.parse(JSON.stringify(saved))), saved);
    assert.equal(validPerformance(saved), true);
  }
  for (const processor of [null, '', 'gpu', 'GPU', 'gpu:10DE:2520', 'gpu:10de:2520:1', 'gpu:0', 'NVIDIA GeForce RTX 3060', 0]) {
    assert.throws(() => normalizePerformance({ ...legacy, processor }));
    assert.equal(validPerformance({ ...legacy, processor }), false);
  }
  assert.equal(validPerformance(legacy), false, 'the renderer always carries the field; main migrates files');
});

test('crop method defaults to search and preserves the trained-model choice', () => {
  const legacy = { mode: 'standard', cpuThreads: 2, cropLocalizer: true, toolbarRemoval: false, processor: 'cpu', embeddings: true };
  assert.equal(normalizePerformance(legacy).cropMethod, 'search');
  const selected = { ...legacy, cropMethod: 'model' };
  assert.deepEqual(normalizePerformance(selected), selected);
  assert.equal(validPerformance(selected), true);
  for (const cropMethod of [null, '', 'automatic', 0]) {
    assert.throws(() => normalizePerformance({ ...legacy, cropMethod }));
    assert.equal(validPerformance({ ...legacy, cropMethod }), false);
  }
});

test('the processor list keeps the CPU first and drops anything malformed', () => {
  assert.deepEqual(normalizeProcessors({ processors: [
    { id: 'gpu:10de:2520', kind: 'gpu', name: '  NVIDIA GeForce RTX 3060 Laptop GPU ', memory_mb: 6144 },
    { id: 'cpu', kind: 'cpu', name: 'Some CPU' },
    { id: 'gpu:8086:9a49', kind: 'gpu', name: '' },
    { id: 'NVIDIA', kind: 'gpu', name: 'Spoofed' },
    { id: 'cpu', kind: 'gpu', name: 'Not a GPU' },
    null,
  ] }), [{ id: 'cpu', kind: 'cpu', name: 'CPU' },
    { id: 'gpu:10de:2520', kind: 'gpu', name: 'NVIDIA GeForce RTX 3060 Laptop GPU' }]);
  for (const body of [null, {}, { processors: 'none' }]) {
    assert.deepEqual(normalizeProcessors(body), [{ id: 'cpu', kind: 'cpu', name: 'CPU' }]);
  }
});

test('Settings lists what the backend found and never hides or invents a saved choice', () => {
  const listed = [{ id: 'cpu', kind: 'cpu', name: 'CPU' }, { id: 'gpu:10de:2520', kind: 'gpu', name: 'NVIDIA GeForce RTX 3060' }];
  assert.deepEqual(processorChoices(listed, 'cpu').map((c) => c.label), ['CPU', 'GPU · NVIDIA GeForce RTX 3060']);
  assert.deepEqual(processorChoices(listed, 'gpu:10de:2520').map((c) => c.id), ['cpu', 'gpu:10de:2520']);
  const unplugged = processorChoices(listed, 'gpu:1002:73df');
  assert.deepEqual(unplugged.at(-1), { id: 'gpu:1002:73df', label: 'Saved GPU · not found', missing: true });
  // Before the list arrives (or if it could not be read) the saved GPU is not called missing.
  assert.deepEqual(processorChoices(null, 'gpu:10de:2520').at(-1), { id: 'gpu:10de:2520', label: 'Saved GPU', missing: false });
  assert.deepEqual(processorChoices(null, 'cpu'), [{ id: 'cpu', label: 'CPU', missing: false }]);
  assert.match(processorNote(listed, 'gpu:10de:2520'), /on NVIDIA GeForce RTX 3060 through DirectML/);
  assert.match(processorNote(listed, 'gpu:1002:73df'), /not found/);
  assert.match(processorNote(listed, 'cpu'), /Choose a GPU/);
  assert.match(processorNote(listed.slice(0, 1), 'cpu'), /CPU processing is available/);
  for (const selected of ['cpu', 'gpu:10de:2520']) assert.doesNotMatch(processorNote(null, selected), /was not found|No supported|Checking/);
});

test('a result says where its models ran only from the providers it recorded', () => {
  const gpu = { requested: 'gpu:10de:2520', resolved: 'gpu:10de:2520', name: 'NVIDIA GeForce RTX 3060', note: null };
  const dml = ['DmlExecutionProvider', 'CPUExecutionProvider'];
  const cpu = ['CPUExecutionProvider'];
  const qc = (processor, providers) => ({ processing: { processor, providers } });
  assert.equal(describeProcessor(qc(gpu, { s1: dml, vertebra: dml })), 'GPU');
  assert.equal(processorTitle(qc(gpu, { s1: dml, vertebra: dml })), 'The models ran on NVIDIA GeForce RTX 3060');
  assert.equal(describeProcessor(qc(gpu, { s1: cpu, vertebra: dml })), 'GPU + CPU');
  assert.match(processorTitle(qc(gpu, { s1: cpu, vertebra: dml })), /some fell back to the CPU/);
  const missing = { ...gpu, resolved: 'cpu', name: 'CPU', note: 'The selected GPU was not found; running the models on the CPU' };
  assert.equal(describeProcessor(qc(missing, { s1: cpu })), 'CPU');
  assert.equal(processorTitle(qc(missing, { s1: cpu })), missing.note);
  // Apple's Core ML runs the S1 detector on the CPU here; it is not a GPU.
  assert.equal(describeProcessor(qc({ ...gpu, requested: 'cpu', resolved: 'cpu', name: 'CPU' },
    { s1: ['CoreMLExecutionProvider', 'CPUExecutionProvider'] })), 'CPU');
  // Records from before the setting say nothing rather than guess.
  for (const old of [null, {}, { processing: { providers: { s1: cpu } } }, qc(gpu, {})]) {
    assert.equal(describeProcessor(old), null);
    assert.equal(processorTitle(old), '');
  }
});

test('progress belongs to one request; stale, malformed and cancelled updates do not overwrite it', () => {
  assert.equal(progressUpdate(current, { requestId: 'old', type: 'progress', message: 'Wrong film' }), current);
  assert.equal(progressUpdate(current, { requestId: 'current', type: 'progress', message: null }), current);
  const cancelling = { ...current, cancelling: true };
  assert.equal(progressUpdate(cancelling, { requestId: 'current', type: 'progress', message: 'Done' }), cancelling);
  assert.match(progressTitle(cancelling), /Cancelling/);
  const saving = { ...current, stage: 'saving', message: 'Saving results' };
  assert.equal(progressUpdate(saving, { requestId: 'current', type: 'progress', stage: 'complete', message: 'Done' }), saving);
  assert.equal(progressUpdate(saving, { requestId: 'current', type: 'heartbeat', elapsed_seconds: 30 }), saving);
});

test('heartbeat advances elapsed time while keeping the actual stage and completed count', () => {
  const next = progressUpdate(current, { requestId: 'current', type: 'heartbeat', elapsed_seconds: 600 });
  assert.equal(next.message, 'Searching');
  assert.equal(next.completed, 3);
  assert.equal(progressDetail(next), '3 of 85 regions checked · 10:00 elapsed · Low memory');
  const earlier = progressUpdate(next, { requestId: 'current', type: 'heartbeat', elapsed_seconds: 2 });
  assert.equal(earlier.elapsed_seconds, 600);
  const loading = progressUpdate(next, { requestId: 'current', type: 'progress', stage: 'loading', message: 'Loading model' });
  assert.equal(loading.total, null);
  assert.ok(!progressDetail(loading).includes('85'));
});

async function withServer(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}/predict-stream`;
}
function form() { const value = new FormData(); value.append('file', new Blob(['image']), 'test.png'); return value; }

test('transport reassembles fragmented UTF-8 events and returns a partial result', async t => {
  const url = await withServer(t, (req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    const data = Buffer.from(JSON.stringify({ type: 'progress', message: 'L1–L5', completed: 1, total: 85 }) + '\n');
    const split = data.indexOf(Buffer.from('–')) + 1;
    res.write(data.subarray(0, split));
    setImmediate(() => {
      res.write(data.subarray(split));
      res.end(JSON.stringify({ type: 'result', result: { geometry: { vertebrae: { L1: {} } }, measurements: { PI: null } } }) + '\n');
    });
  });
  const events = [];
  const result = await postForm(url, form(), { onProgress: event => events.push(event) });
  assert.equal(events[0].message, 'L1–L5');
  assert.equal(result.measurements.PI, null);
  assert.deepEqual(Object.keys(result.geometry.vertebrae), ['L1']);
});

test('heartbeats let jobs run longer than the idle deadline without a total timeout', async t => {
  const url = await withServer(t, (req, res) => {
    req.resume(); res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    let ticks = 0;
    res.write('{"type":"heartbeat"}\n');
    const interval = setInterval(() => {
      res.write('{"type":"heartbeat"}\n');
      if (++ticks === 25) { clearInterval(interval); res.end('{"type":"result","result":{"ok":true}}\n'); }
    }, 50);
    res.on('close', () => clearInterval(interval));
  });
  assert.deepEqual(await postForm(url, form(), { idleMs: 1000 }), { ok: true });
});

test('cancel closes the local request and never returns a late success', async t => {
  let closed;
  const disconnected = new Promise(resolve => { closed = resolve; });
  const controller = new AbortController();
  const url = await withServer(t, (req, res) => {
    req.resume(); res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.on('close', closed);
    res.write('{"type":"progress","message":"Searching"}\n');
  });
  await assert.rejects(postForm(url, form(), { signal: controller.signal, onProgress: () => controller.abort() }), /Processing cancelled/);
  await disconnected;
});

test('backend validation errors and truncated streams are failures', async t => {
  for (const [body, type, status, expected] of [
    ['{"detail":"Bad settings"}', 'application/json', 422, /Bad settings/],
    ['{"type":"error","message":"No usable anatomy"}\n', 'application/x-ndjson', 200, /No usable anatomy/],
    ['{"type":"heartbeat"}\n', 'application/x-ndjson', 200, /before a result/],
  ]) {
    const url = await withServer(t, (req, res) => { req.resume(); res.writeHead(status, { 'content-type': type }); res.end(body); });
    await assert.rejects(postForm(url, form()), expected);
  }
});

test('a silent processing connection times out instead of hanging indefinitely', async t => {
  const url = await withServer(t, (req, res) => { req.resume(); res.writeHead(200, { 'content-type': 'application/x-ndjson' }); res.flushHeaders(); });
  await assert.rejects(postForm(url, form(), { idleMs: 50 }), /stopped responding/);
});

test('cancelling an image stops its batch without marking untouched studies failed', async () => {
  let state = { studies: ['A', 'B'].map(id => ({ id, addedAt: id, view: 'Standing lateral', measurements: null })), batch: null };
  const called = [], messages = [];
  const driver = createBatchDriver({ getState: () => state,
    setState: patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; },
    persistenceDisabledReason: () => null, showToast: message => messages.push(message),
    segment: async id => { called.push(id); state.batch = { ...state.batch, stopping: true }; return { skipped: true, cancelled: true }; },
  });
  await driver.startBatch(['A', 'B']);
  assert.deepEqual(called, ['A']);
  assert.equal(state.batch, null);
  assert.ok(state.studies.every(s => s.measurements === null));
  assert.match(messages[0], /1 cancelled/);
  assert.ok(!messages[0].includes('deleted'));
});
