// Accuracy safeguards on a scratch profile. Synthetic image/geometry and delayed
// measurement promises exercise UI and disk persistence; they do not validate anatomy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { connect } from './cdp-lib.mjs';

const cdp = await connect();
const out = path.resolve('tools/smoke/out/accuracy');
fs.mkdirSync(out, { recursive: true });
const checks = [];
function check(name, value) { checks.push({ name, ok: Boolean(value) }); assert.ok(value, name); }
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await cdp.evaluate(expression)) return;
    await cdp.settle(100);
  }
  throw new Error(`Timed out: ${expression}`);
}
try {
  // Re-import the app after source changes; no live library is used by this suite.
  await cdp.send('Page.reload');
  await cdp.settle(700);
  await cdp.evaluate(`(async () => {
    const store = await import('./renderer/store.js');
    const api = await import('./renderer/api.js');
    const canvas = document.createElement('canvas'); canvas.width=600; canvas.height=900;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#171d23'; ctx.fillRect(0,0,600,900);
    ctx.fillStyle='#8d9eaa'; ctx.font='18px sans-serif'; ctx.fillText('SYNTHETIC TEST IMAGE',30,50);
    const vertebrae={};
    for(let i=1;i<=5;i++) {
      const y=80+i*90;
      vertebrae['L'+i]={superior:[[210,y],[360,y-10]],inferior:[[210,y+48],[360,y+38]],quadrilateral:[[210,y],[360,y-10],[360,y+38],[210,y+48]]};
      ctx.beginPath(); for(const [x,y] of vertebrae['L'+i].quadrilateral)ctx.lineTo(x,y); ctx.closePath();ctx.fill();
    }
    const s1_superior=[[210,650],[360,610]], femoral_circles=[[245,780,45],[285,780,45]];
    for(const [x,y,r] of femoral_circles){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle='#8d9eaa';ctx.lineWidth=3;ctx.stroke();}
    const image_png=canvas.toDataURL('image/png').split(',')[1];
    ctx.fillStyle='black';ctx.fillRect(0,0,600,900);
    const mask_png=canvas.toDataURL('image/png').split(',')[1];
    const result=await api.measure({vertebrae,s1_superior,femoral_circles});
    const qc={femoral:{confidence:.95},framing:{s1_confidence:.01,search_confidence:.95,searched:true}};
    const response={...result,image_png,mask_png,femoral_mask_png:mask_png,labels:{BACKGROUND:0},qc};
    await api.savePrediction('SP-8801',response);
    const study={id:'SP-8801',source:'real',fileName:'synthetic-lateral.png',filePath:null,name:'Synthetic lateral · review example',addedAt:new Date().toISOString(),view:'Standing lateral',thumbnail:null,clinical:{},...result,qc};
    window.accuracyOriginal=structuredClone(study);
    store.setState({studies:[study],ack:true,screen:'analysis',openId:study.id,editing:false,selectedLevel:'SS',tab:'meas',batch:null,running:null,measurementDrafts:{}});
  })()`);
  await until("document.querySelector('.viewer-stage canvas')?.width === 600 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
  check('S1 review warning is visible', await cdp.evaluate("document.querySelector('.meas-panel').textContent.includes('S1 detection needs review')"));
  check('S1 warning is independent of angle consistency', await cdp.evaluate("!document.querySelector('.meas-panel').textContent.includes('Parameters inconsistent')"));
  check('low S1 score derives Needs review', await cdp.evaluate("import('./renderer/data/status.js').then(m=>m.deriveStatus(window.accuracyOriginal)==='rev')"));
  await cdp.screenshot(path.join(out,'s1-review.png'));

  // Deliberately hold a correction while the actual saver writes a metadata edit.
  await cdp.evaluate(`(async()=>{
    const store=await import('./renderer/store.js');
    const {createMeasureQueue}=await import('./renderer/viewer/measure-queue.js');
    window.accuracyQueue=createMeasureQueue({getState:store.getState,setState:store.setState,showToast:()=>{},debounceMs:10,
      measure:()=>new Promise((resolve,reject)=>{window.accuracyResolve=resolve;window.accuracyReject=reject;})});
    window.accuracyQueue.replaceMeasured('SP-8801',window.accuracyOriginal.geometry);
    const geometry=structuredClone(window.accuracyOriginal.geometry);geometry.s1_superior[0][1]+=30;
    window.accuracyCorrected=geometry;
    window.accuracyQueue.commitGeometry('SP-8801',geometry);
    store.setState(s=>({studies:s.studies.map(x=>({...x,name:'Synthetic lateral · pending edit'}))}));
  })()`);
  await until("typeof window.accuracyResolve === 'function'");
  check('pending correction hides numeric values', await cdp.evaluate("[...document.querySelectorAll('.meas-value')].every(e=>e.textContent==='—') && document.querySelector('.meas-panel').textContent.includes('Updating measurements')"));
  await cdp.screenshot(path.join(out,'pending-correction.png'));
  await cdp.settle(250);
  check('disk retains the previous geometry and measurements during pending edit', await cdp.evaluate(`(async()=>{
    const raw=await window.spineContour.loadStudies();const saved=raw.studies.find(s=>s.id==='SP-8801');
    return JSON.stringify(saved.geometry)===JSON.stringify(window.accuracyOriginal.geometry)
      && JSON.stringify(saved.measurements)===JSON.stringify(window.accuracyOriginal.measurements)
      && saved.name.includes('pending edit');
  })()`));
  await cdp.evaluate(`(async()=>{
    const api=await import('./renderer/api.js');const g=window.accuracyCorrected;
    window.accuracyResolve(await api.measure({vertebrae:g.vertebrae,s1_superior:g.s1_superior,femoral_circles:g.femoral_circles}));
  })()`);
  await until("import('./renderer/store.js').then(m=>!m.getState().measurementDrafts['SP-8801'])");
  check('successful recalculation restores numeric values', await cdp.evaluate("document.querySelector('[data-row-key=SS] .meas-value').textContent!=='—'"));
  await cdp.settle(200);
  check('disk receives the corrected pair together', await cdp.evaluate(`(async()=>{
    const raw=await window.spineContour.loadStudies();const saved=raw.studies.find(s=>s.id==='SP-8801');
    const state=(await import('./renderer/store.js')).getState();const study=state.studies[0];
    return JSON.stringify(saved.geometry)===JSON.stringify(study.geometry)
      && JSON.stringify(saved.measurements)===JSON.stringify(study.measurements)
      && saved.geometry.s1_superior[0][1]===window.accuracyCorrected.s1_superior[0][1];
  })()`));
  await cdp.evaluate(`(async()=>{
    const {getState}=await import('./renderer/store.js');window.accuracyBeforeFailure=structuredClone(getState().studies[0]);
    window.accuracyResolve=null;
    window.accuracyQueue.commitGeometry('SP-8801',window.accuracyOriginal.geometry);
  })()`);
  await until("typeof window.accuracyResolve === 'function'");
  await cdp.evaluate("window.accuracyReject(new Error('Synthetic measurement failure'))");
  await until("import('./renderer/store.js').then(m=>!m.getState().measurementDrafts['SP-8801'])");
  check('failed correction preserves the previously measured pair', await cdp.evaluate("import('./renderer/store.js').then(m=>JSON.stringify(m.getState().studies[0])===JSON.stringify(window.accuracyBeforeFailure))"));

  // A mislabeled view is refused before even trying its nonexistent source path.
  await cdp.evaluate(`(async()=>{
    const {setState}=await import('./renderer/store.js');
    setState(s=>({studies:[...s.studies,{...window.accuracyOriginal,id:'SP-8802',name:'Synthetic AP · excluded',view:'AP',fileName:'synthetic-ap.png',filePath:'/nonexistent/accuracy-ap.png',geometry:null,measurements:null,qc:null}],screen:'studies',query:'',studiesTab:'find',paramSelected:[],paramFilters:{workspace:null,folder:null,segmentedOnly:false}}));
  })()`);
  check('batch plan visibly excludes AP', await cdp.evaluate("document.body.textContent.includes('1 unsupported view excluded')"));
  check('AP row is labelled unsupported, not processing', await cdp.evaluate("document.querySelector('[data-study-id=\"SP-8802\"] .badge').textContent==='Unsupported view'"));
  await cdp.screenshot(path.join(out,'unsupported-view.png'));
  check('single-film core refuses AP before file loading', await cdp.evaluate("import('./renderer/screens/analysis.js').then(async m=>{const r=await m.segmentStudy('SP-8802');return !r.ok && r.reason.includes('Unsupported view');})"));
  await cdp.setState("{screen:'analysis',openId:'SP-8802'}");
  check('unsupported-view card explains how to proceed', await cdp.evaluate("document.querySelector('.run-card').textContent.includes('Choose a lateral view') && document.querySelector('.run-button').classList.contains('is-hidden')"));
  check('no console errors', cdp.errors.length===0);
} finally {
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors:cdp.errors},null,2));
  console.log(JSON.stringify({passed:checks.filter(x=>x.ok).length,total:checks.length,checks,errors:cdp.errors},null,2));
  cdp.close();
}
