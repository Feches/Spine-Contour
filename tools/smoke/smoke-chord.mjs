// Chord pan (left+right held together) and cursor-anchored zoom.
//
// Assumes a segmented study open on Analysis (inject-study.js + run-and-wait.js first).
//
// Every move MUST carry the held buttons: Chromium silently drops pointer capture on a
// mouseMoved with `button: 'none'`, which reads as "capture is lost during a chord" and is a
// false negative. cdp.click and cdp.drag hardcode one button, so this drives the raw `mouse`
// primitive throughout.
import { connect } from './cdp-lib.mjs';

const cdp = await connect();
let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log('PASS ', name); }
  else { failed += 1; console.log('FAIL ', name, '->', JSON.stringify(detail)); }
}
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

const LEFT = 1;
const RIGHT = 2;
const BOTH = 3;

async function resetView() {
  await cdp.setState("{ zoom: 1, panX: 0, panY: 0, panMode: false, editing: false, selection: null, selectedLevel: null }");
  await cdp.settle(120);
}

// One chord gesture. `order` is the press order; `release` is which button lifts first.
async function chordDrag({ from, dx, dy, order, release }) {
  const first = order === 'left-first' ? 'left' : 'right';
  const second = order === 'left-first' ? 'right' : 'left';
  const firstMask = order === 'left-first' ? LEFT : RIGHT;

  await cdp.mouse('mousePressed', from.x, from.y, { button: first, buttons: firstMask, clickCount: 1 });
  await cdp.settle(40);
  // The second press arrives as a MOVE carrying the new mask -- this is the whole point.
  await cdp.mouse('mouseMoved', from.x, from.y, { button: second, buttons: BOTH });
  await cdp.settle(40);
  await cdp.mouse('mouseMoved', from.x + dx / 2, from.y + dy / 2, { button: 'left', buttons: BOTH });
  await cdp.mouse('mouseMoved', from.x + dx, from.y + dy, { button: 'left', buttons: BOTH });
  await cdp.settle(60);
  const during = await cdp.state();

  const releaseFirst = release === 'left' ? 'left' : 'right';
  const maskAfter = release === 'left' ? RIGHT : LEFT;
  await cdp.mouse('mouseMoved', from.x + dx, from.y + dy, { button: releaseFirst, buttons: maskAfter });
  await cdp.settle(40);
  const other = release === 'left' ? 'right' : 'left';
  await cdp.mouse('mouseReleased', from.x + dx, from.y + dy, { button: other, buttons: 0, clickCount: 1 });
  await cdp.settle(80);
  return { during, after: await cdp.state() };
}

const stage = await cdp.rect('.viewer-stage');
const centre = { x: Math.round(stage.cx), y: Math.round(stage.cy) };

// ---- 1. all four press/release orders pan the film ----
for (const order of ['left-first', 'right-first']) {
  for (const release of ['left', 'right']) {
    await resetView();
    const r = await chordDrag({ from: centre, dx: 60, dy: -35, order, release });
    check(`${order}, release ${release}: the chord pans while held`,
      near(r.during.panX, 60) && near(r.during.panY, -35),
      { panX: r.during.panX, panY: r.during.panY });
    check(`${order}, release ${release}: the pan survives the release`,
      near(r.after.panX, 60) && near(r.after.panY, -35),
      { panX: r.after.panX, panY: r.after.panY });
    check(`${order}, release ${release}: the chord did not change the selection`,
      r.after.selectedLevel === null, { selectedLevel: r.after.selectedLevel });
  }
}

// ---- 2. the chord outranks a handle drag while editing ----
await resetView();
await cdp.setState('{ editing: true }');
await cdp.settle(150);
// Geometry is { vertebrae: { L1..L5: { superior: [[x,y],[x,y]], inferior: [...] } }, ... }.
// L3's first superior corner is a real, draggable landmark handle.
const READ_L3 = "(async () => { const m = await import('./renderer/store.js'); const s = m.getState(); const g = s.studies.find(x => x.id === s.openId).geometry; return g.vertebrae.L3.superior[0]; })()";
const geom = await cdp.evaluate("(async () => { const s = (await import('./renderer/store.js')).getState(); const g = s.studies.find(x => x.id === s.openId).geometry; return Object.keys(g.vertebrae); })()");
const handle = await cdp.evaluate(READ_L3);
if (handle) {
  const client = await cdp.toClient(handle[0], handle[1]);
  const before = await cdp.state();
  const r = await chordDrag({ from: { x: Math.round(client.x), y: Math.round(client.y) }, dx: 55, dy: 25, order: 'left-first', release: 'right' });
  check('editing: a chord starting ON a handle pans instead of dragging it',
    near(r.after.panX, 55) && near(r.after.panY, 25), { panX: r.after.panX, panY: r.after.panY });
  const after = await cdp.evaluate(READ_L3);
  check('editing: the landmark itself did not move',
    Math.abs(after[0] - handle[0]) < 0.01 && Math.abs(after[1] - handle[1]) < 0.01,
    { before: handle, after });
} else {
  check('editing: found an L3 landmark to test against', false, { keys: geom });
}
await cdp.setState('{ editing: false }');

