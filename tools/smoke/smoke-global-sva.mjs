// Synthetic UI integration only: generates a canvas fixture and supplies explicit
// landmarks to the real /measure endpoint. This never invokes model inference.
// Run from the repository root: node tools/smoke/smoke-global-sva.mjs
// Starts and closes its own isolated Electron app; all output stays ignored.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { connect, quitApp } from './cdp-lib.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'tools/smoke/out/global-sva');
const profile = '/tmp/spine-contour-global-sva-ui-20260923';
const port = process.env.CDP_PORT || '9247';
const source = path.join(out, 'synthetic-full-spine.png');
const id = 'SP-9901';
const checks = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, value) => { checks.push({ name, ok: Boolean(value) }); assert.ok(value, name); };
fs.mkdirSync(out, { recursive: true });
let occupied = false;
try { occupied = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch {}
assert.ok(!occupied, `Port ${port} is already occupied; refusing to control another app`);
const log = fs.openSync(path.join(out, 'electron.log'), 'w');
const env = { ...process.env, SPINE_CONTOUR_USER_DATA: profile,
  SPINE_CONTOUR_PYTHON: path.join(root, '.venv/bin/python'), SPINE_CONTOUR_ORT_CPU_ONLY: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(createRequire(import.meta.url)('electron'), ['.', `--remote-debugging-port=${port}`],
  { cwd: root, env, stdio: ['ignore', log, log] });
let cdp;
async function until(expression, attempts = 200) {
  for (let i = 0; i < attempts; i++) {
    if (await cdp.evaluate(expression)) return;
    await wait(100);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function openSavedStudy() {
  await cdp.send('Page.reload', { ignoreCache: true });
  await until("document.querySelector('#app')");
  await cdp.evaluate("import('./renderer/main.js').then(()=>true)");
  await cdp.setState(`{ack:true,screen:'analysis',openId:'${id}',editing:false,selectedLevel:'GLOBAL_SVA',tab:'meas',zoom:1,panX:0,panY:0}`);
  await until("document.querySelector('.viewer-canvas-dynamic')?.width===600 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
}

try {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (app.exitCode !== null) throw new Error(`Scratch Electron exited ${app.exitCode}`);
    try { cdp = await connect(port); break; } catch { await wait(100); }
  }
  assert.ok(cdp, 'Scratch Electron starts');
  await until("document.querySelector('#app')");
  await cdp.evaluate("import('./renderer/main.js').then(()=>true)");
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
  const fixture = await cdp.evaluate(`(()=>{
    const c=document.createElement('canvas');c.width=600;c.height=1200;
    const x=c.getContext('2d');x.fillStyle='#181d24';x.fillRect(0,0,600,1200);
    x.fillStyle='#f0f3f6';x.font='bold 25px sans-serif';x.fillText('SYNTHETIC TEST IMAGE',55,55);
    x.font='17px sans-serif';x.fillText('Explicit landmarks · no model inference',55,86);
    x.fillStyle='#7b8590';x.strokeStyle='#c3cbd2';x.lineWidth=3;
    for(let i=0;i<9;i++){const cx=270+30*Math.sin(i/2);const y=310+i*80;
      x.beginPath();x.moveTo(cx-43,y);x.lineTo(cx+43,y+7);x.lineTo(cx+43,y+50);x.lineTo(cx-43,y+45);x.closePath();x.fill();x.stroke();}
    x.beginPath();x.moveTo(220,1050);x.lineTo(340,1050);x.lineTo(380,1140);x.lineTo(220,1120);x.closePath();x.fill();x.stroke();
    x.fillStyle='#eef2f5';x.font='bold 20px sans-serif';x.fillText('C7',190,315);x.fillText('S1',175,1080);
    x.font='17px sans-serif';x.fillText('Anterior ←',45,1170);
    const image=c.toDataURL('image/png').split(',')[1];x.fillStyle='#000';x.fillRect(0,0,600,1200);
    return {image,mask:c.toDataURL('image/png').split(',')[1]};
  })()`);
  const bytes = Buffer.from(fixture.image, 'base64');
  fs.writeFileSync(source, bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  await cdp.evaluate(`(async()=>{
    const {newStudy}=await import('./renderer/screens/studies.js');const {setState}=await import('./renderer/store.js');
    const study=newStudy({id:'${id}',fileName:'synthetic-full-spine.png',filePath:${JSON.stringify(source)}});
    setState({studies:[study],ack:true,screen:'analysis',openId:study.id,editing:false,running:null,batch:null,measurementDrafts:{},tab:'meas',selectedLevel:null});
  })()`);
  await until("document.querySelector('[aria-label=\"Spine region\"]')");
  check('full spine and cervical remain separate selector options', await cdp.evaluate(`(()=>{
    const e=document.querySelector('[aria-label="Spine region"]');
    return [...e.options].some(o=>o.value==='full_spine'&&o.text==='Full spine · HRNET')&&[...e.options].some(o=>o.value==='cervical');
  })()`));
  await cdp.evaluate("(()=>{const e=document.querySelector('[aria-label=\"Spine region\"]');e.value='full_spine';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  check('full spine requires an explicit anterior side before any inference', await cdp.evaluate(`import('./renderer/screens/analysis.js').then(m=>m.segmentStudy('${id}')).then(r=>!r.ok&&r.reason.includes('anterior'))`));
  await until("document.querySelector('.viewer-canvas-dynamic')?.width===600 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
  check('synthetic original is previewed without invented measurements', await cdp.evaluate(`import('./renderer/store.js').then(m=>m.getState().studies[0].geometry===null)`));
  await cdp.evaluate("(()=>{const e=document.querySelector('[aria-label=\"Full spine anterior image side\"]');e.value='left';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const initial = await cdp.evaluate(`(async()=>{
    const api=await import('./renderer/api.js');const {getState,setState}=await import('./renderer/store.js');
    const geometry={region:'full_spine',anterior_side:'left',c7_centroid:[270,340],s1_superior:[[220,1050],[340,1050]],
      image_width:600,image_height:1200,source_sha256:'${digest}',coordinate_space:'original_image',pixel_spacing:null};
    const measured=await window.spineContour.measure(geometry);
    const calibration={version:1,source_sha256:'${digest}',width:600,height:1200,coordinate_space:'original_image',
      status:'unavailable',spacing:null,candidates:[],selected_index:null,message:'Synthetic fixture: no physical scale assigned.'};
    const response={...measured,image_png:${JSON.stringify(fixture.image)},mask_png:${JSON.stringify(fixture.mask)},labels:{},
      prediction_id:'synthetic-global-sva',calibration,qc:{...measured.qc,synthetic_fixture:true,models:{vertebrae:'dual_hrnet',cervical:'cervical_hrnet',lumbar:'hrnet'},
      warnings:['Synthetic fixture — no model inference.']}};
    const study={...getState().studies[0],region:'full_spine',anteriorSide:'left',predictionId:response.prediction_id,
      geometry:response.geometry,measurements:response.measurements,qc:response.qc,calibration};
    await api.savePrediction('${id}',response);setState({studies:[study]});
    return response.measurements;
  })()`);
  check('real backend measures synthetic C7–S1 displacement as 70 pixels', initial.GLOBAL_SVA_PX === 70 && initial.GLOBAL_SVA_MM === null);
  await until(`import('./renderer/api.js').then(m=>m.loadStudies()).then(rows=>rows.some(s=>s.id==='${id}'&&s.predictionId==='synthetic-global-sva'&&s.measurements?.GLOBAL_SVA_PX===70))`);
  await openSavedStudy();
  check('saved sidecar restores only the global SVA row', await cdp.evaluate("document.querySelector('[data-row-key=\"GLOBAL_SVA\"]')&&!document.querySelector('[data-row-key=\"C2C7_SVA\"]')&&!document.querySelector('[data-row-key=\"LL\"]')"));
  check('global overlay is labelled with explicit uncalibrated pixels', await cdp.evaluate("document.querySelector('.viewer-label')?.textContent.includes('C7–S1 SVA 70.0 px')"));
  await cdp.screenshot(path.join(out, 'synthetic-global-sva.png'));
  await cdp.setState('{editing:true,selection:null,panMode:false}');
  await cdp.send('Page.bringToFront');
  await wait(250);
  check('femoral editing controls are hidden for full spine', await cdp.evaluate("[...document.querySelectorAll('.viewer-editbar .viewer-tool.is-hidden')].length===4&&[...document.querySelectorAll('.viewer-editbar .viewer-tool.is-hidden')].every(e=>e.getClientRects().length===0)"));
  const c7 = await cdp.toClient(270, 340); await cdp.click(c7.x, c7.y);
  check('C7 centroid is selectable for editing', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().selection?.level==='C7'&&m.getState().selection?.corner==='CENTROID')"));
  await cdp.key('ArrowRight');
  await until(`import('./renderer/store.js').then(m=>!m.getState().measurementDrafts['${id}']&&m.getState().studies[0].measurements.GLOBAL_SVA_PX===69)`);
  check('C7 nudge recalculates through real backend', true);
  const posterior = await cdp.toClient(340, 1050); await cdp.click(posterior.x, posterior.y);
  check('S1 posterior corner is selectable for editing', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().selection?.level==='S1'&&m.getState().selection?.corner==='SP')"));
  await cdp.key('ArrowRight');
  await until(`import('./renderer/store.js').then(m=>!m.getState().measurementDrafts['${id}']&&m.getState().studies[0].measurements.GLOBAL_SVA_PX===70)`);
  check('posterior S1 nudge updates the global distance', true);
  const anterior = await cdp.toClient(220, 1050); await cdp.click(anterior.x, anterior.y);
  check('S1 anterior corner is the third editable handle', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().selection?.level==='S1'&&m.getState().selection?.corner==='SA')"));
  await cdp.key('ArrowUp');
  await until(`import('./renderer/store.js').then(m=>!m.getState().measurementDrafts['${id}']&&m.getState().studies[0].geometry.s1_superior[0][1]===1049)`);
  check('anterior S1 correction preserves the posterior-based SVA', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().studies[0].measurements.GLOBAL_SVA_PX===70)"));
  await cdp.evaluate(`(async()=>{
    const s=(await import('./renderer/store.js')).getState().studies[0];const api=await import('./renderer/api.js');
    const c={...s.calibration,status:'corrected',spacing:{row_mm:.2,column_mm:.2,source:'manual_reference'},
      candidates:[{endpoints:[[40,200],[40,300]],length_px:100,value_mm:20,status:'accepted'}],selected_index:0};
    const saved=await api.saveCalibration(c);(await import('./renderer/calibration.js')).rememberCalibration(s.filePath,saved);
  })()`);
  check('explicit synthetic calibration updates visible SVA to 14 mm', await cdp.evaluate("document.querySelector('[data-row-key=\"GLOBAL_SVA\"] .meas-value').textContent==='14.0mm'"));
  check('CSV includes calibrated global values with full-spine identity', await cdp.evaluate(`(async()=>{
    const s=(await import('./renderer/store.js')).getState().studies[0];const {toCsv,parse}=await import('./renderer/data/csv.js');
    const row=parse(toCsv([s]).split('\\r\\n').slice(3).join('\\r\\n')).rows[0];
    return row['C7-S1 SVA (mm)']==='14'&&row['C7-S1 SVA (px)']==='70'&&row['Spine region']==='full_spine';
  })()`));
  await cdp.evaluate("[...document.querySelectorAll('.viewer-editbar button')].find(b=>b.textContent.trim()==='RESET TO PREDICTION').click()");
  check('reset restores original C7 and S1 while retaining current scale', await cdp.evaluate(`import('./renderer/store.js').then(m=>{
    const s=m.getState().studies[0];return s.geometry.c7_centroid[0]===270&&s.geometry.s1_superior[0][1]===1050&&s.geometry.s1_superior[1][0]===340&&s.calibration.spacing.column_mm===.2;
  })`));
  await cdp.evaluate(`(async()=>{
    const s=(await import('./renderer/store.js')).getState().studies[0];const c=await (await import('./renderer/api.js')).saveCalibration({...s.calibration,status:'cleared',spacing:null,selected_index:null});
    (await import('./renderer/calibration.js')).rememberCalibration(s.filePath,c);
  })()`);
  check('cleared scale restores labelled pixels', await cdp.evaluate("document.querySelector('[data-row-key=\"GLOBAL_SVA\"]').textContent.includes('UNCALIBRATED')&&document.querySelector('[data-row-key=\"GLOBAL_SVA\"] .meas-value').textContent==='70.0px'"));
  await cdp.setState('{editing:false}');
  await wait(300); await openSavedStudy();
  check('geometry, full-spine region, orientation and cleared calibration survive reload', await cdp.evaluate("import('./renderer/store.js').then(m=>{const s=m.getState().studies[0];return s.region==='full_spine'&&s.anteriorSide==='left'&&s.geometry.c7_centroid[0]===270&&s.calibration.status==='cleared';})"));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.screenshot(path.join(out, 'synthetic-global-sva-compact.png'));
  check('global measurement panel fits the compact window', await cdp.evaluate("document.querySelector('.meas-panel').getBoundingClientRect().right<=innerWidth"));
  check('no renderer errors during synthetic workflow', cdp.errors.length === 0);
} finally {
  const result = { synthetic: true, model_inference: false, passed: checks.filter(c => c.ok).length,
    total: checks.length, checks, errors: cdp?.errors ?? [] };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  cdp?.close();
  if (app.exitCode === null) await quitApp(port);
  fs.closeSync(log);
}
