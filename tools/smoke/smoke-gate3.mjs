// Gate 3 smoke (after Task 18; rewritten 2026-10-10 for the level editor): Tab / Shift+Tab across every handle of
// every placed level, arrow nudges (1px, 10px with Shift, one /measure per burst), Tab inside the edit bar not
// hijacked, RESET TO PREDICTION restoring the recorded prediction with no /measure, Re-run segmentation (disabled
// while editing, R17; then the run card and the new reset target), no console errors. Expects last-run.json beside
// it: the run-and-wait output for the open study (its measurements are the reset target).
//
// The level editor's Tab order (viewer/level-handles.js handleOrder) replaces the old fixed 24-stop TAB_ORDER: every
// handle of every visible, placed level in panel order, a femoral head's four rim points included. Arrow keys nudge
// the focused handle (state.levelEditor.handle), set here through the page's renderer/level-editor.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(HERE, 'out', 'app.log');
const measureCount = () => (fs.readFileSync(LOG, 'utf8').match(/POST \/measure HTTP\/1\.1" 200/g) || []).length;
const lastRun = JSON.parse(fs.readFileSync(path.join(HERE, 'out', 'last-run.json'), 'utf8'));
// GATE3_STAGE=16 runs the keyboard sections; 17 adds reset; 18 (default) adds re-run.
const STAGE = Number(process.env.GATE3_STAGE || 18);
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sameHandle = (a, b) => Boolean(a && b) && a.code === b.code && a.handle === b.handle;

const cdp = await connect();
// A 1600x1100 viewport: in a small window the edit bar covers the sample film's upper landmarks.
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
// Gesture assertions inspect the live preview. The Study's geometry changes only
// after recalculation; inspect it separately to verify the atomic commit.
const geometry = () => cdp.evaluate(`import('./renderer/store.js').then((m) => { const st = m.getState(); return st.measurementDrafts?.[st.openId] ?? st.studies.find((x) => x.id === st.openId).geometry; })`);
const savedGeometry = () => cdp.evaluate(`import('./renderer/store.js').then((m) => { const st = m.getState(); return st.studies.find((x) => x.id === st.openId).geometry; })`);
const measurements = () => cdp.evaluate(`import('./renderer/store.js').then((m) => { const st = m.getState(); return st.studies.find((x) => x.id === st.openId).measurements; })`);
const editor = () => cdp.evaluate(`import('./renderer/store.js').then((m) => m.getState().levelEditor)`);
const focusHandle = (code, handle) => cdp.evaluate(`import('./renderer/level-editor.js').then((m) => { m.selectLevelRow(${JSON.stringify(code)}); m.setFocusedHandle({ code: ${JSON.stringify(code)}, handle: ${JSON.stringify(handle)} }); return true; })`);
const editBarButton = (selector) => cdp.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, disabled: b.disabled, text: b.textContent.trim() }; })()`);
// The edit bar's buttons have no class of their own; in components/viewer.js's order RESET TO PREDICTION is the
// next to last and DONE the last.
const RESET = '.viewer-editbar > button:nth-last-of-type(2)';
const DONE = '.viewer-editbar > button:last-of-type';
const blur = () => cdp.evaluate('(() => { const a = document.activeElement; if (a && a.blur) a.blur(); return true; })()');
async function waitForMeasure(before) {
  const key = JSON.stringify(before);
  for (let i = 0; i < 40; i += 1) {
    await cdp.settle(100);
    const now = await measurements();
    if (JSON.stringify(now) !== key) return now;
  }
  return null;
}
async function waitFor(predicateSource, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(`import('./renderer/store.js').then((m) => { const s = m.getState(); return Boolean(${predicateSource}); })`)) return true;
    await cdp.settle(150);
  }
  return false;
}
async function enterEdit() {
  const edit = await cdp.rect('.viewer-tool[aria-label="Edit segmentation"]');
  if (edit) await cdp.click(edit.cx, edit.cy);
  await cdp.settle(250);
  return (await cdp.state()).editing === true;
}

try {
  let s = await cdp.state();
  check('precondition: analysis screen with a result', s.screen === 'analysis' && s.studies.some((x) => x.id === s.openId && x.geometry), s.openId);
  await cdp.setState('{ editing: false, levelEditor: null, selection: null, zoom: 1, panX: 0, panY: 0, panMode: false, selectedLevel: null }');
  await cdp.settle(120);
  await enterEdit();
  await blur();

  // 1. Tab walks every handle of every placed level in panel order and wraps; Shift+Tab wraps backward. The order is
  // written out here from the rule (L1-L5 SA SP IA IP, S1 SA SP, each head R0-R3), not read from handleOrder.
  const e0 = await editor();
  const expected = [];
  for (const code of ['L1', 'L2', 'L3', 'L4', 'L5']) if (e0.levels[code].visible && e0.levels[code].geometry) for (const handle of ['SA', 'SP', 'IA', 'IP']) expected.push({ code, handle });
  if (e0.levels.S1.visible && e0.levels.S1.geometry) expected.push({ code: 'S1', handle: 'SA' }, { code: 'S1', handle: 'SP' });
  for (const code of ['FH1', 'FH2']) if (e0.levels[code].visible && e0.levels[code].geometry) for (const handle of ['R0', 'R1', 'R2', 'R3']) expected.push({ code, handle });
  const mismatches = [];
  for (let i = 0; i < expected.length; i += 1) {
    await cdp.key('Tab');
    await cdp.settle(20);
    const e = await editor();
    if (!sameHandle(e.handle, expected[i]) || e.selected !== expected[i].code) mismatches.push([i, e.handle, e.selected]);
  }
  check(`Tab walks all ${expected.length} handles in panel order, selecting each handle's level`, expected.length >= 4 && mismatches.length === 0, mismatches.slice(0, 3));
  await cdp.key('Tab');
  await cdp.settle(20);
  check('Tab wraps from the last handle to the first', sameHandle((await editor()).handle, expected[0]), (await editor()).handle);
  await cdp.key('Tab', { shift: true });
  await cdp.settle(20);
  check('Shift+Tab wraps from the first handle to the last', sameHandle((await editor()).handle, expected[expected.length - 1]), (await editor()).handle);
  check('Tab did not move document focus around the page', await cdp.evaluate(`document.activeElement === document.body || document.activeElement.closest('.viewer-toolbar') !== null`), await cdp.evaluate('document.activeElement.tagName + "." + document.activeElement.className'));

  // 2. Arrow nudges on L3 SA: 5 x ArrowRight then Shift+ArrowUp = (+5, -10) image px, one /measure.
  await focusHandle('L3', 'SA');
  await cdp.settle(80);
  let g0 = await geometry();
  let m0 = await measurements();
  let logBefore = measureCount();
  for (let i = 0; i < 5; i += 1) await cdp.key('ArrowRight');
  await cdp.key('ArrowUp', { shift: true });
  let g1 = await geometry();
  check('five ArrowRight then Shift+ArrowUp moves L3 SA by (+5, -10) image px', near(g1.vertebrae.L3.superior[0][0] - g0.vertebrae.L3.superior[0][0], 5, 1e-6) && near(g1.vertebrae.L3.superior[0][1] - g0.vertebrae.L3.superior[0][1], -10, 1e-6), [g0.vertebrae.L3.superior[0], g1.vertebrae.L3.superior[0]]);
  check('unmeasured nudge preview leaves the saved geometry unchanged', JSON.stringify(await savedGeometry()) === JSON.stringify(g0));
  let m1 = await waitForMeasure(m0);
  await cdp.settle(400);
  check('a burst of six nudges is exactly one /measure', measureCount() - logBefore === 1 && m1 !== null, measureCount() - logBefore);
  check('LL updates after the nudge burst', m1 && m1.LL['L3-S1'] !== m0.LL['L3-S1'], m1 && [m0.LL['L3-S1'], m1.LL['L3-S1']]);
  check('successful nudge calculation commits the preview geometry', JSON.stringify(await savedGeometry()) === JSON.stringify(g1));

  // 3. Arrow keys still nudge when a row of the levels panel has focus.
  await cdp.evaluate(`document.querySelector('[data-level-key="L3"]').focus()`);
  await focusHandle('L3', 'SA');
  await cdp.evaluate(`document.querySelector('[data-level-key="L3"]').focus()`);
  g0 = await geometry();
  await cdp.key('ArrowLeft');
  await cdp.settle(50);
  g1 = await geometry();
  check('ArrowLeft nudges while a levels-panel row has focus', near(g1.vertebrae.L3.superior[0][0] - g0.vertebrae.L3.superior[0][0], -1, 1e-6), [g0.vertebrae.L3.superior[0][0], g1.vertebrae.L3.superior[0][0]]);
  await waitForMeasure(await measurements());

  // 4. Tab inside the edit bar is ordinary focus movement.
  const before = (await editor()).handle;
  await cdp.evaluate(`document.querySelector(${JSON.stringify(RESET)}).focus()`);
  await cdp.key('Tab');
  await cdp.settle(50);
  const focusInBar = await cdp.evaluate(`document.activeElement.closest('.viewer-editbar') !== null`);
  check('Tab inside the edit bar moves focus instead of cycling handles', sameHandle((await editor()).handle, before) && focusInBar, [(await editor()).handle, focusInBar]);
  await blur();

  if (STAGE >= 17) {
  // 5. RESET TO PREDICTION restores the recorded prediction exactly, with no /measure.
  logBefore = measureCount();
  const reset = await editBarButton(RESET);
  check('RESET TO PREDICTION present and enabled', reset && reset.disabled === false && reset.text === 'RESET TO PREDICTION', reset);
  await cdp.click(reset.cx, reset.cy);
  await cdp.settle(300);
  const e = await editor();
  g1 = await geometry();
  m1 = await measurements();
  check('reset clears the focused handle', e && e.handle === null, e && e.handle);
  check('reset restores the prediction measurements exactly', JSON.stringify(m1) === JSON.stringify(lastRun.measurements), [m1 && m1.PI, lastRun.measurements.PI]);
  check('reset restores the predicted femoral circles exactly', JSON.stringify(g1.femoral_circles) === JSON.stringify(lastRun.femoral), g1.femoral_circles);
  check('reset makes no /measure call', measureCount() - logBefore === 0, measureCount() - logBefore);
  }

  if (STAGE >= 18) {
  // 6. Re-run segmentation: disabled while editing (R17); once edit mode is left, the run card shows and the new
  // prediction becomes the reset target.
  const rerun = await cdp.rect('.viewer-tool[aria-label="Re-run segmentation"]');
  check('Re-run button present', Boolean(rerun), rerun);
  const whileEditing = await cdp.evaluate(`(() => { const b = document.querySelector('.viewer-tool[aria-label="Re-run segmentation"]'); return { disabled: b.disabled, title: b.title }; })()`);
  check('Re-run is disabled while editing (R17)', whileEditing.disabled === true && whileEditing.title === 'Finish editing before re-running segmentation', whileEditing);
  const done = await editBarButton(DONE);
  await cdp.click(done.cx, done.cy);
  await cdp.settle(200);
  const afterDone = await cdp.evaluate(`(() => { const b = document.querySelector('.viewer-tool[aria-label="Re-run segmentation"]'); return { disabled: b.disabled, title: b.title }; })()`);
  check('Re-run is enabled again once edit mode is left', (await cdp.state()).editing === false && afterDone.disabled === false, afterDone);
  await cdp.click(rerun.cx, rerun.cy);
  // state.running is the running study's id, not a boolean (Task 9 of plan 05).
  const sawRunning = await waitFor('s.running !== null', 3000);
  const cardVisible = await cdp.evaluate(`(() => { const c = document.querySelector('.run-card'); return c && !c.classList.contains('is-hidden'); })()`);
  check('re-run sets running and shows the run card over an existing result', sawRunning && cardVisible, [sawRunning, cardVisible]);
  const finished = await waitFor('s.running === null && s.studies.find((x) => x.id === s.openId).measurements', 240000);
  s = await cdp.state();
  check('re-run completes', finished && !s.running, [finished, s.running, s.toast]);
  check('re-run leaves edit mode off and no level editor', s.editing === false && s.levelEditor === null, [s.editing, s.levelEditor]);
  const cardHidden = await cdp.evaluate(`document.querySelector('.run-card').classList.contains('is-hidden')`);
  check('run card hidden again after the re-run', cardHidden === true, cardHidden);
  const newPrediction = await measurements();
  await enterEdit();
  await focusHandle('L2', 'SP');
  await blur();
  await cdp.settle(80);
  await cdp.key('ArrowRight', { shift: true });
  await waitForMeasure(newPrediction);
  const reset2 = await editBarButton(RESET);
  await cdp.click(reset2.cx, reset2.cy);
  await cdp.settle(300);
  m1 = await measurements();
  check('after a re-run, reset returns to the NEW prediction', JSON.stringify(m1) === JSON.stringify(newPrediction), [m1 && m1.PI, newPrediction.PI]);

  }

  await cdp.setState('{ editing: false, levelEditor: null, selection: null }');
  check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);
} finally {
  cdp.close();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
