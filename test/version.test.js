import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERSION_LABEL } from '../renderer/data/version.js';

test('welcome and sidebar version matches the installer manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION_LABEL, `v${manifest.version}`);
});
