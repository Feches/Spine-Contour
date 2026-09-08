import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toastDuration, TOAST_MIN_MS, TOAST_MAX_MS } from '../renderer/components/toast.js';

test('toastDuration is 2.2 s up to forty characters, then 40 ms per character, capped at 8 s', () => {
  assert.equal(TOAST_MIN_MS, 2200);
  assert.equal(TOAST_MAX_MS, 8000);
  assert.equal(toastDuration(''), 2200);
  assert.equal(toastDuration(null), 2200);
  assert.equal(toastDuration(undefined), 2200);
  assert.equal(toastDuration('x'.repeat(40)), 2200);
  assert.equal(toastDuration('x'.repeat(41)), 2240);
  assert.equal(toastDuration('x'.repeat(150)), 6600);
  assert.equal(toastDuration('x'.repeat(185)), 8000);
  assert.equal(toastDuration('x'.repeat(400)), 8000);
});
