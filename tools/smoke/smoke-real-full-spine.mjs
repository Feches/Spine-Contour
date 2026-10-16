// Real public radiograph through desktop inference; scratch profile only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { connect } from './cdp-lib.mjs';
const input=path.resolve(process.argv[2]);
const out=path.resolve('tools/smoke/out/full-spine-real');fs.mkdirSync(out,{recursive:true});
const cdp=await connect();
try {
 await cdp.send('Page.reload',{ignoreCache:true});await cdp.settle(700);
 await cdp.evaluate(`(async()=>{
  const {newStudy}=await import('./renderer/screens/studies.js');
  const {setState}=await import('./renderer/store.js');
  const study=newStudy({id:'SP-9802',filePath:${JSON.stringify(input)},fileName:${JSON.stringify(path.basename(input))}});
  setState({studies:[study],ack:true,screen:'analysis',openId:study.id,editing:false,running:null,batch:null,measurementDrafts:{},tab:'meas',selectedLevel:null});
 })()`);
 await cdp.settle(700);
 await cdp.evaluate(`(()=>{const e=document.querySelector('[aria-label="Spine region"]');e.value='full_spine';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await cdp.settle(700);
 const run=await cdp.evaluate("import('./renderer/screens/analysis.js').then(m=>m.segmentStudy('SP-9802'))");
 assert.ok(run.ok,'real full-spine inference completes');
 const result=await cdp.evaluate("import('./renderer/store.js').then(m=>{const s=m.getState().studies[0];return {geometry:s.geometry,measurements:s.measurements,qc:s.qc};})");
 assert.equal(result.geometry.region,'full_spine');
 assert.equal(result.geometry.anterior_side,'right');
 assert.ok(result.geometry.vertebrae.C7);
 assert.equal(result.geometry.s1_superior,null);
 assert.equal(result.measurements.GLOBAL_SVA_PX,null);
 assert.equal(result.qc.framing.orientation.context_retry,true);
 assert.equal(cdp.errors.length,0);
 await cdp.screenshot(path.join(out,'result.png'));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,...result},null,2));
 console.log('Real full-spine partial-result desktop check passed');
} finally {cdp.close();}
