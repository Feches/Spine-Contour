// Gate 2 smoke (after Task 14; rewritten 2026-10-10 for the level editor): a handle drag with one /measure per
// release, an S1 drag, a femoral rim-point drag that refits the head (hip_midpoint resync, PT), re-placing a head
// from rim points with FIT, cancelling a placement, no console errors. Trusted input via cdp-lib. Assumes the app is
// running with a segmented study open on Analysis, and reads /measure counts from app.log.
//
// The level editor (plan 2026-10-10) gives only the SELECTED level handles, so every drag selects its level first
// through the page's own renderer/level-editor.js (selectLevelRow). A femoral head has rim points, not a centre and
// a circumference: a rim-point drag refits it through its rim, and RETRACE became the panel's Place… on a head
// (2 to 4 rim points, FIT from 2). Retired 2026-10-10, each named in tools/smoke/README.md: the centre-drag checks,
// "rim drag leaves the centre alone", the 9 o'clock circumference grab, the radius floor at 1 and its toast,
// "clicking the left centre selects it" (no centre handle), and "RETRACE enabled with a femoral selection" and
// "RETRACE toggles on" (no RETRACE), the last three replaced by "Place… on Head 1 starts a rim placement".
// "a landmark selection disables RETRACE" became "selecting another level's row cancels the placement".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp-lib.mjs';

