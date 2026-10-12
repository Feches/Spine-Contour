// Source-Electron integration check. Supply SMOKE_PREDICTION pointing to an existing
// prediction JSON from a real image. Known circle geometry exercises UI arithmetic;
// it is not an anatomical accuracy benchmark. Nothing is uploaded or screenshotted.
// Run once with SMOKE_PHASE=edit and again after a full app restart with =reload.
//
// (2026-10-10, level editor) The two test circles are placed relative to the prediction's image size (they were
// fixed for one 1906-px film), and every circle edit goes through the level editor: a head is refitted from its rim
// points (a rim-point drag, or Place… and rim clicks), hidden or shown with its checkbox, and never deleted. The old
// ADD CIRCLE / DELETE CIRCLE buttons, the centre drag and the Delete key's removal are gone; each replacing check is
// named in tools/smoke/README.md.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { connect } from './cdp-lib.mjs';
const cdp = await connect();
const checks = [];
function check(name, ok) { checks.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); assert.ok(ok, name); }
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await cdp.evaluate(expression)) return;
    await cdp.settle(100);
  }
  throw new Error(`Timeout: ${expression}`);
}
// Chromium can acknowledge a captured move only after release. Dispatch both before
// awaiting acknowledgements, as the disc-height smoke does.
async function drag(x0,y0,x1,y1) {
  await cdp.mouse('mouseMoved',x0,y0);
  await cdp.mouse('mousePressed',x0,y0,{button:'left',buttons:1,clickCount:1});
  const move=cdp.mouse('mouseMoved',x1,y1,{button:'left',buttons:1});
  await cdp.settle(60);
  await Promise.all([move,cdp.mouse('mouseReleased',x1,y1,{button:'left',buttons:0,clickCount:1})]);
}
const state = "(await import('./renderer/store.js')).getState()";
const study = `(${state}).studies.find(s=>s.id==='SP-8801')`;
const current = () => cdp.evaluate(`(async()=>${study})()`);
const settled = () => until(`(async()=>!(${state}).measurementDrafts?.['SP-8801'])()`);
const button = label => cdp.evaluate(`(()=>{const b=[...document.querySelectorAll('.viewer-editbar button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b || b.disabled)throw Error('Button unavailable');b.click();})()`);
const heights = () => cdp.evaluate("[...document.querySelectorAll('.meas-disc-table tbody tr')].map(r=>r.textContent)");
// The level editor's wiring and handles, from the page's own module instances.
const selectHead = code => cdp.evaluate(`import('./renderer/level-editor.js').then(m=>{m.selectLevelRow('${code}');return true;})`);
const rimOf = code => cdp.evaluate(`import('./renderer/viewer/level-handles.js').then(async h=>{const e=${state}.levelEditor;const g=e?.levels?.['${code}']?.geometry;return g?h.levelHandles('${code}',g).map(x=>x.point):null;})`);
const toggleBox = selector => cdp.evaluate(`(()=>{document.querySelector(${JSON.stringify(selector)}).click();return true;})()`);
const enterEdit = async () => {
  await cdp.evaluate("document.querySelector('[aria-label=\"Edit segmentation\"]').click()");
  await until(`(async()=>Boolean(${state}.levelEditor))()`);
};
try {
  await until(`(async()=>(${state}).studies.length>0)()`);
  if (process.env.SMOKE_PHASE === 'reload') {
    const saved = await current();
    check('restart preserves one edited circle and its QC provenance', saved.geometry.femoral_circles.length === 1 && saved.qc.manual_edits.femoral);
    check('restart keeps unsupported pelvic angles and midpoint null', saved.geometry.hip_midpoint === null && saved.measurements.PI === null && saved.measurements.PT === null);
    await cdp.setState("{ ack:true,screen:'analysis',openId:'SP-8801',editing:false,levelEditor:null,tab:'meas' }");
    await until("document.querySelector('.viewer-canvas-dynamic')?.width>0 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
    await enterEdit();
    check('reopened image reports review, not the original fit percentage', await cdp.evaluate("document.querySelector('.confidence-value').textContent==='Review recommended'"));
    await button('RESET TO PREDICTION');
    const reset = await current();
    check('reset after restart restores both heads and original QC', reset.geometry.femoral_circles.length === 2 && !reset.qc.manual_edits && reset.qc.coverage.partial === false);
  } else {
    const fixture = JSON.parse(fs.readFileSync(process.env.SMOKE_PREDICTION, 'utf8'));
    // The prediction image's size, from its PNG header (IHDR width and height at bytes 16 and 20).
    const png = Buffer.from(fixture.image_png, 'base64');
    const [W, H] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    const r1 = Math.max(10, Math.round(Math.min(W, H) * 0.12));
    const circles = [[Math.round(W * 0.33), Math.round(H * 0.78), r1], [Math.round(W * 0.66), Math.round(H * 0.78), r1 + 1]];
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.evaluate(`(async()=>{
      const api=await import('./renderer/api.js'), store=await import('./renderer/store.js');
      const raw=${JSON.stringify(fixture)};
      // Two separated test circles on the image, away from the spine handles.
      const result=await api.measure({...raw.geometry,femoral_circles:${JSON.stringify(circles)}});
      const qc={...raw.qc,...result.qc,femoral:{qc_pass:true,confidence:.91}};
      const prediction={...raw,...result,qc};
      await api.savePrediction('SP-8801',prediction);
      const entry={id:'SP-8801',source:'real',fileName:'circle-ui-check.webp',filePath:'/test/circle-ui-check.webp',
        addedAt:new Date().toISOString(),view:'Standing lateral',name:'Circle editing check',clinical:{},...result,qc,calibration:raw.calibration};
      window.circleOriginal=structuredClone(entry);
      store.setState({studies:[entry],ack:true,screen:'studies',openId:null,measurementDrafts:{},running:null,batch:null});
      store.setState({screen:'analysis',openId:entry.id,tab:'meas',editing:false,levelEditor:null,selectedLevel:null});
      const canvas=await import('./renderer/viewer/canvas.js');
      const decoded=await canvas.loadStudyImages({...prediction,femoral_mask_png:'deliberately invalid; must not decode'});
      canvas.disposeStudyImages(decoded);
    })()`);
    check('raw femoral masks are not decoded even from a legacy prediction', true);
    await until(`document.querySelector('.viewer-canvas-dynamic')?.width===${W} && document.querySelector('.run-card')?.classList.contains('is-hidden')`);
    const beforeHeights = await heights();
    check('overall confidence is an assessment with a separate fit score', await cdp.evaluate("document.querySelector('.confidence-label').textContent==='OVERALL CONFIDENCE' && document.querySelector('.confidence-breakdown').textContent.includes('91%')"));
    await cdp.evaluate("document.querySelector('.confidence-badge').click()");
    check('confidence breakdown opens and is readable', await cdp.evaluate("document.querySelector('.confidence-details').open && getComputedStyle(document.querySelector('.confidence-breakdown')).backgroundColor!=='rgba(0, 0, 0, 0)'"));
    await cdp.evaluate("document.querySelector('.confidence-badge').click()");
    await enterEdit();
    const initial = await current();

    // A rim-point drag refits Head 1 through its rim points (a model head's four are synthesised at -45, 45, 135
    // and 225 degrees); outward along R0's radius, so the head grows and its centre follows.
    await selectHead('FH1');
    await cdp.settle(120);
    let rim = await rimOf('FH1');
    let [cx, cy, cr] = initial.geometry.femoral_circles[0];
    let p = await cdp.toClient(rim[0][0], rim[0][1]);
    await drag(p.x, p.y, p.x + 10 * (rim[0][0] - cx) / cr, p.y + 10 * (rim[0][1] - cy) / cr);
    await settled();
    const moved = await current();
    check('a rim-point drag refits Head 1 and recalculates the hip axis', JSON.stringify(moved.geometry.femoral_circles[0]) !== JSON.stringify(initial.geometry.femoral_circles[0]) && moved.measurements.PT !== initial.measurements.PT);
    rim = await rimOf('FH1');
    [cx, cy, cr] = moved.geometry.femoral_circles[0];
    p = await cdp.toClient(rim[2][0], rim[2][1]);
    await drag(p.x, p.y, p.x + 8 * (rim[2][0] - cx) / cr, p.y + 8 * (rim[2][1] - cy) / cr);
    await settled();
    const resized = await current();
    check('a second rim point dragged outward grows the head', resized.geometry.femoral_circles[0][2] > cr);

    // Hiding Head 1 (its checkbox): the assessment is pending until /measure answers.
    check('hiding a head shows pending assessment before the response', await cdp.evaluate("(()=>{document.querySelector('[data-level-row=\"FH1\"] .level-check').click();return document.querySelector('.confidence-value').textContent==='Updating…';})()"));
    await settled();
    let partial = await current();
    check('hiding a head keeps one circle and clears dependent angles', partial.geometry.femoral_circles.length===1 && partial.geometry.hip_midpoint===null && ['PI','PT','L1PA'].every(k=>partial.measurements[k]===null));
    check('hiding a head preserves all calibrated disc heights', JSON.stringify(await heights())===JSON.stringify(beforeHeights));
    check('edited geometry does not reuse the original score as current confidence', await cdp.evaluate("document.querySelector('.confidence-value').textContent==='Review recommended' && document.querySelector('.confidence-breakdown').textContent.includes('before circle edits')"));

    // The remaining head (Head 2, now the study's only circle) still refits from a nudged rim point.
    await selectHead('FH2');
    await cdp.evaluate("import('./renderer/level-editor.js').then(m=>{m.setFocusedHandle({code:'FH2',handle:'R0'});return true;})");
    await cdp.evaluate('(()=>{const a=document.activeElement;if(a&&a.blur)a.blur();return true;})()');
    await cdp.key('ArrowRight'); await settled();
    const nudged = await current();
    check('one remaining circle can move without creating a midpoint', nudged.geometry.hip_midpoint===null && nudged.geometry.femoral_circles.length===1 && JSON.stringify(nudged.geometry.femoral_circles[0])!==JSON.stringify(partial.geometry.femoral_circles[0]));

    // Head 1 shown again, then re-placed by tracing four rim points (the fourth finishes it).
    await toggleBox('[data-level-row="FH1"] .level-check');
    await settled();
    await cdp.evaluate("document.querySelector('[data-level-key=\"place:FH1\"]').click()");
    const [ox, oy, orad] = circles[0];
    for (const [x,y] of [[ox+orad,oy],[ox,oy+orad],[ox-orad,oy],[ox,oy-orad]]) { const q=await cdp.toClient(x,y); await cdp.click(q.x,q.y); await cdp.settle(40); }
    await settled();
    const traced = await current();
    const tracedRim = await rimOf('FH1');
    check('adding a circle by tracing restores the bilateral measurements', traced.geometry.femoral_circles.length===2 && traced.measurements.PI!==null && Array.isArray(tracedRim) && tracedRim.length===4);

    // The level editor has no delete: Delete leaves a selected head where it is.
    await selectHead('FH2');
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
    await cdp.settle(300);
    check('the Delete key leaves a selected head in place (the level editor has no delete)', (await current()).geometry.femoral_circles.length===2);

    // The Femoral heads group box hides both.
    await toggleBox('[data-group-key="femoral"] .lv-group-row .level-check');
    await settled();
    check('both circles can be hidden without losing the spinal result', (await current()).geometry.femoral_circles.length===0 && (await current()).measurements.SS!==null);
    await button('RESET TO PREDICTION');
    const reset = await current();
    check('reset restores geometry, measurements and QC as a matching snapshot', JSON.stringify(reset.geometry)===JSON.stringify(initial.geometry) && !reset.qc.manual_edits && reset.qc.coverage.partial===false);
    await toggleBox('[data-level-row="FH2"] .level-check'); await settled();
    await cdp.settle(1200);
    check('disk save preserves one circle', await cdp.evaluate("(async()=>{const saved=await (await import('./renderer/api.js')).loadStudies();return saved.find(s=>s.id==='SP-8801').geometry.femoral_circles.length===1;})()"));
  }
  check('no renderer exceptions', cdp.errors.length===0);
} finally {
  console.log(JSON.stringify(checks,null,2));
  await cdp.close();
}
