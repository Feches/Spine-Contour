import { showToast } from '../components/toast.js';
import { el } from '../dom.js';
import { getState, setState } from '../store.js';
import { selectFile, readFile } from '../api.js';
import { rememberCalibration, calibrationForStudy } from '../calibration.js';
import { calibrationPathKey } from '../data/calibration.js';
import { createCalibrationViewer } from '../components/calibration-viewer.js';
import { createFolderCalibration } from '../components/folder-calibration.js';

// Reuse the same screen root across navigation so references and scans remain in this session.
let root = null;
let folderController = null;
let lastRequest = null;
let openImageController = null;
export function render(state) {
  if (!root) {
    root = el('main', { class: 'workspace-page calibration-page' });
    root.innerHTML = `<div class="workspace-page-inner">
  <div class="eyebrow">MEASUREMENT REFERENCE</div>
  <h1 class="workspace-heading">Image calibration</h1>
  <p class="workspace-copy">Calibrate each image for disc-height measurements. Automatic detection reads printed rulers; if it fails, draw a reference, enter its length in mm, and apply it. Applied references are saved for that image, including before loading a study.</p>
  <button id="calibration-return" class="btn" type="button" hidden>Return to study</button>
  <section id="calibration-onboarding" class="calibration" hidden>
    <strong>Calibrate your image folder</strong>
    <p>Each image is checked automatically. Review uncertain references below, or continue with uncalibrated images.</p>
    <div class="calibration-controls">
      <button id="calibration-continue" class="btn-primary" type="button" disabled>Continue to workspace</button>
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
          <p>Each image uses its own ruler or DICOM pixel spacing. Teaching reference appearance is optional; missing or uncertain references remain uncalibrated.</p>
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
    let activeFile = null;
    async function openImage(file, cached = null, profile = null) {
      activeFile = file;
      root.querySelector('#calibration-file-name').textContent = file.name;
      const study = getState().studies.find(s => calibrationPathKey(s.filePath) === calibrationPathKey(file.path));
      const response = await viewer.load(file, cached ?? calibrationForStudy(study ?? { filePath: file.path }), profile);
      if (response && activeFile === file) rememberCalibration(file.path, response);
      return response;
    }
    openImageController = openImage;
    root.addEventListener('calibrationchange', event => {
      if (activeFile && event.detail.calibration) rememberCalibration(activeFile.path, event.detail.calibration);
    });
    const folder = createFolderCalibration(root, viewer, openImage);
    folderController = folder;
    root.querySelector('#calibration-return').addEventListener('click', () => {
      const id = getState().calibrationRequest?.studyId;
      folder.stopScanning();
      setState({ calibrationRequest: null, screen: id ? 'analysis' : 'studies', ...(id ? { openId: id } : {}) });
    });
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
  root.querySelector('#calibration-onboarding').hidden = !request?.folder;
  root.querySelector('#calibration-return').hidden = !request?.studyId;
  root.querySelector('.calibration-pickers').hidden = Boolean(request);
  root.querySelector('#use-workspace-folder').disabled = !state.wsFolder;
  if (request && request !== lastRequest) {
    lastRequest = request;
    // The root is reused: do not expose the previous image's editable reference
    // while the newly requested file is still being read.
    root.querySelector('#calibration-panel').hidden = true;
    root.querySelector('#calibration-continue').disabled = true;
    queueMicrotask(async () => {
      if (getState().calibrationRequest !== request || getState().screen !== 'calibration') return;
      try {
        if (request.studyId) {
          folderController.reset();
          const data = await readFile(request.filePath);
          if (getState().calibrationRequest !== request) return;
          if (!data) throw new Error('This image is no longer available.');
          await openImageController({ name: request.filePath.split(/[\\/]/).pop(), path: request.filePath, data });
        } else await folderController.openFolder(request.folder, request.files);
      }
      catch (error) { root.querySelector('#calibration-file-name').textContent = error.message; }
    });
  }
  return root;
}
