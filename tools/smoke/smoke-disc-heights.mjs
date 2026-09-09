// Scratch-profile Electron check with synthetic geometry. Verifies the live panel,
// actual /measure corrections, calibration changes, disk reload and both CSV writers.
// This is arithmetic/UI validation, not an anatomical accuracy benchmark.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { connect } from './cdp-lib.mjs';

const cdp = await connect();
const out = path.resolve('tools/smoke/out/disc-heights');
fs.mkdirSync(out, { recursive: true });
const checks = [];
function check(name, ok) { checks.push({ name, ok: Boolean(ok) }); assert.ok(ok, name); }
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await cdp.evaluate(expression)) return;
    await cdp.settle(100);
  }
  throw new Error(`Timed out: ${expression}`);
}
const heights = () => cdp.evaluate("[...document.querySelectorAll('.meas-disc-table tbody tr')].map(r=>[...r.querySelectorAll('td')].map(c=>c.textContent))");

try {
  await cdp.send('Page.reload');
  await cdp.settle(700);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.evaluate(`(async()=>{
    const store=await import('./renderer/store.js');
    const api=await import('./renderer/api.js');
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=900;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#171d23';ctx.fillRect(0,0,600,900);
    ctx.fillStyle='#8d9eaa';ctx.font='18px sans-serif';ctx.fillText('SYNTHETIC TEST IMAGE',30,50);
    const vertebrae={};
    for(let i=1;i<=5;i++) {
      const y=80+i*90;
      const q=[[210,y],[360,y-10],[360,y+60],[210,y+65]];
      vertebrae['L'+i]={superior:[q[0],q[1]],inferior:[q[3],q[2]],quadrilateral:q};
      ctx.beginPath();for(const [x,y] of q)ctx.lineTo(x,y);ctx.closePath();ctx.fill();
    }
    const s1_superior=[[210,625],[360,610]],femoral_circles=[[245,780,45],[285,780,45]];
    ctx.beginPath();ctx.moveTo(210,625);ctx.lineTo(360,610);ctx.lineTo(410,720);ctx.closePath();ctx.fill();
    for(const [x,y,r] of femoral_circles){ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.strokeStyle='#8d9eaa';ctx.lineWidth=3;ctx.stroke();}
    const image_png=canvas.toDataURL('image/png').split(',')[1];
    ctx.fillStyle='black';ctx.fillRect(0,0,600,900);const mask_png=canvas.toDataURL('image/png').split(',')[1];
    const result=await api.measure({vertebrae,s1_superior,femoral_circles});
    const calibration={version:1,source_sha256:'a'.repeat(64),width:600,height:900,
      coordinate_space:'original_image',status:'dicom',candidates:[],selected_index:null,
      spacing:{row_mm:.5,column_mm:.5,source:'dicom_pixel_spacing'}};
    const qc={femoral:{confidence:.95},framing:{s1_confidence:.95,search_confidence:.95,searched:true}};
    await api.savePrediction('SP-8901',{...result,image_png,mask_png,femoral_mask_png:mask_png,labels:{BACKGROUND:0},qc,calibration});
    const study={id:'SP-8901',source:'real',fileName:'synthetic-disc-heights.png',filePath:'/synthetic/disc-heights.png',
      name:'Synthetic disc heights',addedAt:new Date().toISOString(),view:'Standing lateral',subjectId:'SYNTHETIC-01',
      timepoint:'Pre-op',thumbnail:null,clinical:{},...result,qc,calibration};
    window.discOriginal=structuredClone(study);
    store.setState({studies:[study],ack:true,screen:'studies',openId:null,batch:null,running:null,measurementDrafts:{}});
    store.setState({screen:'analysis',openId:study.id,editing:false,selectedLevel:null,tab:'meas',showAllLordosis:false,dataOpen:false});
  })()`);
  await until("document.querySelector('.viewer-canvas-dynamic')?.width===600 && document.querySelector('.run-card')?.classList.contains('is-hidden')");
  const initial = await heights();
  check('all 15 calibrated heights are displayed with the requested A/M/P definitions',
    JSON.stringify(initial) === JSON.stringify([...Array(4).fill(['12.5','11.3','10.0']),['15.0','12.5','10.0']]));
  check('explicit Anterior, Middle, Posterior table headings', await cdp.evaluate("document.querySelector('.meas-disc-table thead').textContent==='LevelAnteriorMiddlePosterior'"));
  await cdp.screenshot(path.join(out,'calibrated-disc-heights.png'));
  check('single and paired CSV match the panel', await cdp.evaluate(`(async()=>{
    const {toCsv,toPairedCsv,parse}=await import('./renderer/data/csv.js');
    const study=(await import('./renderer/store.js')).getState().studies[0];
    const read=text=>parse(text.split(String.fromCharCode(13,10)).slice(3).join(String.fromCharCode(13,10))).rows[0];
    const single=read(toCsv([study]));
    const later={...study,id:'SP-8902',calibration:{...study.calibration,spacing:{...study.calibration.spacing,row_mm:.6,column_mm:.6}}};
    const paired=read(toPairedCsv({visits:['Post-op'],subjects:[{subject:'SYNTHETIC-01',films:new Map([['Pre-op',study],['Post-op',later]])}]}));
    return single['Disc height L1-L2 middle (mm)']==='11.3' && paired['Disc height L1-L2 middle (mm) Post-op']==='13.5'
      && paired['Delta Disc height L1-L2 middle (mm) Post-op']==='2.2';
  })()`));

  // Drive a real correction through the production viewer and backend, not a mock of it.
  await cdp.setState('{editing:true,selection:null,selectedLevel:null,panMode:false}');
  await cdp.send('Page.bringToFront');
  const corner=await cdp.toClient(210,260);
  await cdp.mouse('mouseMoved',corner.x,corner.y);
  await cdp.mouse('mousePressed',corner.x,corner.y,{button:'left',buttons:1,clickCount:1});
  // Chromium on macOS can defer the captured move acknowledgement until release.
  // Dispatch the move first, then release, before awaiting both acknowledgements.
  const move=cdp.mouse('mouseMoved',corner.x,corner.y+12,{button:'left',buttons:1});
  await cdp.settle(60);
  await Promise.all([move,cdp.mouse('mouseReleased',corner.x,corner.y+12,{button:'left',buttons:0,clickCount:1})]);
  await until("import('./renderer/store.js').then(m=>{const s=m.getState();return !s.measurementDrafts?.['SP-8901'] && s.studies[0].geometry.vertebrae.L2.superior[0][1]!==260 && s.studies[0].measurements.LL['L2-S1']!==window.discOriginal.measurements.LL['L2-S1'];})");
  check('landmark correction updates the adjacent anterior and middle heights',
    await cdp.evaluate("(()=>{const cells=[...document.querySelectorAll('[data-disc-level=\"L1-L2\"] td')].map(c=>c.textContent);return cells[0]!=='12.5' && cells[1]!=='11.3' && cells[2]==='10.0';})()"));
  await cdp.evaluate("[...document.querySelectorAll('.viewer-editbar button')].find(b=>b.textContent.trim()==='RESET TO PREDICTION').click()");
  check('reset restores the original heights', JSON.stringify(await heights())===JSON.stringify(initial));
  await cdp.setState('{editing:false}');

  await cdp.evaluate(`(async()=>{
    const {rememberCalibration}=await import('./renderer/calibration.js');
    const c=structuredClone(window.discOriginal.calibration);
    c.status='corrected';c.spacing={row_mm:1,column_mm:1,source:'manual_reference'};
    c.candidates=[{endpoints:[[50,100],[50,200]],length_px:100,value_mm:100,raw_text:'100 mm',status:'accepted'}];c.selected_index=0;
    window.discCorrectedCalibration=c;rememberCalibration('/synthetic/disc-heights.png',c);
  })()`);
  check('manual image-scale correction immediately updates heights', (await heights())[0].join(',')==='25.0,22.5,20.0');
  await cdp.settle(250);
  check('saved geometry and corrected calibration reproduce the heights on disk reload', await cdp.evaluate(`(async()=>{
    const raw=await window.spineContour.loadStudies();const {validate}=await import('./renderer/data/persistence.js');
    const {discRows}=await import('./renderer/data/disc-heights.js');
    const saved=validate(raw).find(s=>s.id==='SP-8901');
    window.discSaved=saved;return discRows(saved)[0].middle===22.5;
  })()`));
  // Verify pending-state compatibility with the separate accuracy PR.
  await cdp.setState("{measurementDrafts:{'SP-8901':window.discOriginal.geometry}}");
  check('pending landmark correction suppresses all 15 heights', (await heights()).flat().every(v=>v==='—'));
  await cdp.setState('{measurementDrafts:{}}');
  check('completed correction restores heights', (await heights())[0][0]==='25.0');

  await cdp.evaluate(`import('./renderer/calibration.js').then(m=>m.rememberCalibration('/synthetic/disc-heights.png',
    {...window.discCorrectedCalibration,status:'cleared',spacing:null,selected_index:null}))`);
  check('clearing calibration displays em dashes instead of pixel distances', (await heights()).flat().every(v=>v==='—'));
  check('uncalibrated export leaves every height empty', await cdp.evaluate(`(async()=>{
    const m=await import('./renderer/data/csv.js');const s=(await import('./renderer/store.js')).getState().studies[0];
    const data=m.parse(m.toCsv([s]).split(String.fromCharCode(13,10)).slice(3).join(String.fromCharCode(13,10)));
    return data.headers.filter(h=>h.startsWith('Disc height ')).every(h=>data.rows[0][h]==='');
  })()`));
  await cdp.evaluate(`import('./renderer/calibration.js').then(m=>m.rememberCalibration('/synthetic/disc-heights.png',window.discOriginal.calibration))`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
  check('height table fits the compact Measurements panel', await cdp.evaluate("(()=>{const t=document.querySelector('.meas-disc-table');return t.scrollWidth<=t.clientWidth && t.getBoundingClientRect().right<=innerWidth;})()"));
  check('no renderer console errors', cdp.errors.length===0);
} finally {
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors:cdp.errors},null,2));
  console.log(JSON.stringify({passed:checks.filter(x=>x.ok).length,total:checks.length,checks,errors:cdp.errors},null,2));
  cdp.close();
}
