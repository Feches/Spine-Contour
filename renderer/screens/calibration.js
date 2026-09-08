import { showToast } from '../components/toast.js';
import { el } from '../dom.js';
import { getState, setState } from '../store.js';
import { selectFile } from '../api.js';
import { createCalibrationViewer } from '../components/calibration-viewer.js';
import { createFolderCalibration } from '../components/folder-calibration.js';

// Reuse the same screen root across navigation so references and scans remain in this session.
let root = null;
let folderController = null;
let lastRequest = null;
export function render(state) {
  if (!root) {
    root = el('main', { class: 'workspace-page calibration-page' });
    root.innerHTML = `<div class="workspace-page-inner">
  <div class="eyebrow">MEASUREMENT REFERENCE</div>
  <h1 class="workspace-heading">Image calibration</h1>
  <p class="workspace-copy">Correct one ruler to learn its appearance, then find references across your folder. Each film keeps its own scale.</p>
  <section id="calibration-onboarding" class="calibration" hidden>
    <strong>Calibrate your image folder</strong>
    <p>Check the reference below and correct it if needed. Then apply its appearance to the folder before continuing with workspace setup.</p>
    <div class="calibration-controls">
      <button id="calibration-continue" class="btn-primary" type="button" disabled>Calibrate folder and continue</button>
      <button id="calibration-skip" type="button">Skip for now</button>
    </div>
  </section>
  <div class="calibration-controls calibration-pickers">
    <button class="btn btn-primary" id="choose-folder" type="button">Choose image folder</button>
    <button class="btn" id="use-workspace-folder" type="button">Use workspace folder</button>
    <button class="btn" id="calibration-choose-file" type="button">Choose one image</button>
    <span id="calibration-file-name"></span>
  </div>
        <div id="folder-panel" class="calibration" hidden>
          <strong>Folder calibration</strong>
          <p id="folder-message" role="status"></p>
          <div class="calibration-controls">
            <label>Image<select id="folder-image"></select></label>
            <button id="folder-learn" type="button" disabled>Use reference appearance for folder</button>
            <button id="folder-run" type="button" disabled>Process folder</button>
            <button id="folder-stop" type="button" disabled>Stop</button>
            <button id="folder-download" type="button" disabled>Save calibration results</button>
          </div>
          <p>Correct and apply one reference below, then share its color settings. Each image is calibrated from its own ruler.</p>
        </div>
        <details class="calibration" id="calibration-panel" open hidden>
          <summary>Image scale</summary>
          <p id="calibration-message" role="status"></p>
          <div class="calibration-controls">
            <label>Reference<select id="calibration-reference"><option value="-1">Draw a reference</option></select></label>
            <label>Reference length (mm)<input id="calibration-value" type="number" min="0.001" step="any" /></label>
            <button id="calibration-apply" type="button" disabled>Apply reference</button>
            <button id="calibration-manual" type="button" disabled>Draw reference</button>
            <button id="calibration-distance" type="button" disabled>Measure distance</button>
            <button id="calibration-clear" type="button" disabled>Clear scale</button>
          </div>
          <div class="calibration-readouts">
            <span>Scale: <output id="calibration-scale">Not calibrated</output></span>
            <span>Reference: <output id="calibration-length">Place both endpoints</output></span>
            <span>Distance: <output id="calibration-distance-value">—</output></span>
          </div>
          <canvas id="calibration-canvas" aria-label="Original radiograph with editable reference ruler and distance points" hidden></canvas>
          <p>Green points set the reference. Yellow points measure distance. This view keeps the original image, including references outside the lumbar crop.</p>
        </details>
</div>`;
    const viewer = createCalibrationViewer(root);
    function openImage(file, cached = null, profile = null) {
      root.querySelector('#calibration-file-name').textContent = file.name;
      return viewer.load(file, cached, profile);
    }
    const folder = createFolderCalibration(root, viewer, openImage);
    folderController = folder;
    root.addEventListener('foldercalibrationstate', event => {
      root.querySelector('#calibration-continue').disabled = !event.detail.canContinue;
    });
    function returnToWorkspace(request) {
      const live = getState();
      if (live.screen === 'calibration' && live.calibrationRequest === request) {
        setState({ calibrationRequest: null, screen: 'workspace' });
        return true;
      }
    }
    root.querySelector('#calibration-continue').addEventListener('click', async () => {
      const request = getState().calibrationRequest;
      if (await folder.calibrateAndContinue() && returnToWorkspace(request)) {
        const pending = folder.reviewCount();
        showToast(pending
          ? `Folder checked — ${pending} image${pending === 1 ? '' : 's'} still need reference review in Image calibration.`
          : 'Folder calibration complete. Continue workspace setup.');
      }
    });
    root.querySelector('#calibration-skip').addEventListener('click', () => {
      const request = getState().calibrationRequest;
      folder.stopScanning();
      returnToWorkspace(request);
    });
    root.querySelector('#calibration-choose-file').addEventListener('click', async () => {
      try {
        const file = await selectFile();
        if (!file) return;
        folder.reset();
        await openImage(file);
      } catch (error) { root.querySelector('#calibration-file-name').textContent = error.message; }
    });
    root.querySelector('#use-workspace-folder').addEventListener('click', async () => {
      try { await folder.openFolder(getState().wsFolder); }
      catch (error) { root.querySelector('#calibration-file-name').textContent = error.message; }
    });
  }
  const request = state.calibrationRequest;
  root.querySelector('#calibration-onboarding').hidden = !request;
  root.querySelector('.calibration-pickers').hidden = Boolean(request);
  root.querySelector('#use-workspace-folder').disabled = !state.wsFolder;
  if (request && request !== lastRequest) {
    lastRequest = request;
    root.querySelector('#calibration-continue').disabled = true;
    queueMicrotask(async () => {
      if (getState().calibrationRequest !== request || getState().screen !== 'calibration') return;
      try { await folderController.openFolder(request.folder, request.files); }
      catch (error) { root.querySelector('#calibration-file-name').textContent = error.message; }
    });
  }
  return root;
}
