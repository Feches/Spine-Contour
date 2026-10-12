import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { TrainingManager } = createRequire(import.meta.url)('../training-manager.cjs');
function child() {
  const process = new EventEmitter();
  process.stdout = new PassThrough(); process.stderr = new PassThrough();
  process.kill = () => { process.killed = true; };
  return process;
}
test('one worker, fragmented progress, cancellation, and isolated run paths', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'spine-training-'));
  try {
    const proc = child(); let launch;
    const manager = new TrainingManager({root:'/app',outputRoot:dir,python:'/python with spaces',spawnProcess:(...args)=>{launch=args;return proc;}});
    const config = {target:'lumbar_landmarks',studies:[{id:'SP-1000'}]};
    const status = await manager.start(config);
    assert.equal(launch[0], '/python with spaces');
    assert.equal(launch[2].shell, undefined);
    assert.deepEqual(JSON.parse(await readFile(path.join(status.output,'config.json'))),config);
    await assert.rejects(manager.start(config), /already active/);
    proc.stdout.write('{"stage":"train');proc.stdout.write('ing","completed":1,"total":4}\n');
    assert.equal(manager.status.completed,1);
    manager.cancel(); assert.ok(proc.killed);
    proc.stdout.write('{"stage":"completed"}\n');
    assert.equal(manager.status.stage,'cancelling');
    proc.emit('close',null);
    assert.equal(manager.status.stage,'cancelled');
  } finally { await new Promise(r=>setTimeout(r,20)); await rm(dir,{recursive:true,force:true}); }
});
test('unexpected worker exit is a failure, never a completed training run', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'spine-training-'));
  try {
    const proc = child();
    const manager = new TrainingManager({root:'/app',outputRoot:dir,python:'python',spawnProcess:()=>proc});
    await manager.start({target:'cervical_landmarks',studies:[{}]});
    proc.stderr.write('GPU out of memory'); proc.emit('close',1);
    assert.equal(manager.status.stage,'failed'); assert.match(manager.status.message,/out of memory/);
  } finally { await new Promise(r=>setTimeout(r,20)); await rm(dir,{recursive:true,force:true}); }
});
