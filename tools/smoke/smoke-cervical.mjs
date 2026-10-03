// Real CSXA inference and live editing on a scratch Electron profile.
// Pass a local lateral cervical image with anterior on image left. Images/results
// stay in ignored directories; this checks integration, not clinical accuracy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { connect } from './cdp-lib.mjs';

const input = path.resolve(process.argv[2] || 'artifacts/cervical_parity/0025037.png');
assert.ok(fs.existsSync(input), 'Pass a local cervical test image');
const out = path.resolve('tools/smoke/out/cervical');
fs.mkdirSync(out, { recursive: true });
const cdp = await connect();
const checks = [];
function check(name, value) { checks.push({ name, ok: Boolean(value) }); assert.ok(value, name); }
async function until(expression, attempts = 200) {
  for (let i = 0; i < attempts; i++) {
    if (await cdp.evaluate(expression)) return;
    await cdp.settle(100);
  }
  throw new Error(`Timed out: ${expression}`);
}

try {
  await cdp.send('Page.reload', { ignoreCache: true });
  await cdp.settle(700);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate(`(async()=>{
    const {newStudy}=await import('./renderer/screens/studies.js');
    const {setState}=await import('./renderer/store.js');
    const study=newStudy({id:'SP-9801',filePath:${JSON.stringify(input)},fileName:${JSON.stringify(path.basename(input))}});
    setState({studies:[study],ack:true,screen:'analysis',openId:study.id,editing:false,
      running:null,batch:null,measurementDrafts:{},tab:'meas',selectedLevel:null});
  })()`);
  await until('document.querySelector(\'[aria-label="Spine region"]\')');
  await cdp.evaluate(`(()=>{const e=document.querySelector('[aria-label="Spine region"]');e.value='cervical';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  check('cervical run requires an explicit anterior side', await cdp.evaluate(`(async()=>{
    const {segmentStudy}=await import('./renderer/screens/analysis.js');
    const result=await segmentStudy('SP-9801');return !result.ok&&result.reason.includes('anterior');
  })()`));
  await until("document.querySelector('.viewer-canvas-dynamic')?.width>10 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
  check('original image is visible before orientation confirmation without invented measurements', await cdp.evaluate("import('./renderer/store.js').then(m=>{const s=m.getState().studies[0];return s.geometry===null&&s.measurements===null&&s.anteriorSide===null;})"));
  await cdp.screenshot(path.join(out, 'original-preview.png'));
  await cdp.evaluate(`(()=>{const e=document.querySelector('[aria-label="Cervical anterior image side"]');e.value='left';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const run = await cdp.evaluate("import('./renderer/screens/analysis.js').then(m=>m.segmentStudy('SP-9801'))");
  check('real cervical detector and HRNET complete through Electron IPC and streaming', run.ok);
  await until("document.querySelector('.viewer-canvas-dynamic')?.width>10 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
  check('only cervical measurement rows appear', await cdp.evaluate("document.querySelector('[data-row-key=\"C2C7_COBB\"]')&&document.querySelector('[data-row-key=\"C2C7_SVA\"]')&&!document.querySelector('[data-row-key=\"LL\"]')"));
  check('actual model and source frame are recorded', await cdp.evaluate(`import('./renderer/store.js').then(m=>{
    const s=m.getState().studies[0];window.cervicalOriginal=structuredClone(s);
    return s.geometry.region==='cervical'&&s.qc.models.vertebrae==='cervical_hrnet'
      &&s.qc.provenance.dataset==='CSXA'&&s.geometry.c2_centroid
      &&Object.keys(s.geometry.vertebrae).length===6&&s.geometry.s1_superior===null;
  })`));
  await cdp.evaluate("document.querySelector('[data-row-key=\"C2C7_COBB\"]').click()");
  check('Cobb row draws and labels its own construction', await cdp.evaluate("document.querySelector('.viewer-label')?.textContent.includes('C2')"));
  await cdp.screenshot(path.join(out, 'cobb.png'));
  await cdp.evaluate("document.querySelector('[data-row-key=\"C2C7_SVA\"]').click()");
  await cdp.screenshot(path.join(out, 'sva.png'));

  // Deliberately synthetic calibration on the scratch study: verifies unit
  // propagation without pretending this film has a known physical scale.
  await cdp.evaluate(`(async()=>{
    const {rememberCalibration}=await import('./renderer/calibration.js');
    const s=(await import('./renderer/store.js')).getState().studies[0];
    const c={...s.calibration,status:'corrected',spacing:{row_mm:.2,column_mm:.2,source:'manual_reference'},
      candidates:[{endpoints:[[10,10],[10,110]],length_px:100,value_mm:20,status:'accepted'}],selected_index:0};
    rememberCalibration(s.filePath,c);
  })()`);
  check('current calibration drives millimetres in the visible SVA row', await cdp.evaluate(`(async()=>{
    const s=(await import('./renderer/store.js')).getState().studies[0];
    const m=(await import('./renderer/data/cervical.js')).cervicalMeasurements(s);
    return Math.abs(m.C2C7_SVA_MM-m.C2C7_SVA_PX*.2)<1e-8
      &&document.querySelector('[data-row-key="C2C7_SVA"] .meas-value').textContent.endsWith('mm');
  })()`));
  await cdp.setState('{editing:true,selectedLevel:null,selection:null,panMode:false}');
  await cdp.send('Page.bringToFront');
  const centroid = await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().studies[0].geometry.c2_centroid)");
  const location = await cdp.toClient(...centroid);
  await cdp.click(location.x, location.y);
  check('C2 centroid is an editable handle', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().selection?.corner==='CENTROID')"));
  await cdp.key('ArrowRight');
  await until(`import('./renderer/store.js').then(m=>{const s=m.getState();return !s.measurementDrafts['SP-9801']&&Math.abs(s.studies[0].geometry.c2_centroid[0]-${centroid[0]+1})<1e-7;})`);
  check('centroid nudge recalculates SVA through the real backend', await cdp.evaluate(`import('./renderer/store.js').then(m=>{
    const s=m.getState().studies[0];return Math.abs(s.measurements.C2C7_SVA_PX-window.cervicalOriginal.measurements.C2C7_SVA_PX+1)<1e-7;
  })`));
  await cdp.evaluate("[...document.querySelectorAll('.viewer-editbar button')].find(b=>b.textContent.trim()==='RESET TO PREDICTION').click()");
  check('reset restores original cervical geometry', await cdp.evaluate(`import('./renderer/store.js').then(m=>m.getState().studies[0].geometry.c2_centroid[0]===${centroid[0]})`));
  check('CSV exports cervical columns and current calibrated values', await cdp.evaluate(`(async()=>{
    const s=(await import('./renderer/store.js')).getState().studies[0];
    const csv=(await import('./renderer/data/csv.js')).toCsv([s]);
    return csv.includes('C2-C7 Cobb (deg)')&&csv.includes('C2-C7 SVA (mm)')&&csv.includes('cervical,left');
  })()`));
  await cdp.evaluate(`(async()=>{
    const s=(await import('./renderer/store.js')).getState().studies[0];
    (await import('./renderer/calibration.js')).rememberCalibration(s.filePath,{...s.calibration,status:'cleared',spacing:null,selected_index:null});
  })()`);
  check('clearing scale restores explicitly uncalibrated pixel SVA', await cdp.evaluate("document.querySelector('[data-row-key=\"C2C7_SVA\"]').textContent.includes('UNCALIBRATED')&&document.querySelector('[data-row-key=\"C2C7_SVA\"] .meas-value').textContent.endsWith('px')"));
  await cdp.setState('{editing:false}');
  await cdp.settle(500);
  await cdp.send('Page.reload', { ignoreCache: true });
  await cdp.settle(700);
  await cdp.setState("{ack:true,screen:'analysis',openId:'SP-9801',selectedLevel:'C2C7_SVA',tab:'meas'}");
  await until("document.querySelector('.viewer-canvas-dynamic')?.width>10&&document.querySelector('.run-card')?.classList.contains('is-hidden')");
  check('cervical geometry, orientation and cleared scale survive app reload', await cdp.evaluate("import('./renderer/store.js').then(m=>{const s=m.getState().studies[0];return s.region==='cervical'&&s.anteriorSide==='left'&&s.geometry.region==='cervical'&&s.calibration.status==='cleared';})"));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.screenshot(path.join(out, 'compact.png'));
  check('measurement panel fits compact window', await cdp.evaluate("document.querySelector('.meas-panel').getBoundingClientRect().right<=innerWidth"));
  check('no renderer errors', cdp.errors.length===0);
} finally {
  const result={passed:checks.filter(c=>c.ok).length,total:checks.length,checks,errors:cdp.errors};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  cdp.close();
}
