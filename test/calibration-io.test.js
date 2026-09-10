import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCalibrationStore } from '../calibration-io.js';
import { discRows } from '../renderer/data/disc-heights.js';

const payload = Buffer.from('one image');
const digest = createHash('sha256').update(payload).digest('hex');
function reference(value = 25) {
  return { version: 1, source_sha256: digest, width: 500, height: 500,
    coordinate_space: 'original_image', status: 'corrected', selected_index: 0,
    candidates: [{ value_mm: value, length_px: 100, endpoints: [[400, 50], [400, 150]], status: 'accepted' }],
    spacing: { row_mm: value / 100, column_mm: value / 100, source: 'manual_reference' }, image_png: 'preview' };
}
async function scratch(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'spine-reference-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('manual reference survives restart before any study exists and supplies disc heights', async t => {
  const dir = await scratch(t);
  const store = createCalibrationStore(dir);
  assert.equal(await store.forImage(payload), null);
  await store.save(reference());
  const restarted = createCalibrationStore(dir);
  const calibration = await restarted.forImage(payload);
  assert.equal(calibration.spacing.row_mm, .25);
  assert.equal(calibration.review_revision, 1);
  assert.equal(calibration.image_png, undefined);
  const geometry = { vertebrae: { L1: { inferior: [[100, 100], [200, 100]] },
    L2: { superior: [[100, 140], [200, 120]] } } };
  const row = discRows({ geometry, calibration });
  assert.deepEqual([row[0].anterior, row[0].middle, row[0].posterior], [10, 7.5, 5]);
  assert.equal(await restarted.forImage(Buffer.from('different image')), null);
  assert.equal((await readdir(dir)).length, 1, 'no image bytes or studies are created');
});

test('queued saves finish before segmentation lookup; latest reference and clear survive restart', async t => {
  const dir = await scratch(t);
  const store = createCalibrationStore(dir);
  const writes = [store.save(reference(25)), store.save(reference(50))];
  assert.equal((await store.forImage(payload)).spacing.row_mm, .5);
  await Promise.all(writes);
  const cleared = { ...reference(), status: 'cleared', spacing: null, selected_index: null };
  await store.save(cleared);
  const saved = await createCalibrationStore(dir).forImage(payload);
  assert.equal(saved.status, 'cleared');
  assert.equal(saved.spacing, null);
  assert.equal(saved.review_revision, 3);
});

test('invalid references cannot replace a saved scale or escape the reference directory', async t => {
  const dir = await scratch(t);
  const store = createCalibrationStore(dir);
  await store.save(reference());
  for (const patch of [{ source_sha256: '../escape' }, { width: 10 }, { spacing: null }, { status: 'not_found' }]) {
    await assert.rejects(store.save({ ...reference(), ...patch }), /Invalid/);
  }
  assert.equal((await store.forImage(payload)).spacing.row_mm, .25);
});

test('corrupt or future reference records report an error and are never overwritten', async t => {
  const dir = await scratch(t);
  const file = path.join(dir, digest + '.json');
  const store = createCalibrationStore(dir);
  for (const raw of ['{broken', JSON.stringify({ ...reference(), version: 99 })]) {
    await writeFile(file, raw);
    await assert.rejects(store.forImage(payload), /saved reference/);
    await assert.rejects(store.save(reference()), /saved reference/);
    assert.equal(await readFile(file, 'utf8'), raw);
  }
});
