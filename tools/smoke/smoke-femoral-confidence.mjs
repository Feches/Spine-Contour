// Source-Electron integration check. Supply SMOKE_PREDICTION pointing to an existing
// prediction JSON from a real image. Known circle geometry exercises UI arithmetic;
// it is not an anatomical accuracy benchmark. Nothing is uploaded or screenshotted.
// Run once with SMOKE_PHASE=edit and again after a full app restart with =reload.
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
const selectHead = index => cdp.setState(`{ selection: {kind:'femoral',side:'${index ? 'right' : 'left'}',part:'center'} }`);
try {
  await until(`(async()=>(${state}).studies.length>0)()`);
  if (process.env.SMOKE_PHASE === 'reload') {
    const saved = await current();
    check('restart preserves one edited circle and its QC provenance', saved.geometry.femoral_circles.length === 1 && saved.qc.manual_edits.femoral);
    check('restart keeps unsupported pelvic angles and midpoint null', saved.geometry.hip_midpoint === null && saved.measurements.PI === null && saved.measurements.PT === null);
    await cdp.setState("{ ack:true,screen:'analysis',openId:'SP-8801',editing:true,tab:'meas' }");
    await until("document.querySelector('.viewer-canvas-dynamic')?.width>0 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
    check('reopened image reports review, not the original fit percentage', await cdp.evaluate("document.querySelector('.confidence-value').textContent==='Needs review'"));
    await button('RESET TO PREDICTION');
    const reset = await current();
    check('reset after restart restores both heads and original QC', reset.geometry.femoral_circles.length === 2 && !reset.qc.manual_edits && reset.qc.coverage.partial === false);
  } else {
    const fixture = JSON.parse(fs.readFileSync(process.env.SMOKE_PREDICTION, 'utf8'));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.evaluate(`(async()=>{
      const api=await import('./renderer/api.js'), store=await import('./renderer/store.js');
      const raw=${JSON.stringify(fixture)};
      // Two separated test circles on the image, away from the spine handles.
      const result=await api.measure({...raw.geometry,femoral_circles:[[760,650,45],[1140,650,50]]});
      const qc={...raw.qc,...result.qc,femoral:{qc_pass:true,confidence:.91}};
      const prediction={...raw,...result,qc};
      await api.savePrediction('SP-8801',prediction);
      const entry={id:'SP-8801',source:'real',fileName:'circle-ui-check.webp',filePath:'/test/circle-ui-check.webp',
        addedAt:new Date().toISOString(),view:'Standing lateral',name:'Circle editing check',clinical:{},...result,qc,calibration:raw.calibration};
      window.circleOriginal=structuredClone(entry);
      store.setState({studies:[entry],ack:true,screen:'studies',openId:null,measurementDrafts:{},running:null,batch:null});
      store.setState({screen:'analysis',openId:entry.id,tab:'meas',editing:false,selectedLevel:null});
      const canvas=await import('./renderer/viewer/canvas.js');
      const decoded=await canvas.loadStudyImages({...prediction,femoral_mask_png:'deliberately invalid; must not decode'});
      canvas.disposeStudyImages(decoded);
    })()`);
    check('raw femoral masks are not decoded even from a legacy prediction', true);
    await until("document.querySelector('.viewer-canvas-dynamic')?.width===1906 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
    const beforeHeights = await heights();
    check('overall confidence is an assessment with a separate fit score', await cdp.evaluate("document.querySelector('.confidence-label').textContent==='OVERALL CONFIDENCE' && document.querySelector('.confidence-breakdown').textContent.includes('91%')"));
    await cdp.evaluate("document.querySelector('.confidence-badge').click()");
    check('confidence breakdown opens and is readable', await cdp.evaluate("document.querySelector('.confidence-details').open && getComputedStyle(document.querySelector('.confidence-breakdown')).backgroundColor!=='rgba(0, 0, 0, 0)'"));
    await cdp.evaluate("document.querySelector('.confidence-badge').click();document.querySelector('[aria-label=\"Edit landmarks\"]').click()");
    const initial = await current();
    let p = await cdp.toClient(...initial.geometry.femoral_circles[0].slice(0,2));
    await drag(p.x,p.y,p.x+12,p.y-8);
    await settled();
    const moved = await current();
    check('dragging a centre moves the circle and recalculates the hip axis', moved.geometry.femoral_circles[0][0] > initial.geometry.femoral_circles[0][0] && moved.measurements.PT !== initial.measurements.PT);
    const [x,y,r] = moved.geometry.femoral_circles[0]; p = await cdp.toClient(x+r,y);
    await drag(p.x,p.y,p.x+8,p.y); await settled();
    const resized = await current();
    check('rim drag resizes without translating the centre', resized.geometry.femoral_circles[0][2] > r && resized.geometry.femoral_circles[0][0] === x);
    await selectHead(0);
    check('deleting shows pending assessment before the response', await cdp.evaluate("(()=>{[...document.querySelectorAll('.viewer-editbar button')].find(b=>b.textContent==='DELETE CIRCLE').click();return document.querySelector('.confidence-value').textContent==='Updating…';})()"));
    await settled();
    let partial = await current();
    check('delete preserves one circle and clears dependent angles', partial.geometry.femoral_circles.length===1 && partial.geometry.hip_midpoint===null && ['PI','PT','L1PA'].every(k=>partial.measurements[k]===null));
    check('circle deletion preserves all calibrated disc heights', JSON.stringify(await heights())===JSON.stringify(beforeHeights));
    check('edited geometry does not reuse the original score as current confidence', await cdp.evaluate("document.querySelector('.confidence-value').textContent==='Needs review' && document.querySelector('.confidence-breakdown').textContent.includes('before circle edits')"));
    await selectHead(0); await cdp.key('ArrowRight'); await settled();
    check('one remaining circle can move without creating a midpoint', (await current()).geometry.hip_midpoint===null && (await current()).geometry.femoral_circles[0][0]>partial.geometry.femoral_circles[0][0]);
    await button('ADD CIRCLE');
    for (const [x,y] of [[910,650],[860,700],[810,650],[860,600]]) { const p=await cdp.toClient(x,y);await cdp.click(p.x,p.y); }
    await button('FIT'); await settled();
    check('adding a circle by tracing restores the bilateral measurements', (await current()).geometry.femoral_circles.length===2 && (await current()).measurements.PI!==null);
    await selectHead(1);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
    await settled();
    check('Delete key removes selected circle', (await current()).geometry.femoral_circles.length===1);
    await selectHead(0); await button('DELETE CIRCLE'); await settled();
    check('both circles can be removed without losing the spinal result', (await current()).geometry.femoral_circles.length===0 && (await current()).measurements.SS!==null);
    await button('RESET TO PREDICTION');
    const reset = await current();
    check('reset restores geometry, measurements and QC as a matching snapshot', JSON.stringify(reset.geometry)===JSON.stringify(initial.geometry) && !reset.qc.manual_edits && reset.qc.coverage.partial===false);
    await selectHead(1); await button('DELETE CIRCLE'); await settled();
    await cdp.settle(1200);
    check('disk save preserves one circle', await cdp.evaluate("(async()=>{const saved=await (await import('./renderer/api.js')).loadStudies();return saved.find(s=>s.id==='SP-8801').geometry.femoral_circles.length===1;})()"));
  }
  check('no renderer exceptions', cdp.errors.length===0);
} finally {
  console.log(JSON.stringify(checks,null,2));
  await cdp.close();
}