// ---- 3. zoom anchors at the cursor ----
await resetView();
{
  // a point well away from the stage centre, in image space, so we can re-project it
  const probe = await cdp.evaluate("(() => { const c = document.querySelector('.viewer-canvas-dynamic'); return [Math.round(c.width * 0.25), Math.round(c.height * 0.2)]; })()");
  const at = await cdp.toClient(probe[0], probe[1]);
  const cursor = { x: Math.round(at.x), y: Math.round(at.y) };
  await cdp.wheel(cursor.x, cursor.y, -120);
  await cdp.settle(120);
  const zoomed = await cdp.state();
  const now = await cdp.toClient(probe[0], probe[1]);
  check('wheel zooms in', zoomed.zoom > 1, { zoom: zoomed.zoom });
  check('the point under the cursor stays under the cursor when zooming in',
    near(now.x, cursor.x) && near(now.y, cursor.y),
    { wanted: cursor, got: { x: now.x, y: now.y }, pan: [zoomed.panX, zoomed.panY] });

  await cdp.wheel(cursor.x, cursor.y, 120);
  await cdp.settle(120);
  const back = await cdp.toClient(probe[0], probe[1]);
  check('and when zooming back out at the same point',
    near(back.x, cursor.x) && near(back.y, cursor.y), { wanted: cursor, got: { x: back.x, y: back.y } });
}

// ---- 4. a wheel at the stage centre with no pan leaves the pan at zero ----
await resetView();
await cdp.wheel(centre.x, centre.y, -120);
await cdp.settle(120);
{
  const s = await cdp.state();
  check('a centred wheel with no pan still writes pan 0 (the old behaviour)',
    near(s.panX, 0, 0.5) && near(s.panY, 0, 0.5), { panX: s.panX, panY: s.panY });
}

// ---- 5. the zoom clamp must not drift the pan ----
await resetView();
await cdp.setState('{ zoom: 2.4 }');
await cdp.settle(80);
{
  const beforeClamp = await cdp.state();
  for (let i = 0; i < 4; i += 1) { await cdp.wheel(stage.left + 20, stage.top + 20, -120); }
  await cdp.settle(140);
  const s = await cdp.state();
  check('wheeling in at ZOOM_MAX moves nothing at all',
    s.zoom === beforeClamp.zoom && s.panX === beforeClamp.panX && s.panY === beforeClamp.panY,
    { before: [beforeClamp.zoom, beforeClamp.panX, beforeClamp.panY], after: [s.zoom, s.panX, s.panY] });
}

// ---- 6. a wheel DURING a pan drag must not snap back ----
await resetView();
await cdp.setState('{ panMode: true }');
await cdp.settle(100);
{
  await cdp.mouse('mousePressed', centre.x, centre.y, { button: 'left', buttons: LEFT, clickCount: 1 });
  await cdp.mouse('mouseMoved', centre.x + 40, centre.y + 30, { button: 'left', buttons: LEFT });
  await cdp.settle(60);
  const beforeWheel = await cdp.state();
  await cdp.wheel(centre.x + 40, centre.y + 30, -120);
  await cdp.settle(80);
  const afterWheel = await cdp.state();
  await cdp.mouse('mouseMoved', centre.x + 80, centre.y + 30, { button: 'left', buttons: LEFT });
  await cdp.settle(60);
  const afterMove = await cdp.state();
  await cdp.mouse('mouseReleased', centre.x + 80, centre.y + 30, { button: 'left', buttons: 0, clickCount: 1 });
  check('a wheel mid-drag zooms', afterWheel.zoom > beforeWheel.zoom, { before: beforeWheel.zoom, after: afterWheel.zoom });
  check('the next move after a mid-drag wheel does NOT discard the wheel-anchored pan',
    near(afterMove.panX, afterWheel.panX + 40) && near(afterMove.panY, afterWheel.panY),
    { afterWheel: [afterWheel.panX, afterWheel.panY], afterMove: [afterMove.panX, afterMove.panY] });
}
await cdp.setState('{ panMode: false }');

// ---- 7. clicking Edit drops pan mode, and the chord still pans while editing ----
await resetView();
await cdp.setState('{ panMode: true }');
await cdp.settle(100);
{
  const pencil = await cdp.rect('.viewer-tool[aria-label="Edit landmarks"]');
  await cdp.click(Math.round(pencil.cx), Math.round(pencil.cy));
  await cdp.settle(180);
  const s = await cdp.state();
  check('clicking Edit turns edit mode on', s.editing === true, { editing: s.editing });
  check('clicking Edit clears pan mode', s.panMode === false, { panMode: s.panMode });
  const panAria = await cdp.evaluate("document.querySelector('.viewer-tool[aria-label=\"Pan\"]').getAttribute('aria-pressed')");
  const stageClass = await cdp.evaluate("document.querySelector('.viewer-stage').className");
  check('the Pan button is no longer pressed', panAria === 'false', { panAria });
  check('the stage no longer carries is-pan-mode', !String(stageClass).includes('is-pan-mode'), { stageClass });

  const r = await chordDrag({ from: centre, dx: -45, dy: 20, order: 'left-first', release: 'right' });
  check('the chord still pans with pan mode off and edit mode on',
    near(r.after.panX, -45) && near(r.after.panY, 20), { panX: r.after.panX, panY: r.after.panY });
}
await cdp.setState('{ editing: false, panMode: false }');

// ---- 8. pan still wins over edit when the toggle is pressed AFTER entering edit ----
await resetView();
await cdp.setState('{ editing: true, panMode: true }');
await cdp.settle(120);
{
  const s = await cdp.state();
  check('pressing Pan while already editing keeps both on (signed-off behaviour, unchanged)',
    s.editing === true && s.panMode === true, { editing: s.editing, panMode: s.panMode });
}
await resetView();

// ---- 9. no console errors ----
check('no console errors or exceptions during the run', cdp.errors.length === 0, cdp.errors);

console.log(`${passed}/${passed + failed} checks passed`);
cdp.close();
process.exit(failed === 0 ? 0 : 1);
