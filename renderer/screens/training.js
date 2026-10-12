import { el } from '../dom.js';
import { getState, subscribe } from '../store.js';
import { trainingProbe, trainingPython, trainingCheckpoint, trainingStart, trainingStatus, trainingCancel, trainingResults } from '../api.js';
import { TRAINING_TARGETS, trainingReason, trainingSnapshot, trainingProgress } from '../data/training.js';
import { studyName } from '../data/labels.js';

let root, timer, status = { stage: 'idle' }, runtime = null, checkpoint = null;
const selected = new Set();
const active = () => !['idle', 'completed', 'failed', 'cancelled'].includes(status.stage);

export function render() {
  if (root) { refreshStudies(); return root; }
  root = el('main', { class: 'workspace-page calibration-page training-page' });
  root.innerHTML = `<div class="workspace-page-inner">
    <div class="eyebrow">LOCAL MODEL TRAINING</div>
    <h1 class="workspace-heading">Train from reviewed corrections</h1>
    <p class="workspace-copy">Fine-tune a model using your reviewed annotations. Images and training results stay on this computer.</p>
    <section class="calibration">
      <h2>Training target</h2>
      <label>Model <select id="training-target" aria-label="Training target"></select></label>
      <p id="training-label-note"></p>
      <p>Each subject stays in one split: approximately 60% training, 20% validation and 20% held-out testing. Assign Subject IDs consistently across all films of a patient. At least five subjects are required; small cohorts give uncertain estimates.</p>
      <button class="btn" id="training-select" type="button">Select eligible studies</button>
      <button class="btn" id="training-clear" type="button">Clear selection</button>
      <p id="training-count" role="status"></p>
      <div id="training-studies" class="training-studies"></div>
    </section>
    <section class="calibration">
      <h2>Training runtime</h2>
      <p>Training uses an optional Python environment with PyTorch. Install the training dependencies from the documentation, then select its Python executable. CUDA and ROCm devices appear only when supported by that environment.</p>
      <div class="calibration-controls">
        <button class="btn" id="training-probe" type="button">Check runtime</button>
        <button class="btn" id="training-python" type="button">Choose Python…</button>
        <button class="btn" id="training-checkpoint" type="button">Choose starting checkpoint…</button>
      </div>
      <p id="training-runtime" role="status">Check the runtime before starting.</p>
      <p id="training-checkpoint-path">Choose the checkpoint matching the selected target.</p>
      <div class="calibration-controls">
        <label>Processor<select id="training-device"><option value="cpu">CPU</option></select></label>
        <label>Epochs<input id="training-epochs" type="number" min="1" max="200" value="10"></label>
        <label>Batch size<input id="training-batch" type="number" min="1" max="16" value="1"></label>
        <label>Learning rate<input id="training-rate" type="number" min="0.0000001" max="0.001" step="0.000001" value="0.00001"></label>
        <label>CPU threads<input id="training-threads" type="number" min="1" max="16" value="2"></label>
      </div>
    </section>
    <section class="calibration">
      <h2>Run and evaluation</h2>
      <p>The best validation checkpoint is compared with the starting model on held-out subjects. Overall error and every evaluated landmark or vertebral label must not increase. This tests the saved crops on your cohort, not general performance on other datasets.</p>
      <p>Training saves a candidate checkpoint and evaluation report. It does not replace the app’s active models.</p>
      <div class="calibration-controls">
        <button class="btn btn-primary" id="training-start" type="button">Start training</button>
        <button class="btn" id="training-cancel" type="button" disabled>Cancel training</button>
        <button class="btn" id="training-results" type="button" disabled>Open results folder</button>
      </div>
      <progress id="training-progress" max="1" value="0" aria-label="Training progress"></progress>
      <p id="training-status" role="status" aria-live="polite"></p>
      <pre id="training-result"></pre>
    </section>
  </div>`;
  const target = root.querySelector('#training-target');
  for (const [value, label] of TRAINING_TARGETS) target.append(el('option', { value }, label));
  target.onchange = () => { selected.clear(); checkpoint = null; root.querySelector('#training-checkpoint-path').textContent = 'Choose the checkpoint matching the selected target.'; refreshStudies(); };
  const action = (id, callback) => root.querySelector(id).onclick = async event => {
    event.currentTarget.disabled = true;
    try { await callback(); } catch (error) { root.querySelector('#training-status').textContent = error.message; }
    finally { updateControls(); }
  };
  function showRuntime(result) {
    if (!result) return;
    runtime = result;
    root.querySelector('#training-runtime').textContent = `Ready: ${result.python}`;
    root.querySelector('#training-device').replaceChildren(...result.devices.map(d => el('option', { value: d.id }, d.name)));
  }
  action('#training-probe', async () => { runtime = null; root.querySelector('#training-runtime').textContent = 'Checking…'; showRuntime(await trainingProbe()); });
  action('#training-python', async () => showRuntime(await trainingPython()));
  action('#training-checkpoint', async () => { const value = await trainingCheckpoint(); if (value) { checkpoint = value; root.querySelector('#training-checkpoint-path').textContent = value; } });
  action('#training-select', async () => { for (const study of getState().studies) if (!trainingReason(study, target.value, getState().measurementDrafts)) selected.add(study.id); refreshStudies(); });
  action('#training-clear', async () => { selected.clear(); refreshStudies(); });
  action('#training-start', async () => {
    const state = getState();
    const number = id => Number(root.querySelector(id).value);
    const studies = trainingSnapshot(state.studies, selected, target.value, state.measurementDrafts);
    status = await trainingStart({ target: target.value, checkpoint, device: root.querySelector('#training-device').value,
      epochs: number('#training-epochs'), batchSize: number('#training-batch'), learningRate: number('#training-rate'),
      threads: number('#training-threads'), studies });
    updateStatus(); poll();
  });
  action('#training-cancel', async () => { status = await trainingCancel(); updateStatus(); });
  action('#training-results', async () => { const error = await trainingResults(); if (error) throw new Error(error); });
  let previous = getState();
  subscribe(state => {
    if (state.studies !== previous.studies || state.measurementDrafts !== previous.measurementDrafts) refreshStudies();
    previous = state;
  });
  refreshStudies(); poll();
  return root;
}

