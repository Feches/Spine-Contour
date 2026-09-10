// Real desktop/IPC/inference coverage, with local images in an isolated profile.
// CDP_PORT=9340 node tools/smoke/smoke-onnx-localizer.mjs image.webp ...
import fs from 'node:fs';
import { connect } from './cdp-lib.mjs';

const cdp = await connect();
const files = process.argv.slice(2);
if (!files.length) throw new Error('Supply local lumbar images');
const checks = [];
function check(name, passed) { checks.push({ name, passed }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); }
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
  check('new settings default localizer on', await cdp.evaluate("window.spineContour.loadPerformance().then(s=>s.cropLocalizer===true)"));
  check('Settings explains full-spine versus lumbar-only use', await cdp.evaluate("['full-spine','lumbar-only'].every(text=>document.querySelector('.processing-settings').textContent.includes(text))"));
  await click('[aria-label="Crop localizer"] button:nth-child(2)');
  await until("window.spineContour.loadPerformance().then(s=>s.cropLocalizer===false)");
  await cdp.send('Page.reload', { ignoreCache: true });
  await cdp.settle(800);
  check('explicit off survives save and reload', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().performance.cropLocalizer===false)"));
  await cdp.evaluate(`(async()=>{
    const {setState,subscribe,getState}=await import('./renderer/store.js');
    const files=${JSON.stringify(files)};
    setState({ack:true,screen:'studies',settingsOpen:true,studies:files.map((file,i)=>({
      id:'SP-'+(9950+i),source:'real',fileName:file.split('/').pop(),filePath:file,
      addedAt:new Date().toISOString(),view:'Standing lateral',clinical:{},
      measurements:null,geometry:null,qc:null})),openId:null,studiesTab:'find',
      paramSelected:[],paramFilters:{workspace:null,folder:null,segmentedOnly:false}});
    window.onnxEvents=[];
    window.unsubscribeOnnxSmoke=subscribe(s=>{if(s.runStage)window.onnxEvents.push(structuredClone(s.runStage));});
    const {startBatch}=await import('./renderer/batch.js');
    window.onnxBatch=startBatch(getState().studies.map(s=>s.id));
  })()`);
  await until("import('./renderer/store.js').then(m=>Boolean(m.getState().running))");
  check('crop choices disabled during batch', await cdp.evaluate("[...document.querySelectorAll('[aria-label=\"Crop localizer\"] button')].every(b=>b.disabled)"));
  await until("import('./renderer/store.js').then(m=>!m.getState().running&&!m.getState().batch)", 600000);
  check('all supplied images complete through ONNX with localizer off', await cdp.evaluate("import('./renderer/store.js').then(m=>m.getState().studies.every(s=>s.measurements&&s.qc.processing.runtime==='onnxruntime'&&s.qc.framing.crop_localizer===false&&!s.qc.framing.searched))"));
  check('off reports real model stages without search', await cdp.evaluate("!window.onnxEvents.some(e=>e.stage==='search')&&['s1','femoral','vertebra','measuring','calibration','saving'].every(stage=>window.onnxEvents.some(e=>e.stage===stage))"));
  const original = await cdp.evaluate("import('./renderer/store.js').then(m=>JSON.stringify(m.getState().studies[0].measurements))");
  await click('[aria-label="Crop localizer"] button:first-child');
  await until("window.spineContour.loadPerformance().then(s=>s.cropLocalizer===true)");
  await click('[aria-label="Processing mode"] button:nth-child(2)');
  await until("window.spineContour.loadPerformance().then(s=>s.mode==='low-memory')");
  await cdp.evaluate("import('./renderer/screens/analysis.js').then(m=>{window.onnxRerun=m.segmentStudy('SP-9950')})");
  await until("import('./renderer/store.js').then(m=>m.getState().runStage?.stage==='search'&&m.getState().runStage.completed>0)");
  check('on restores live search counts in low-memory mode', await cdp.evaluate("document.querySelector('.sidebar-processing').textContent.includes('regions checked')"));
  await click('.sidebar-processing button');
  await until("import('./renderer/store.js').then(m=>!m.getState().running)");
  check('cancelling ONNX search retains saved measurements', original === await cdp.evaluate("import('./renderer/store.js').then(m=>JSON.stringify(m.getState().studies[0].measurements))"));
  const saved = await cdp.evaluate('window.spineContour.loadStudies()');
  check('saved results retain runtime and localizer provenance', saved.studies.filter(s=>/^SP-995/.test(s.id)).length===files.length&&saved.studies.filter(s=>/^SP-995/.test(s.id)).every(s=>s.qc?.processing.runtime==='onnxruntime'&&s.qc.framing.crop_localizer===false));
  check('no renderer exceptions', cdp.errors.length === 0);
} finally {
  fs.mkdirSync('tools/smoke/out/onnx', { recursive: true });
  fs.writeFileSync('tools/smoke/out/onnx/results.json', JSON.stringify({ checks, errors: cdp.errors }, null, 2));
  cdp.close();
}
if (checks.some(check=>!check.passed)) process.exitCode = 1;
