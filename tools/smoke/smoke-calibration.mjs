// Real desktop + local OCR smoke. Pass three local example files as arguments;
// images and results stay outside git. Run on a fresh scratch profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './cdp-lib.mjs';
const files = process.argv.slice(2).map(file => path.resolve(file));
if (files.length !== 3) throw new Error('Pass the three example image paths (27.1, 35.8 and 41.5 mm).');
const c = await connect();
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
async function waitFor(expression, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await c.evaluate(expression)) return;
    await c.settle(150);
  }
  throw new Error(`Timed out: ${expression}`);
}
try {
  const folder = path.dirname(files[0]);
  await c.setState(JSON.stringify({ ack: true, screen: 'calibration', studies: [], wsFolder: folder, wsFiles: files,
    calibrationRequest: { folder, files } }));
  await waitFor("document.querySelector('#folder-message')?.textContent.includes('3 of 3 images calibrated') && !document.querySelector('#calibration-continue').disabled");
  check('folder auto-detects all three without teaching a reference', true);
  const options = await c.evaluate("[...document.querySelector('#folder-image').options].map(o => o.textContent)");
  check('each image has its own detected result', options.length === 3 && options.every(s => s.endsWith('detected')));
  await c.screenshot(path.resolve('tools/smoke/out/calibration-folder.png'));
  await c.evaluate("document.querySelector('#calibration-continue').click()");
  await waitFor("import('./renderer/store.js').then(m => m.getState().screen === 'workspace')");
  await c.evaluate("[...document.querySelectorAll('button')].find(b => /Load.*workspace/i.test(b.textContent)).click()");
  await waitFor("import('./renderer/store.js').then(m => m.getState().studies.length === 3)");
  const studies = (await c.state()).studies;
  check('workspace studies receive independent reference values', studies.map(s => s.calibration.candidates[s.calibration.selected_index].value_mm).sort((a,b) => a-b).join(',') === '27.1,35.8,41.5');
  check('study metadata contains no calibration previews', studies.every(s => !('image_png' in s.calibration)));
  const first = studies.find(s => s.filePath === files[0]);
  await c.setState(JSON.stringify({ screen: 'calibration', openId: first.id,
    calibrationRequest: { studyId: first.id, filePath: first.filePath } }));
  await waitFor("document.querySelector('#calibration-value')?.value === '27.1' && !document.querySelector('#calibration-canvas').hidden");
  await c.evaluate("(() => { const v = document.querySelector('#calibration-value'); v.value = '30'; v.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('#calibration-apply').click(); })()");
  const corrected = (await c.state()).studies.find(s => s.id === first.id).calibration;
  check('manual correction is saved on the correct study', corrected.status === 'corrected' && corrected.candidates[0].value_mm === 30);
  await c.setState(JSON.stringify({ screen: 'calibration', calibrationRequest: { folder, files } }));
  await waitFor("document.querySelector('#folder-message')?.textContent.includes('3 of 3 images calibrated') && !document.querySelector('#calibration-continue').disabled");
  check('reopening the folder preserves the saved manual correction', (await c.state()).studies.find(s => s.id === first.id).calibration.candidates[0].value_mm === 30);
  await c.evaluate("document.querySelector('#folder-run').click(); document.querySelector('#folder-stop').click()");
  await c.settle(1200);
  check('stop keeps completed results and enables continue', await c.evaluate("document.querySelector('#folder-stop').disabled && !document.querySelector('#calibration-continue').disabled"));
  const persisted = await c.evaluate("import('./renderer/api.js').then(m => m.loadStudies()).then(s => s.map(x => ({id:x.id,calibration:x.calibration})))");
  check('calibration and manual correction survive a disk round-trip', persisted.find(s => s.id === first.id)?.calibration.candidates[0].value_mm === 30);
  check('no renderer console errors', c.errors.length === 0);
  fs.writeFileSync(path.resolve('tools/smoke/out/calibration-results.json'), JSON.stringify({ checks, studies: (await c.state()).studies.map(s => ({id:s.id,calibration:s.calibration})) }, null, 2));
} finally { c.close(); }