function refreshStudies() {
  if (!root) return;
  const state = getState(), target = root.querySelector('#training-target').value;
  root.querySelector('#training-label-note').textContent = target === 'lumbar_segmentation'
    ? 'Filled L1–L5 quadrilaterals are derived from reviewed superior and inferior corners. These approximate body outlines; they are not manually traced masks. All five bodies must be annotated.'
    : 'Reviewed landmark coordinates supervise the selected head. Missing landmarks are excluded from the loss. Femoral heads are excluded.';
  const container = root.querySelector('#training-studies');
  container.replaceChildren(...state.studies.filter(s => s.source === 'real').map(study => {
    const reason = trainingReason(study, target, state.measurementDrafts);
    if (reason) selected.delete(study.id);
    const checkbox = el('input', { type: 'checkbox', checked: selected.has(study.id), disabled: active() || Boolean(reason),
      onChange: event => { if (event.target.checked) selected.add(study.id); else selected.delete(study.id); updateCount(); } });
    return el('label', { class: 'training-study' }, checkbox, `${studyName(study)} · ${study.subjectId || 'No Subject ID'}${reason ? ` — ${reason}` : ''}`);
  }));
  updateCount(); updateControls();
}
function updateCount() {
  const studies = getState().studies.filter(s => selected.has(s.id));
  root.querySelector('#training-count').textContent = `${studies.length} studies · ${new Set(studies.map(s => s.subjectId?.trim())).size} subjects selected`;
}
function updateControls() {
  if (!root) return;
  for (const element of root.querySelectorAll('input, select, button')) element.disabled = active();
  root.querySelector('#training-start').disabled = active() || !runtime || !checkpoint;
  root.querySelector('#training-cancel').disabled = !active() || status.stage === 'cancelling';
  root.querySelector('#training-results').disabled = !status.output;
  const state = getState(), target = root.querySelector('#training-target').value;
  [...root.querySelectorAll('#training-studies input')].forEach((input, i) => {
    input.disabled = active() || Boolean(trainingReason(state.studies.filter(s => s.source === 'real')[i], target, state.measurementDrafts));
  });
}
function updateStatus() {
  root.querySelector('#training-status').textContent = trainingProgress(status);
  const progress = root.querySelector('#training-progress');
  if (status.total) { progress.max = status.total; progress.value = status.completed ?? 0; }
  else if (active()) progress.removeAttribute('value');
  else { progress.max = 1; progress.value = status.stage === 'completed' ? 1 : 0; }
  const result = status.result;
  root.querySelector('#training-result').textContent = result ? JSON.stringify({
    metric: result.metric, baseline_test: result.baseline_test.error,
    candidate_test: result.candidate_test?.error ?? null, gate_passed: result.gate_passed,
    selected_epoch: result.selected_epoch, split_counts: result.split_counts,
  }, null, 2) : '';
  updateControls();
}
async function poll() {
  clearTimeout(timer);
  try { status = await trainingStatus(); updateStatus(); }
  catch (error) { root.querySelector('#training-status').textContent = error.message; }
  if (active()) timer = setTimeout(poll, 1000);
}
