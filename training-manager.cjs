// A separate process and Python environment keep training out of the inference runtime.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class TrainingManager {
  constructor({ root, outputRoot, python, spawnProcess = spawn }) {
    Object.assign(this, { root, outputRoot, python, spawnProcess });
    this.child = null;
    this.status = { stage: 'idle' };
  }
  async probe(python = this.python) {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(python, ['-m', 'backend.finetune.worker', '--devices'], {
        cwd: this.root, env: { ...process.env, PYTHONUNBUFFERED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '', err = '';
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Training runtime check timed out.')); }, 120000);
      child.stdout.on('data', chunk => { out = (out + chunk).slice(-65536); });
      child.stderr.on('data', chunk => { err = (err + chunk).slice(-4096); });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('close', code => {
        clearTimeout(timeout);
        const result = out.split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } })
          .find(row => row?.stage === 'devices');
        if (code !== 0 || !result) reject(new Error(`Training Python is not ready. Install the optional training dependencies. ${err || out}`));
        else resolve({ python, devices: result.devices });
      });
    });
  }
  async start(config) {
    if (this.child || this.starting) throw new Error('A training run is already active.');
    this.starting = true;
    try {
      if (!['lumbar_landmarks', 'lumbar_segmentation', 'cervical_landmarks'].includes(config?.target)) throw new Error('Invalid training target.');
      if (!Array.isArray(config.studies) || !config.studies.length) throw new Error('Select reviewed studies.');
      const id = randomUUID();
      const output = path.join(this.outputRoot, id);
      await fs.mkdir(output, { recursive: true });
      const configPath = path.join(output, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
      this.status = { id, output, stage: 'starting', message: 'Starting training runtime…', startedAt: Date.now() };
      const child = this.spawnProcess(this.python, ['-m', 'backend.finetune.worker', '--config', configPath, '--output', output], {
        cwd: this.root, env: { ...process.env, PYTHONUNBUFFERED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      let pending = '', stderr = '';
      child.stdout.on('data', chunk => {
        pending += chunk.toString();
        const lines = pending.split('\n'); pending = lines.pop();
        if (pending.length > 1024 * 1024) pending = '';
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (this.status.stage !== 'cancelling') this.status = { id, output, startedAt: this.status.startedAt, ...event };
          } catch { /* Third-party library diagnostics are not protocol events. */ }
        }
      });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
      child.once('error', error => { this.status = { ...this.status, stage: 'failed', message: error.message }; });
      child.once('close', async code => {
        this.child = null;
        if (this.status.stage === 'cancelling') this.status = { ...this.status, stage: 'cancelled', message: 'Training cancelled. No model was activated.' };
        else if (code !== 0 || this.status.stage !== 'completed') this.status = { ...this.status, stage: 'failed', message: this.status.stage === 'failed' ? this.status.message : stderr || `Training stopped (exit ${code}).` };
        await fs.writeFile(path.join(output, 'status.json'), JSON.stringify(this.status, null, 2)).catch(() => {});
      });
      return this.status;
    } finally { this.starting = false; }
  }
  cancel() {
    if (this.child) {
      this.status = { ...this.status, stage: 'cancelling', message: 'Cancelling training…' };
      this.child.kill();
    }
    return this.status;
  }
}
module.exports = { TrainingManager };
