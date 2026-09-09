// Scratch-profile desktop regression: real /measure, viewer input and disk I/O.
// Optional file arguments also exercise the production batch with real model inference.
// Geometry fixtures test software behavior, not anatomical accuracy. No screenshots.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { connect } from './cdp-lib.mjs';

const cdp = await connect();
const checks = [];
const out = path.resolve('tools/smoke/out/partial-segmentation');
fs.mkdirSync(out, { recursive: true });
function check(name, value) { checks.push({ name, ok: Boolean(value) }); assert.ok(value, name); }
async function until(expression, attempts = 120) {
  for (let i = 0; i < attempts; i++) {
    if (await cdp.evaluate(expression)) return;
    await cdp.settle(100);
  }
  throw new Error(`Timed out: ${expression}`);
}

try {
  await cdp.send('Page.reload', { ignoreCache: true });
  await cdp.settle(700);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate(`(async()=>{
    const store=await import('./renderer/store.js'), api=await import('./renderer/api.js');
    const canvas=document.createElement('canvas'); canvas.width=400; canvas.height=400;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#171d23'; ctx.fillRect(0,0,400,400);
    const image_png=canvas.toDataURL('image/png').split(',')[1];
    ctx.fillStyle='black'; ctx.fillRect(0,0,400,400);
    const mask_png=canvas.toDataURL('image/png').split(',')[1];
    const vertebrae={L1:{superior:[[60,70],[260,70]],inferior:[[60,140],[260,140]],
      quadrilateral:[[60,70],[260,70],[260,140],[60,140]],anterior_confirmed:false}};
    const result=await api.measure({vertebrae,s1_superior:null,femoral_circles:[]});
    window.partialOriginal=structuredClone(result);
    window.partialImages={image_png,mask_png,femoral_mask_png:mask_png,labels:{BACKGROUND:0}};
    await api.savePrediction('SP-9901',{...result,...window.partialImages});
    const study={id:'SP-9901',source:'real',fileName:'partial-software-fixture.png',
      filePath:'/test/partial-software-fixture.png',name:'Partial software regression',
      addedAt:new Date().toISOString(),view:'Standing lateral',clinical:{},...result};
    store.setState({studies:[study],ack:true,screen:'studies',openId:null,batch:null,running:null,measurementDrafts:{}});
    store.setState({screen:'analysis',openId:study.id,editing:false,selectedLevel:'L1',tab:'meas'});
  })()`);
  await until("document.querySelector('.viewer-canvas-dynamic')?.width===400 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
  check('L1-only result opens with partial-anatomy notice', await cdp.evaluate("document.querySelector('.meas-panel').textContent.includes('Partial segmentation')"));
  check('unsupported angles and disc heights are blank in the live panel', await cdp.evaluate("[...document.querySelectorAll('.meas-value')].every(el=>el.textContent==='—')"));
  await cdp.send('Page.bringToFront');
  const point = await cdp.toClient(160, 105);
  await cdp.click(point.x, point.y);
  await cdp.setState('{editing:true,selection:null,selectedLevel:null}');
  for (let i = 0; i < 5; i++) await cdp.key('Tab');
  check('trusted Tab cycles only the four L1 handles', await cdp.evaluate("import('./renderer/store.js').then(m=>{const s=m.getState().selection;return s.level==='L1'&&s.corner==='SA';})"));
  await cdp.key('ArrowRight');
  await until("import('./renderer/store.js').then(m=>{const s=m.getState();return !s.measurementDrafts['SP-9901']&&s.studies[0].geometry.vertebrae.L1.superior[0][0]===61;})");
  check('partial correction passes the real backend and preserves absent anatomy', await cdp.evaluate("import('./renderer/store.js').then(m=>{const s=m.getState().studies[0];return s.geometry.s1_superior===null&&s.geometry.femoral_circles.length===0&&s.geometry.vertebrae.L1.anterior_confirmed===false&&s.measurements.PI===null;})"));
  await cdp.settle(250);
  check('corrected partial result survives disk validation', await cdp.evaluate(`(async()=>{
    const api=await import('./renderer/api.js'),{validate}=await import('./renderer/data/persistence.js');
    const saved=validate(await window.spineContour.loadStudies()).find(s=>s.id==='SP-9901');
    return saved.geometry.vertebrae.L1.superior[0][0]===61&&saved.measurements.PI===null&&saved.qc.coverage.partial;
  })()`));
  await cdp.evaluate("[...document.querySelectorAll('.viewer-editbar button')].find(b=>b.textContent.trim()==='RESET TO PREDICTION').click()");
  check('reset restores the original partial prediction', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().studies[0].geometry.vertebrae.L1.superior[0][0]===60)"));
  await cdp.setState('{editing:false}');
  await cdp.send('Page.reload', { ignoreCache: true });
  await cdp.settle(700);
  await cdp.setState("{ack:true,screen:'analysis',openId:'SP-9901',editing:false,selectedLevel:'L1',tab:'meas'}");
  await until("document.querySelector('.viewer-canvas-dynamic')?.width===400");
  check('app reload restores the partial study and its image sidecar', await cdp.evaluate("import('./renderer/store.js').then(m=>{const s=m.getState().studies.find(s=>s.id==='SP-9901');return Object.keys(s.geometry.vertebrae).join(',')==='L1'&&s.qc.coverage.partial;})"));

  const files = process.argv.slice(2).map(file => path.resolve(file));
  if (files.length) {
    await cdp.evaluate(`(async()=>{
      const {setState}=await import('./renderer/store.js');
      const files=${JSON.stringify(files)};
      setState({studies:files.map((file,i)=>({id:'SP-'+(9950+i),source:'real',fileName:file.split('/').pop(),
        filePath:file,addedAt:new Date().toISOString(),view:'Standing lateral',clinical:{},
        measurements:null,geometry:null,qc:null})),screen:'studies',openId:null,editing:false,
        studiesTab:'find',query:'',paramSelected:[],paramFilters:{workspace:null,folder:null,segmentedOnly:false}});
      const {startBatch}=await import('./renderer/batch.js');
      window.partialBatchPromise=startBatch(files.map((_,i)=>'SP-'+(9950+i)));
    })()`);
    await until("import('./renderer/store.js').then(m=>!m.getState().batch&&!m.getState().running)", 6000);
    const summary = await cdp.evaluate(`import('./renderer/store.js').then(m=>m.getState().studies.map(s=>({
      fileName:s.fileName,ok:s.measurements!==null,levels:Object.keys(s.geometry?.vertebrae||{}),
      measurements:s.measurements,qc:s.qc,calibration:s.calibration?.status})))`);
    fs.writeFileSync(path.join(out, 'real-batch.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ realBatch: summary }));
    check('real example batch retains usable partial results', summary.every(s => s.ok && s.levels.length));
    check('real batch has partial coverage rather than pretending every film is complete', summary.some(s => s.qc?.coverage?.partial));
    await cdp.setState("{screen:'analysis',openId:'SP-9950',selectedLevel:'L1',tab:'meas'}");
    await until("document.querySelector('.viewer-canvas-dynamic')?.width>1 && document.querySelector('.meas-panel')?.textContent.includes('Partial segmentation')");
    check('real partial result opens in the viewer', true);
  }
  check('no renderer errors', cdp.errors.length === 0);
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, errors: cdp.errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.filter(c => c.ok).length, total: checks.length, checks, errors: cdp.errors }, null, 2));
  cdp.close();
}
