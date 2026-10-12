// Run against a scratch Electron profile with a real, reviewed-study config.
// TRAINING_SMOKE_CONFIG=/absolute/config.json CDP_PORT=9337 node tools/smoke/smoke-training.mjs
// This trains one epoch, then starts and cancels a second run. No fabricated scans or labels.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { connect } from './cdp-lib.mjs';
const configPath = process.env.TRAINING_SMOKE_CONFIG;
if (!configPath) throw new Error('Provide TRAINING_SMOKE_CONFIG for real annotated images.');
const config = { ...JSON.parse(fs.readFileSync(configPath, 'utf8')), epochs: 1 };
const session = await connect();
const evaluate = code => session.evaluate(code);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await evaluate(`(async () => { const {setState} = await import('./renderer/store.js');
    setState({screen:'training',ack:true}); return true; })()`);
  const targets = await evaluate(`[...document.querySelectorAll('#training-target option')].map(x=>x.value)`);
  assert.deepEqual(targets, ['lumbar_landmarks','lumbar_segmentation','cervical_landmarks']);
  const runtime = await evaluate('window.spineContour.trainingProbe()');
  assert.ok(runtime.devices.some(d=>d.id===config.device));
  await evaluate(`window.spineContour.trainingStart(${JSON.stringify(config)})`);
  const busy = await evaluate(`window.spineContour.trainingStart(${JSON.stringify(config)}).then(()=>false,()=>true)`);
  assert.equal(busy,true);
  // Recreate the page to exercise reattachment to a live main-process job.
  await evaluate('location.reload()'); await wait(500);
  await evaluate(`(async () => { const {setState} = await import('./renderer/store.js');setState({screen:'training',ack:true}); })()`);
  let status;
  const deadline=Date.now()+10*60*1000;
  do {
    await wait(500);
    status=await evaluate('window.spineContour.trainingStatus()');
    if(Date.now()>deadline) throw new Error('Training smoke timed out.');
  } while(!['completed','failed','cancelled'].includes(status.stage));
  assert.equal(status.stage,'completed',status.message);
  assert.ok(Number.isFinite(status.result.baseline_test.error));
  assert.equal(status.result.split_counts.train+status.result.split_counts.validation+status.result.split_counts.test, config.studies.length);
  await wait(1100);
  assert.match(await evaluate("document.querySelector('#training-status').textContent"), /Candidate|starting model/);
  assert.equal(await evaluate("document.querySelector('#training-results').disabled"),false);
  await evaluate(`window.spineContour.trainingStart(${JSON.stringify({...config,epochs:200})})`);
  await evaluate('window.spineContour.trainingCancel()');
  for(let i=0;i<100;i++) {
    status=await evaluate('window.spineContour.trainingStatus()');
    if(status.stage==='cancelled') break;
    await wait(100);
  }
  assert.equal(status.stage,'cancelled');
  assert.deepEqual(session.errors,[]);
  console.log(JSON.stringify({passed:true,target:config.target,devices:runtime.devices.map(d=>d.id),checks:['runtime','three targets','one active run','real training','page reattachment','result display','cancel']}));
} finally { session.close(); }
