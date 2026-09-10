// Run save, batch, then verify on a scratch profile, quitting/relaunching between
// phases. Pass two LOCAL lumbar images. No images/screenshots are written to git.
import assert from 'node:assert/strict';
import path from 'node:path';
import { connect } from './cdp-lib.mjs';

const [phase, ...args] = process.argv.slice(2);
if (!['save', 'batch', 'verify'].includes(phase) || args.length !== 2) throw new Error('Pass save|batch|verify and two local image paths.');
const files = args.map(p => path.resolve(p));
const c = await connect();
let checks = 0;
const check = (name, ok) => { assert.ok(ok, name); checks++; console.log(`PASS ${name}`); };
async function until(expression, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await c.evaluate(expression)) return;
    await c.settle(100);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function openImage(i) {
  const study = (await c.state()).studies.find(s => s.filePath === files[i]);
  const before = await c.evaluate('window.manualCalibrationEvents');
  await c.setState(JSON.stringify({ ack: true, screen: 'calibration',
    calibrationRequest: { studyId: study?.id ?? `SP-${9300 + i}`, filePath: files[i] } }));
  await until(`window.manualCalibrationEvents > ${before} && document.querySelector('#calibration-file-name')?.textContent === ${JSON.stringify(path.basename(files[i]))}
    && !document.querySelector('#calibration-canvas')?.hidden && !document.querySelector('#calibration-message').textContent.includes('Finding')`);
}
async function applyValue(value) {
  await c.evaluate(`(()=>{const v=document.querySelector('#calibration-value');v.value=${JSON.stringify(String(value))};
    v.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#calibration-apply').click()})()`);
  await until("document.querySelector('#calibration-message').textContent.startsWith('Reference saved for this image.')");
}
async function scales() {
  return c.evaluate(`(async()=>{const api=await import('./renderer/api.js');const out=[];
    for(const path of ${JSON.stringify(files)}){const data=await api.readFile(path);
      out.push(await api.calibrate({name:path.split('/').pop(),data,includePreview:false,previewOnly:true}));}return out;})()`);
}

