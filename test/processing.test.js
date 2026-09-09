import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { DEFAULT_PERFORMANCE, progressUpdate, progressTitle, progressDetail, validPerformance } from '../renderer/data/processing.js';
import { createBatchDriver } from '../renderer/data/batch.js';
const { postForm, normalizePerformance } = createRequire(import.meta.url)('../backend-client.cjs');

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

test('progress belongs to one request; stale, malformed and cancelled updates do not overwrite it', () => {
  assert.equal(progressUpdate(current, { requestId: 'old', type: 'progress', message: 'Wrong film' }), current);
  assert.equal(progressUpdate(current, { requestId: 'current', type: 'progress', message: null }), current);
  const cancelling = { ...current, cancelling: true };
  assert.equal(progressUpdate(cancelling, { requestId: 'current', type: 'progress', message: 'Done' }), cancelling);
  assert.match(progressTitle(cancelling), /Cancelling/);
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
      if (++ticks === 12) { clearInterval(interval); res.end('{"type":"result","result":{"ok":true}}\n'); }
    }, 25);
    res.on('close', () => clearInterval(interval));
  });
  assert.deepEqual(await postForm(url, form(), { idleMs: 150 }), { ok: true });
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
