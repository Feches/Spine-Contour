// Real image/model integration check. Pass cervical (anterior left) and lumbar images.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { connect } from './cdp-lib.mjs';
const inputs = process.argv.slice(2);
assert.equal(inputs.length, 2, 'Pass real cervical and lumbar radiographs');
inputs.forEach(file => assert.ok(fs.existsSync(file)));
const out = path.resolve('tools/smoke/out/segmental');
fs.mkdirSync(out, { recursive: true });
const cdp = await connect();
const results = [];
try {
  await cdp.send('Page.reload'); await cdp.settle(700);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (const [i, region] of ['cervical', 'lumbar'].entries()) {
    const input = path.resolve(inputs[i]), id = `SP-985${i}`;
    await cdp.setState("{screen:'studies',openId:null}"); await cdp.settle(200);
    await cdp.evaluate(`(async()=>{
      const {newStudy}=await import('./renderer/screens/studies.js');
      const {setState}=await import('./renderer/store.js');
      const s={...newStudy({id:${JSON.stringify(id)},filePath:${JSON.stringify(input)},fileName:${JSON.stringify(path.basename(input))}}),region:${JSON.stringify(region)},anteriorSide:'left'};
      setState({studies:[s],ack:true,screen:'analysis',openId:s.id,editing:false,running:null,batch:null,measurementDrafts:{},tab:'meas',selectedLevel:null,panX:0,panY:0,zoom:1});
    })()`);
    const run = await cdp.evaluate(`import('./renderer/screens/analysis.js').then(m=>m.segmentStudy('${id}'))`);
    assert.ok(run.ok, JSON.stringify(run)); await cdp.settle(800);
    assert.ok(await cdp.evaluate(`import('./renderer/store.js').then(m=>{const s=m.getState().studies[0],g=s.geometry;const c=document.querySelector('.viewer-canvas-dynamic');return c.width===(g.image_width??s.calibration.width)&&c.height===(g.image_height??s.calibration.height);})`), 'canvas matches the current source dimensions');
    const rows = await cdp.evaluate(`(async()=>{ const s=(await import('./renderer/store.js')).getState().studies[0];return (await import('./renderer/data/segmental.js')).segmentalRows(s); })()`);
    assert.equal(rows.length, 10);
    assert.ok(rows.filter(row => !row.absent).length >= 8, 'real inference exposes segmental measurements');
    for (const kind of ['lordosis', 'angulation']) {
      const row = rows.find(r => r.kind === kind && !r.absent);
      await cdp.evaluate(`document.querySelector('[data-row-key="${row.key}"]').click()`);
      assert.ok(await cdp.evaluate(`document.querySelector('.viewer-label')?.textContent.includes('${row.value.toFixed(1)}°')`));
      await cdp.evaluate(`document.querySelector('[data-row-key="${row.key}"]').scrollIntoView({block:'center'})`);
      await cdp.screenshot(path.join(out, `${region}-${kind}.png`));
    }
    const evidence = await cdp.evaluate(`(async()=>{const s=(await import('./renderer/store.js')).getState().studies[0];return {geometry:s.geometry,qc:s.qc,csv:(await import('./renderer/data/csv.js')).toCsv([s])};})()`);
    fs.writeFileSync(path.join(out, `${region}.json`), JSON.stringify({rows,...evidence},null,2));
    // Middle levels keep the handle clear of the floating edit toolbar.
    const editable = rows.find(r => r.kind === 'lordosis' && !r.absent && r.upper === (region === 'cervical' ? 'C4' : 'L3'));
    await cdp.setState('{editing:true,selectedLevel:null,selection:null,panMode:false,panY:180}');
    const point = evidence.geometry.vertebrae[editable.upper].superior[0];
    const client = await cdp.toClient(...point);
    await cdp.click(client.x, client.y);
    assert.ok(await cdp.evaluate(`import('./renderer/store.js').then(m=>m.getState().selection?.level==='${editable.upper}'&&m.getState().selection?.corner==='SA')`), 'segmental superior corner is editable');
    await cdp.key('ArrowDown');
    let updated = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      updated = await cdp.evaluate(`import('./renderer/store.js').then(m=>{const s=m.getState();return !s.measurementDrafts['${id}']&&s.studies[0].geometry.vertebrae['${editable.upper}'].superior[0][1]===${point[1]+1};})`);
      if (updated) break; await cdp.settle(100);
    }
    assert.ok(updated, 'corner edit completes through /measure');
    const corrected = await cdp.evaluate(`(async()=>{const s=(await import('./renderer/store.js')).getState().studies[0];return (await import('./renderer/data/segmental.js')).segmentalValues(s)['${editable.key}'];})()`);
    assert.notEqual(corrected, editable.value);
    await cdp.setState('{editing:false}'); await cdp.settle(700);
    await cdp.send('Page.reload'); await cdp.settle(800);
    await cdp.setState(`{ack:true,screen:'analysis',openId:'${id}',tab:'meas',selectedLevel:'${editable.key}'}`);
    const restored = await cdp.evaluate(`(async()=>{const s=(await import('./renderer/store.js')).getState().studies.find(s=>s.id==='${id}');return (await import('./renderer/data/segmental.js')).segmentalValues(s)['${editable.key}'];})()`);
    assert.equal(restored, corrected, 'corrected segmental result survives reload');
    results.push({region, available:rows.filter(r=>!r.absent).length,total:rows.length, editAndReload:true});
  }
  assert.deepEqual(cdp.errors, []);
} finally { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({results,errors:cdp.errors},null,2)); cdp.close(); }
console.log(JSON.stringify(results));
