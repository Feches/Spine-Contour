// Actual Electron/IPC/backend smoke on user-provided local examples. Scratch profile only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { connect } from './cdp-lib.mjs';

const files = process.argv.slice(2).map(file => path.resolve(file));
assert.ok(files.length >= 2, 'Provide at least two local examples');
const cdp = await connect();
const checks = [];
const out = path.resolve('tools/smoke/out/processing');
fs.mkdirSync(out, { recursive: true });
function check(name, value) {
  checks.push({ name, ok: Boolean(value) });
  console.log(JSON.stringify(checks.at(-1)));
  assert.ok(value, name);
}
async function until(expression, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await cdp.settle(200);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function click(selector) {
  await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  const point = await cdp.rect(selector);
  await cdp.click(point.cx, point.cy);
}

try {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.setState("{ack:true,screen:'studies',studies:[],settingsOpen:true}");
  await click('.processing-settings .model-choice-btn:nth-child(2)');
  await until("window.spineContour.loadPerformance().then(s=>s.mode==='low-memory')");
  check('low-memory mode selected through Settings and written to disk', true);
  await cdp.send('Page.reload', { ignoreCache: true });
  await cdp.settle(800);
  check('processing settings survive reload', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().performance.mode==='low-memory')"));
  await cdp.evaluate(`(async()=>{
    const {setState,subscribe,getState}=await import('./renderer/store.js');
    const files=${JSON.stringify(files)};
    setState({ack:true,screen:'studies',settingsOpen:true,studies:files.map((file,i)=>({
      id:'SP-'+(9970+i),source:'real',fileName:file.split('/').pop(),filePath:file,
      addedAt:new Date().toISOString(),view:'Standing lateral',clinical:{},
      measurements:null,geometry:null,qc:null})),openId:null,studiesTab:'find',
      paramSelected:[],paramFilters:{workspace:null,folder:null,segmentedOnly:false}});
    window.processingEvents=[];
    window.unsubscribeProcessingSmoke=subscribe(s=>{if(s.runStage)window.processingEvents.push(structuredClone(s.runStage));});
    const {startBatch}=await import('./renderer/batch.js');
    window.processingBatch=startBatch(getState().studies.map(s=>s.id));
  })()`);
  await until("import('./renderer/store.js').then(m=>m.getState().runStage?.stage==='search'&&m.getState().runStage.completed>0)");
  check('real search counts and elapsed time reach the Studies screen', await cdp.evaluate("document.querySelector('.study-processing-detail').textContent.includes('regions checked')&&document.querySelector('.sidebar-processing').textContent.includes('elapsed')"));
  check('resource and model choices are disabled during a batch', await cdp.evaluate("[...document.querySelectorAll('.processing-settings button,.sidebar-models .model-choice-btn')].every(b=>b.disabled)"));
  await cdp.evaluate("window.processingCard=document.querySelector('.sidebar-processing');window.processingTable=document.querySelector('.studies-table');window.processingCount=window.processingEvents.length");
  await until("window.processingEvents.length>window.processingCount+2");
  check('progress updates preserve the live card and study table nodes', await cdp.evaluate("Boolean(window.processingCard&&window.processingTable)&&window.processingCard===document.querySelector('.sidebar-processing')&&window.processingTable===document.querySelector('.studies-table')"));
  await click('.sidebar-processing button');
  await until("import('./renderer/store.js').then(m=>!m.getState().running&&!m.getState().batch)");
  check('cancellation stops the batch without writing partial results', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().studies.every(s=>s.measurements===null))"));
  check('cancelled batch is described as cancelled', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().toast.includes('cancelled')&&!m.getState().toast.includes('deleted'))"));

  await cdp.evaluate(`(async()=>{
    const {getState,setState}=await import('./renderer/store.js');
    setState({settingsOpen:false});
    const {startBatch}=await import('./renderer/batch.js');
    window.processingBatch=startBatch(getState().studies.map(s=>s.id));
  })()`);
  await until("import('./renderer/store.js').then(m=>m.getState().runStage?.stage==='search')");
  await cdp.setState("{screen:'analysis',openId:'SP-9970',selectedLevel:null,editing:false}");
  await until("document.querySelector('.run-title')?.textContent.includes('Searching')");
  check('Analysis shows live stages and exposes cancellation', await cdp.evaluate("document.querySelector('.run-body').textContent.includes('elapsed')&&[...document.querySelectorAll('.run-card button')].some(b=>b.textContent==='Cancel processing'&&!b.classList.contains('is-hidden'))"));
  await cdp.setState("{screen:'studies',openId:'SP-9970'}");
  await until("import('./renderer/store.js').then(m=>!m.getState().batch&&!m.getState().running)", 20 * 60 * 1000);
  check('all real examples complete in low-memory mode', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().studies.every(s=>s.measurements&&s.qc.processing.mode==='low-memory'&&s.qc.processing.search_batch===1))"));
  check('missing femoral heads remain valid partial results', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().studies.some(s=>s.geometry.femoral_circles.length===0&&s.measurements.PI===null))"));
  check('real model and calibration stages were delivered', await cdp.evaluate("['search','femoral','vertebra','measuring','calibration','ocr','saving'].every(stage=>window.processingEvents.some(e=>e.stage===stage))"));
  const saved = await cdp.evaluate("window.spineContour.loadStudies()");
  check('completed measurements survive disk serialization', saved.studies.filter(s=>/^SP-997/.test(s.id)).length===files.length&&saved.studies.filter(s=>/^SP-997/.test(s.id)).every(s=>s.measurements&&s.qc.processing.mode==='low-memory'));
  const original = await cdp.evaluate("import('./renderer/store.js').then(m=>JSON.stringify(m.getState().studies[0].measurements))");
  // Cancel a re-run as well: the already saved measurements must remain intact.
  await cdp.evaluate("import('./renderer/screens/analysis.js').then(m=>{window.cancelledRerun=m.segmentStudy('SP-9970')})");
  await until("import('./renderer/store.js').then(m=>m.getState().runStage?.stage==='search'&&m.getState().runStage.completed>0)");
  await click('.sidebar-processing button');
  await until("import('./renderer/store.js').then(m=>!m.getState().running)");
  check('cancelled re-run keeps previous measurements', original === await cdp.evaluate("import('./renderer/store.js').then(m=>JSON.stringify(m.getState().studies[0].measurements))"));
  await cdp.send('Page.reload', { ignoreCache: true });
  await cdp.settle(800);
  check('completed studies and mode survive app reload', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().performance.mode==='low-memory'&&m.getState().studies.filter(s=>/^SP-997/.test(s.id)).every(s=>s.measurements))"));
  await cdp.setState("{ack:true,screen:'studies',settingsOpen:true,studiesTab:'find'}");
  check('no renderer errors', cdp.errors.length === 0);
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, errors: cdp.errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.filter(c => c.ok).length, total: checks.length, errors: cdp.errors }));
  cdp.close();
}