try {
  await c.evaluate("window.manualCalibrationEvents=0;document.addEventListener('calibrationchange',e=>{if(e.detail.calibration)window.manualCalibrationEvents++},true)");
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1200, deviceScaleFactor: 1, mobile: false });
  await c.setState('{ack:true,screen:"studies",performance:{mode:"standard",cpuThreads:2,cropLocalizer:false,toolbarRemoval:true}}');
  if (phase === 'save') {
    await c.setState('{studies:[]}');
    // Supply a source-bound failed-detection result to the real viewer. The image
    // preview, mouse input, persistence, later OCR/segmentation and export are real.
    const previews = await scales();
    for (let i = 0; i < files.length; i++) {
      assert.equal(previews[i].status, 'not_found', 'save phase needs a fresh reference store');
      await c.evaluate(`import('./renderer/calibration.js').then(m=>m.rememberCalibration(${JSON.stringify(files[i])},${JSON.stringify(previews[i])}))`);
      await openImage(i);
      await c.evaluate("document.querySelector('#calibration-manual').click();document.querySelector('#calibration-canvas').scrollIntoView({block:'center'})");
      for (const y of [200, 300]) {
        const p = await c.evaluate(`(()=>{const el=document.querySelector('#calibration-canvas'),r=el.getBoundingClientRect();
          return{x:r.left+700/el.width*r.width,y:r.top+${y}/el.height*r.height}})()`);
        await c.click(p.x, p.y);
      }
      await applyValue(i === 0 ? 50 : 25);
      check(`image ${i + 1}: drawn reference saved without creating a study`, (await c.state()).studies.length === 0);
    }
    const saved = await scales();
    check('each image has its own durable manual scale before study creation',
      saved.every((r, i) => r.status === 'corrected' && Math.abs(r.spacing.row_mm - [0.5, 0.25][i]) < 1e-6));
    check('source identities and endpoint coordinates remain separate', saved[0].source_sha256 !== saved[1].source_sha256
      && saved.every(r => r.candidates[0].endpoints.every(p => Math.abs(p[0] - 700) < .001)));
  } else if (phase === 'batch') {
    check('no study was needed to retain the references across a full restart', (await c.state()).studies.filter(s => s.source === 'real').length === 0);
    const restored = await scales();
    check('both references survived restart', restored.every((r, i) => r.status === 'corrected' && Math.abs(r.spacing.row_mm - [0.5, 0.25][i]) < 1e-6));
    await openImage(0);
    check('opening the original image restores the manually drawn line and value', await c.evaluate("document.querySelector('#calibration-value').value==='50' && document.querySelector('#calibration-length').textContent==='100.00 pixels'"));
    await c.setState(JSON.stringify({ studies: [], screen: 'workspace', calibrationRequest: null,
      wsFolder: path.dirname(files[0]), wsFiles: files, wsFolderRows: [], wsCsv: null, wsCsvRows: [], wsMapping: [] }));
    await c.evaluate("[...document.querySelectorAll('button')].find(b=>/Load.*workspace/i.test(b.textContent)).click()");
    await until("import('./renderer/store.js').then(m=>m.getState().studies.length===2)");
    // Main must load the durable reference by source bytes even when the renderer
    // has no cache or study calibration for the second image after the restart.
    await c.evaluate("document.querySelector('[data-find-key=segment]').click()");
    await until("import('./renderer/store.js').then(m=>!m.getState().batch && !m.getState().running && m.getState().studies.every(s=>s.geometry))", 240000);
    const results = (await c.state()).studies;
    check('real batch segmentation retains each saved manual reference', results.every(s => {
      const i = files.indexOf(s.filePath); return s.calibration.status === 'corrected'
        && Math.abs(s.calibration.spacing.row_mm - [0.5, 0.25][i]) < 1e-6;
    }));
    check('actual disc heights and CSV use the manual scale', await c.evaluate(`(async()=>{
      const {getState}=await import('./renderer/store.js'),{discRows}=await import('./renderer/data/disc-heights.js');
      const {toCsv,parse}=await import('./renderer/data/csv.js');let measured=0;const newline=String.fromCharCode(13,10);
      for(const s of getState().studies){const exported=parse(toCsv([s]).split(newline).slice(3).join(newline)).rows[0];
        for(const r of discRows(s)){if(r.middle==null)continue;
          const [a,b]=r.key.split('-'),top=s.geometry.vertebrae[a].inferior;
          const bottom=b==='S1'?s.geometry.s1_superior:s.geometry.vertebrae[b].superior;
          const mid=p=>[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2];const p=mid(top),q=mid(bottom);
          if(Math.abs(r.middle-Math.hypot(q[0]-p[0],q[1]-p[1])*s.calibration.spacing.row_mm)>1e-8)return false;
          for(const pos of ['anterior','middle','posterior'])if(r[pos]!=null){const cell=exported['Disc height '+r.key+' '+pos+' (mm)'];
            if(cell==='' || Number(cell)!==Number(r[pos].toFixed(1)))return false;}
          measured++;}}return measured>=2;})()`));
    await openImage(0);
    await applyValue(25);
    const changed = (await c.state()).studies.find(s => s.filePath === files[0]);
    check('correcting an already segmented image saves the new scale immediately', Math.abs(changed.calibration.spacing.row_mm - .25) < 1e-6 && !!changed.geometry);
  } else {
    const studies = (await c.state()).studies.filter(s => s.source === 'real');
    check('segmentation and the latest corrected scales survive another restart', studies.length === 2
      && studies.every(s => s.geometry && Math.abs(s.calibration.spacing.row_mm - .25) < 1e-6));
    check('a saved scale correction updates disc heights without rerunning the models', await c.evaluate(`(async()=>{
      const s=(await import('./renderer/store.js')).getState().studies.find(s=>s.filePath===${JSON.stringify(files[0])});
      const original=await (await import('./renderer/api.js')).loadPrediction(s.id);
      const {discRows}=await import('./renderer/data/disc-heights.js');const before=discRows(original),after=discRows(s);
      let count=0;for(let i=0;i<before.length;i++)for(const pos of ['anterior','middle','posterior'])if(before[i][pos]!=null){
        if(Math.abs(after[i][pos]*2-before[i][pos])>1e-8)return false;count++;}
      return count>0 && JSON.stringify(s.geometry)===JSON.stringify(original.geometry);})()`));
    await openImage(0);
    await c.evaluate("document.querySelector('#calibration-clear').click()");
    await until("document.querySelector('#calibration-message').textContent.startsWith('Cleared scale saved')");
    const saved = await scales();
    check('explicit clear is durable and does not affect the other image', saved[0].status === 'cleared'
      && saved[0].spacing === null && saved[1].status === 'corrected');
    check('clearing blanks disc heights immediately without removing segmentation', await c.evaluate(`(async()=>{
      const s=(await import('./renderer/store.js')).getState().studies.find(s=>s.filePath===${JSON.stringify(files[0])});
      const {discRows}=await import('./renderer/data/disc-heights.js');
      return !!s.geometry && discRows(s).every(r=>r.anterior===null && r.middle===null && r.posterior===null);})()`));
  }
  check('no renderer errors', c.errors.length === 0);
  console.log(`${phase}: ${checks} checks passed`);
} finally { c.close(); }
