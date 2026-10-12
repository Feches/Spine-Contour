// Real inference first; remove one predicted body only in the scratch study to
// exercise recovery with the actual model points, never fabricated scan data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './cdp-lib.mjs';
const input = path.resolve(process.argv[2]);
assert.ok(fs.existsSync(input), 'Pass a lateral cervical radiograph with anterior on image left');
const region = process.argv[3] || 'cervical';
assert.ok(['cervical', 'lumbar'].includes(region));
const level = region === 'cervical' ? 'C7' : 'L3';
const cdp = await connect();
const out = path.resolve(`tools/smoke/out/missing-vertebrae-${region}`);
fs.mkdirSync(out, { recursive: true });
const button = text => cdp.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Button unavailable: '+${JSON.stringify(text)});b.click();})()`);
async function until(expression) {
  for (let i = 0; i < 300; i++) { if (await cdp.evaluate(expression)) return; await cdp.settle(100); }
  throw Error(`Timed out: ${expression}`);
}
try {
  await cdp.evaluate(`(async()=>{
    const {newStudy}=await import('./renderer/screens/studies.js');
    const {setState}=await import('./renderer/store.js');
    const study=newStudy({id:'SP-9808',filePath:${JSON.stringify(input)},fileName:${JSON.stringify(path.basename(input))}});
    setState({studies:[{...study,region:${JSON.stringify(region)},anteriorSide:'left'}],ack:true,screen:'analysis',openId:study.id,editing:false,running:null,batch:null,measurementDrafts:{}});
  })()`);
  const run = await cdp.evaluate("import('./renderer/screens/analysis.js').then(m=>m.segmentStudy('SP-9808'))");
  assert.ok(run.ok, JSON.stringify(run));
  await until("document.querySelector('.viewer-canvas-dynamic')?.width>10 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
  await cdp.screenshot(path.join(out, 'inference.png'));
  await cdp.evaluate(`(async()=>{
    const {getState,setState}=await import('./renderer/store.js');const s=getState().studies[0];
    window.actualPrediction=structuredClone(s);
    const body=s.geometry.vertebrae[${JSON.stringify(level)}];if(!body?.superior||!body?.inferior)throw Error('This image did not produce the requested body; choose a different real test image');
    window.recoveryPoints=[body.superior[0],body.superior[1],body.inferior[1],body.inferior[0]];
    const geometry=structuredClone(s.geometry);delete geometry.vertebrae[${JSON.stringify(level)}];
    const result=await (await import('./renderer/api.js')).measure(geometry.region==='cervical'?(await import('./renderer/data/cervical.js')).cervicalMeasureGeometry(geometry,s.calibration):{vertebrae:geometry.vertebrae,s1_superior:geometry.s1_superior,femoral_circles:geometry.femoral_circles});
    setState({studies:[{...s,...result}],editing:true});
  })()`);
  await cdp.evaluate(`document.querySelector('[aria-label="Missing vertebra or landmark"]').value=${JSON.stringify(level)}`);
  await button('ADD LANDMARKS');
  const pts = await cdp.evaluate(`(()=>{const c=document.querySelector('.viewer-canvas-dynamic'),r=c.getBoundingClientRect();return window.recoveryPoints.map(([x,y])=>[r.left+x*r.width/c.width,r.top+y*r.height/c.height]);})()`);
  await cdp.click(...pts[0]);
  await button('CANCEL');
  assert.ok(await cdp.evaluate(`import('./renderer/store.js').then(m=>!m.getState().studies[0].geometry.vertebrae[${JSON.stringify(level)}])`));
  await button('ADD LANDMARKS');
  for (const p of pts) await cdp.click(...p);
  assert.ok(await cdp.evaluate("!document.querySelector('.viewer-edit-help').textContent.includes('click')"));
  await button('UNDO POINT');
  await cdp.click(...pts[3]);
  await cdp.screenshot(path.join(out, 'placement.png'));
  await button('APPLY LANDMARKS');
  await until(`import('./renderer/store.js').then(m=>!!m.getState().studies[0].geometry.vertebrae[${JSON.stringify(level)}]&&!m.getState().measurementDrafts['SP-9808'])`);
  assert.ok(await cdp.evaluate(`import('./renderer/store.js').then(m=>{
    const s=m.getState().studies[0];return Number.isFinite(${region === 'cervical' ? 's.measurements.C2C7_COBB' : "s.measurements.LL['L3-S1']"})&&s.qc.manual_edits.landmarks&&JSON.stringify(s.geometry.vertebrae[${JSON.stringify(region === "cervical" ? "C6" : "L2")}])===JSON.stringify(window.actualPrediction.geometry.vertebrae[${JSON.stringify(region === "cervical" ? "C6" : "L2")}]);
  })`));
  await cdp.screenshot(path.join(out, 'applied.png'));
  await cdp.settle(800);
  await cdp.send('Page.reload', { ignoreCache: true });
  await until(`import('./renderer/store.js').then(m=>!!m.getState().studies.find(s=>s.id==='SP-9808')?.geometry?.vertebrae[${JSON.stringify(level)}])`);
  assert.equal(cdp.errors.length, 0, cdp.errors.join('\n'));
  console.log(`PASS (${region}): real inference, missing ${level} placement, undo, measurement, provenance, untouched adjacent body and disk reload`);
} finally { cdp.close(); }