const LOG = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'app.log');
const measureCount = () => (fs.readFileSync(LOG, 'utf8').match(/POST \/measure HTTP\/1\.1" 200/g) || []).length;
// GATE2_STAGE=12 runs the landmark/S1 drag sections; 13 adds the femoral rim drag; 14 (default) adds rim placement.
const STAGE = Number(process.env.GATE2_STAGE || 14);
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const cdp = await connect();
// A 1600x1100 viewport: in a small window the edit bar covers the sample film's upper landmarks.
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
// Drag checks inspect the preview before the debounce settles. Measurements
// below still come from the committed Study and must update through /measure.
const geometry = () => cdp.evaluate(`import('./renderer/store.js').then((m) => { const st = m.getState(); return st.measurementDrafts?.[st.openId] ?? st.studies.find((x) => x.id === st.openId).geometry; })`);
const measurements = () => cdp.evaluate(`import('./renderer/store.js').then((m) => { const st = m.getState(); return st.studies.find((x) => x.id === st.openId).measurements; })`);
const editor = () => cdp.evaluate(`import('./renderer/store.js').then((m) => m.getState().levelEditor)`);
const selectRow = (code) => cdp.evaluate(`import('./renderer/level-editor.js').then((m) => { m.selectLevelRow(${JSON.stringify(code)}); return true; })`);
const rimOf = (code) => cdp.evaluate(`import('./renderer/viewer/level-handles.js').then(async (h) => { const e = (await import('./renderer/store.js')).getState().levelEditor; const g = e?.levels?.${code}?.geometry; return g ? h.levelHandles('${code}', g).map((x) => x.point) : null; })`);
// The edit bar's buttons have no class of their own; FIT carries an aria-label, DONE is the last.
const fitButton = () => cdp.evaluate(`(() => { const b = document.querySelector('.viewer-editbar [aria-label="Fit the circle to the rim points"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, disabled: b.disabled, hidden: b.classList.contains('is-hidden') }; })()`);
const rectOf = (selector) => cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
async function clickSelector(selector) {
  const r = await rectOf(selector);
  if (r) await cdp.click(r.cx, r.cy);
  await cdp.settle(100);
  return Boolean(r);
}
// Waits until the store's measurements object changes from `before` (a /measure landed), up to 4 s.
async function waitForMeasure(before) {
  const key = JSON.stringify(before);
  for (let i = 0; i < 40; i += 1) {
    await cdp.settle(100);
    const now = await measurements();
    if (JSON.stringify(now) !== key) return now;
  }
  return null;
}
const pixelRatio = () => cdp.evaluate(`(() => { const c = document.querySelector('.viewer-canvas-dynamic'); return c.width / c.getBoundingClientRect().width; })()`);

try {
  let s = await cdp.state();
  check('precondition: analysis screen with a result', s.screen === 'analysis' && s.studies.some((x) => x.id === s.openId && x.geometry), s.openId);
  await cdp.setState('{ editing: false, levelEditor: null, selection: null, zoom: 1, panX: 0, panY: 0, panMode: false, selectedLevel: null }');
  await cdp.settle(120);
  await clickSelector('.viewer-tool[aria-label="Edit segmentation"]');
  await cdp.settle(200);
  await selectRow('L2');
  await cdp.settle(120);
  const pr = await pixelRatio();

  // 1. Handle drag: L2 SP (its superior endplate drives LL L2-S1) by (+12, +9) CSS px, one /measure, geometry committed as a move.
  let g0 = await geometry();
  let m0 = await measurements();
  let logBefore = measureCount();
  const l2sp = await cdp.toClient(g0.vertebrae.L2.superior[1][0], g0.vertebrae.L2.superior[1][1]);
  await cdp.drag(l2sp.x, l2sp.y, l2sp.x + 12, l2sp.y + 9, { steps: 8 });
  await cdp.settle(50);
  let e = await editor();
  check('dragging L2 SP focuses that handle', e && e.handle && e.handle.code === 'L2' && e.handle.handle === 'SP', e && e.handle);
  let g1 = await geometry();
  check('L2 SP moved by the pointer delta in image space', near(g1.vertebrae.L2.superior[1][0] - g0.vertebrae.L2.superior[1][0], 12 * pr, 1.5 * pr) && near(g1.vertebrae.L2.superior[1][1] - g0.vertebrae.L2.superior[1][1], 9 * pr, 1.5 * pr), [g0.vertebrae.L2.superior[1], g1.vertebrae.L2.superior[1], pr]);
  check('quadrilateral kept in sync with the moved corner', JSON.stringify(g1.vertebrae.L2.quadrilateral[1]) === JSON.stringify(g1.vertebrae.L2.superior[1]), g1.vertebrae.L2.quadrilateral);
  let m1 = await waitForMeasure(m0);
  check('measurements update after the release', m1 && m1.LL['L2-S1'] !== m0.LL['L2-S1'], m1 && [m0.LL['L2-S1'], m1.LL['L2-S1']]);
  await cdp.settle(300);
  check('exactly one /measure for one drag', measureCount() - logBefore === 1, measureCount() - logBefore);

  // 2. A jittery drag with one release is still one /measure.
  logBefore = measureCount();
  m0 = await measurements();
  const l2spNow = await cdp.toClient(g1.vertebrae.L2.superior[1][0], g1.vertebrae.L2.superior[1][1]);
  await cdp.mouse('mouseMoved', l2spNow.x, l2spNow.y);
  await cdp.mouse('mousePressed', l2spNow.x, l2spNow.y, { button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 0; i < 12; i += 1) await cdp.mouse('mouseMoved', l2spNow.x + (i % 2 ? 15 : -15), l2spNow.y + (i % 3), { button: 'left', buttons: 1 });
  await cdp.mouse('mouseMoved', l2spNow.x - 12, l2spNow.y - 9, { button: 'left', buttons: 1 });
  await cdp.mouse('mouseReleased', l2spNow.x - 12, l2spNow.y - 9, { button: 'left', buttons: 0, clickCount: 1 });
  m1 = await waitForMeasure(m0);
  await cdp.settle(300);
  check('a jittery drag with one release is exactly one /measure', measureCount() - logBefore === 1 && m1 !== null, measureCount() - logBefore);

  // 3. S1 SA drag changes SS.
  await selectRow('S1');
  await cdp.settle(120);
  g0 = await geometry();
  m0 = await measurements();
  const s1sa = await cdp.toClient(g0.s1_superior[0][0], g0.s1_superior[0][1]);
  await cdp.drag(s1sa.x, s1sa.y, s1sa.x, s1sa.y - 8);
  m1 = await waitForMeasure(m0);
  check('dragging S1 SA changes sacral slope', m1 && m1.SS !== m0.SS, m1 && [m0.SS, m1.SS]);

  if (STAGE >= 13) {
  // 4. A rim-point drag refits Head 2 through its rim; hip_midpoint is resynced and PT changes. A model head has
  // no rim of its own: its handles sit on four synthesised points (-45, 45, 135, 225 degrees), and the drag keeps
  // all four as the head's rim from then on.
  await selectRow('FH2');
  await cdp.settle(120);
  g0 = await geometry();
  m0 = await measurements();
  const rim = await rimOf('FH2');
  const [rcx, rcy, rr] = g0.femoral_circles[1];
  // Outward along R0's own radius, by 8 CSS px.
  const ux = (rim[0][0] - rcx) / rr;
  const uy = (rim[0][1] - rcy) / rr;
  const r0 = await cdp.toClient(rim[0][0], rim[0][1]);
  await cdp.drag(r0.x, r0.y, r0.x + 8 * ux, r0.y + 8 * uy);
  await cdp.settle(50);
  g1 = await geometry();
  check('a rim-point drag refits Head 2: its radius grows', g1.femoral_circles[1][2] > rr + 0.5, [rr, g1.femoral_circles[1][2]]);
  e = await editor();
  const rimAfter = e?.levels?.FH2?.geometry?.rim;
  check('the refit head keeps its four rim points, the dragged one moved', Array.isArray(rimAfter) && rimAfter.length === 4 && (rimAfter[0][0] !== rim[0][0] || rimAfter[0][1] !== rim[0][1]), rimAfter);
  m1 = await waitForMeasure(m0);
  g1 = await geometry();
  check('hip_midpoint is the mean of the centres after the commit', near(g1.hip_midpoint[0], (g1.femoral_circles[0][0] + g1.femoral_circles[1][0]) / 2, 1e-6) && near(g1.hip_midpoint[1], (g1.femoral_circles[0][1] + g1.femoral_circles[1][1]) / 2, 1e-6), g1.hip_midpoint);
  check('PT changes after a rim-point drag', m1 && m1.PT !== m0.PT, m1 && [m0.PT, m1.PT]);
  }

  if (STAGE >= 14) {
  // 5. Re-place Head 1 from rim points: Place…, three points on a known circle, FIT.
  g0 = await geometry();
  await clickSelector('[data-level-key="place:FH1"]');
  e = await editor();
  // `placing.points` holds one slot per rim point, null until set (gate feedback G2, 2026-10-11): an empty start is all null.
  check('Place… on Head 1 starts a rim placement', e && e.placing && e.placing.code === 'FH1' && e.placing.points.every((p) => p === null), e && e.placing);
  const target = { cx: g0.femoral_circles[0][0] + 6, cy: g0.femoral_circles[0][1] - 4, r: Math.max(8, g0.femoral_circles[0][2] * 0.8) };
  const angles = [10, 100, 190];
  for (const [i, deg] of angles.entries()) {
    const p = await cdp.toClient(target.cx + target.r * Math.cos((deg * Math.PI) / 180), target.cy + target.r * Math.sin((deg * Math.PI) / 180));
    await cdp.click(p.x, p.y);
    await cdp.settle(80);
    const fit = await fitButton();
    if (i === 0) check('FIT disabled with 1 point', fit && fit.disabled === true && fit.hidden === false, fit);
    if (i === 1) check('FIT enabled with 2 points', fit && fit.disabled === false, fit);
  }
  const gBeforeFit = await geometry();
  check('placing rim points does not move the circle', JSON.stringify(gBeforeFit.femoral_circles[0]) === JSON.stringify(g0.femoral_circles[0]), gBeforeFit.femoral_circles[0]);
  m0 = await measurements();
  const fit = await fitButton();
  await cdp.click(fit.cx, fit.cy);
  await cdp.settle(120);
  g1 = await geometry();
  check('FIT re-fits Head 1 to the traced points', near(g1.femoral_circles[0][0], target.cx, 1.5 * pr) && near(g1.femoral_circles[0][1], target.cy, 1.5 * pr) && near(g1.femoral_circles[0][2], target.r, 1.5 * pr), [g1.femoral_circles[0], target]);
  e = await editor();
  const fitAfter = await fitButton();
  check('the placement ends after FIT (FIT hidden again)', e && e.placing === null && fitAfter && fitAfter.hidden === true, [e && e.placing, fitAfter]);
  m1 = await waitForMeasure(m0);
  check('measurements update after FIT', m1 !== null, m1 && m1.PT);

  // 6. Place… again with 1 point, then CANCEL clears it; selecting another row cancels a placement too.
  await clickSelector('[data-level-key="place:FH1"]');
  const p30 = await cdp.toClient(target.cx + target.r * Math.cos(Math.PI / 6), target.cy + target.r * Math.sin(Math.PI / 6));
  await cdp.click(p30.x, p30.y);
  await cdp.settle(60);
  let fit2 = await fitButton();
  check('FIT stays disabled with only 1 point', fit2.disabled === true, fit2);
  await clickSelector('[data-level-key="cancel:FH1"]');
  e = await editor();
  fit2 = await fitButton();
  check('CANCEL clears the points and hides FIT', e && e.placing === null && fit2.hidden === true, [e && e.placing, fit2]);
  await clickSelector('[data-level-key="place:FH1"]');
  await cdp.click(p30.x, p30.y);
  await cdp.settle(60);
  await clickSelector('[data-level-key="L3"]');
  e = await editor();
  check('selecting another level’s row cancels the placement', e && e.placing === null && e.selected === 'L3', e && [e.placing, e.selected]);

  // 7. Escape while placing with a point placed cancels the placement and stays in edit mode.
  await clickSelector('[data-level-key="place:FH1"]');
  const p = await cdp.toClient(target.cx + target.r, target.cy);
  await cdp.click(p.x, p.y);
  await cdp.settle(60);
  await cdp.key('Escape');
  await cdp.settle(120);
  s = await cdp.state();
  check('Escape while placing cancels the placement and stays in edit mode', s.editing === true && s.levelEditor && s.levelEditor.placing === null, [s.editing, s.levelEditor && s.levelEditor.placing]);
  // Leaving now asks first (the drags above are unsaved); Discard puts every level back as it was at entry.
  await clickSelector('.viewer-editbar > button:last-of-type');
  await cdp.settle(120);
  const prompt = await cdp.evaluate(`Boolean(document.querySelector('.lv-prompt'))`);
  await clickSelector('.lv-prompt-discard');
  await cdp.settle(200);
  s = await cdp.state();
  check('DONE with unsaved edits asks, and its Discard leaves edit mode', prompt === true && s.editing === false && s.levelEditor === null, [prompt, s.editing]);
  await waitForMeasure(await measurements());
  await clickSelector('.viewer-tool[aria-label="Edit segmentation"]');
  await cdp.settle(200);
  e = await editor();
  fit2 = await fitButton();
  check('re-entering edit mode shows no leftover placement', e && e.placing === null && fit2.hidden === true, [e && e.placing, fit2]);
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
