// The Electron main-process files are never imported by the other suites, so a
// syntax error in them would only surface when the packaged app fails to start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const file of ['main.js', 'preload.js', 'backend-client.cjs']) {
  test(`${file} parses`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath,
      ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { stdio: 'pipe' }));
  });
}
