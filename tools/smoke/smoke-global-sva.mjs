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
// (2026-10-10) SMOKE_GLOBAL_SVA_PROFILE and SPINE_CONTOUR_PYTHON override the macOS defaults, so the suite also runs
// on Windows (a %TEMP% profile and the venv's Scripts\python.exe).
const profile = process.env.SMOKE_GLOBAL_SVA_PROFILE || '/tmp/spine-contour-combined-film-ui-20260925';
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
  SPINE_CONTOUR_PYTHON: process.env.SPINE_CONTOUR_PYTHON || path.join(root, '.venv/bin/python'), SPINE_CONTOUR_ORT_CPU_ONLY: '1' };
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
  check('standing-film orientation offers automatic detection', await cdp.evaluate(`(()=>{
    const e=document.querySelector('[aria-label="Full spine anterior image side"]');
    return e&&[...e.options].some(o=>o.value===''&&o.textContent.includes('Auto'));
  })()`));
  await until("document.querySelector('.viewer-canvas-dynamic')?.width===600 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
  check('synthetic original is previewed without invented measurements', await cdp.evaluate(`import('./renderer/store.js').then(m=>m.getState().studies[0].geometry===null)`));
  await cdp.evaluate("(()=>{const e=document.querySelector('[aria-label=\"Full spine anterior image side\"]');e.value='left';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const initial = await cdp.evaluate(`(async()=>{
    const api=await import('./renderer/api.js');const {getState,setState}=await import('./renderer/store.js');
    const body=(x,y)=>({superior:[[x-40,y],[x+40,y+4]],inferior:[[x-40,y+35],[x+40,y+39]],
      quadrilateral:[[x-40,y],[x+40,y+4],[x+40,y+39],[x-40,y+35]]});
    const vertebrae={C2:{superior:null,inferior:[[230,100],[310,105]],quadrilateral:null}};
    for(let level=3;level<=7;level++)vertebrae['C'+level]=body(270,120+(level-3)*50);
    for(let level=1;level<=5;level++)vertebrae['L'+level]=body(280,600+(level-1)*85);
    const geometry={region:'full_spine',anterior_side:'left',c2_centroid:[270,80],c7_centroid:[270,340],
      vertebrae,femoral_circles:[[250,1110,35],[320,1110,35]],s1_superior:[[220,1050],[340,1050]],
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
  check('standing film also returns cervical and lumbar parameters',
    Number.isFinite(initial.C2C7_COBB)&&Number.isFinite(initial.C2C7_SVA_PX)&&Number.isFinite(initial.LL['L1-S1'])&&Number.isFinite(initial.PI));
  await until(`import('./renderer/api.js').then(m=>m.loadStudies()).then(rows=>rows.some(s=>s.id==='${id}'&&s.predictionId==='synthetic-global-sva'&&s.measurements?.GLOBAL_SVA_PX===70))`);
  await openSavedStudy();
  check('saved sidecar restores global, cervical and lumbar rows together', await cdp.evaluate("document.querySelector('[data-row-key=\"GLOBAL_SVA\"]')&&document.querySelector('[data-row-key=\"C2C7_SVA\"]')&&document.querySelector('[data-row-key=\"LL\"]')"));
  check('global overlay is labelled with explicit uncalibrated pixels', await cdp.evaluate("document.querySelector('.viewer-label')?.textContent.includes('C7–S1 SVA 70.0 px')"));
  await cdp.screenshot(path.join(out, 'synthetic-global-sva.png'));
  // (2026-10-10) Edit mode is the level editor's: entered through the Edit segmentation button; a level is selected
  // and its handle focused through the page's renderer/level-editor.js, and the arrows nudge the focused handle.
  // C7 is a body (four corners) in the level editor, and the projection derives c7_centroid as their mean, so the
  // centroid moves 1 px when all four corners do.
  await cdp.setState('{selection:null,panMode:false}');
  await cdp.send('Page.bringToFront');
  await cdp.evaluate("document.querySelector('[aria-label=\"Edit segmentation\"]').click()");
  await until("import('./renderer/store.js').then(m=>Boolean(m.getState().levelEditor))");
  await wait(250);
  const focus = (code, handle) => cdp.evaluate(`import('./renderer/level-editor.js').then(m=>{m.selectLevelRow('${code}');m.setFocusedHandle({code:'${code}',handle:'${handle}'});const a=document.activeElement;if(a&&a.blur)a.blur();return true;})`);
  const focused = () => cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().levelEditor?.handle??null)");
  check('both femoral heads are placeable from the levels panel for standing-film pelvic measures', await cdp.evaluate("Boolean(document.querySelector('[data-level-key=\"place:FH1\"]')&&document.querySelector('[data-level-key=\"place:FH2\"]'))"));
  await focus('C7', 'SA');
  check('C7 is selectable for editing: its corners are handles', await cdp.evaluate("import('./renderer/viewer/level-handles.js').then(async h=>{const e=(await import('./renderer/store.js')).getState().levelEditor;return h.levelHandles('C7',e.levels.C7.geometry).map(x=>x.handle).join(',')==='SA,SP,IA,IP'&&e.selected==='C7';})"));
  for (const corner of ['SA', 'SP', 'IA', 'IP']) { await focus('C7', corner); await cdp.key('ArrowRight'); await wait(60); }
  await until(`import('./renderer/store.js').then(m=>!m.getState().measurementDrafts['${id}']&&m.getState().studies[0].measurements.GLOBAL_SVA_PX===69)`);
  check('nudging the four C7 corners 1 px moves its centroid 1 px and recalculates through real backend', true);
  await focus('S1', 'SP');
  const sp = await focused();
  check('S1 posterior corner is selectable for editing', sp?.code==='S1'&&sp?.handle==='SP');
  await cdp.key('ArrowRight');
  await until(`import('./renderer/store.js').then(m=>!m.getState().measurementDrafts['${id}']&&m.getState().studies[0].measurements.GLOBAL_SVA_PX===70)`);
  check('posterior S1 nudge updates the global distance', true);
  await focus('S1', 'SA');
  const saHandle = await focused();
  check('S1 anterior corner is editable too', saHandle?.code==='S1'&&saHandle?.handle==='SA');
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
    const row=parse(toCsv([s]).split('\\r\\n').slice(2).join('\\r\\n')).rows[0];
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
  // After the reset nothing is unsaved, so DONE leaves edit mode at once.
  await cdp.evaluate("document.querySelector('.viewer-editbar > button:last-of-type').click()");
  await until("import('./renderer/store.js').then(m=>!m.getState().editing&&!m.getState().levelEditor)");
  await wait(300); await openSavedStudy();
  check('geometry, full-spine region, orientation and cleared calibration survive reload', await cdp.evaluate("import('./renderer/store.js').then(m=>{const s=m.getState().studies[0];return s.region==='full_spine'&&s.anteriorSide==='left'&&s.geometry.c7_centroid[0]===270&&s.calibration.status==='cleared';})"));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.screenshot(path.join(out, 'synthetic-global-sva-compact.png'));
  // Within half a CSS pixel: on a scaled Windows display (150%) the panel's right edge measured 1100.00003 in a
  // 1100-px viewport, float noise from the fractional device pixel, not an overflow (2026-10-10).
  check('global measurement panel fits the compact window', await cdp.evaluate("document.querySelector('.meas-panel').getBoundingClientRect().right<=innerWidth+0.5"));
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
