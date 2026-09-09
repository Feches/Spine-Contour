import { chooseFolder, scanFolder, readFile, calibrate, learnCalibrationProfile } from '../api.js';
import { rememberCalibration, calibrationForStudy } from '../calibration.js';
import { preferReviewedCalibration } from '../data/calibration.js';
import { getState } from '../store.js';

export function createFolderCalibration(root, calibration, selectRadiograph) {
  const panel = root.querySelector('#folder-panel');
  const select = root.querySelector('#folder-image');
  const message = root.querySelector('#folder-message');
  const learn = root.querySelector('#folder-learn');
  const run = root.querySelector('#folder-run');
  const stop = root.querySelector('#folder-stop');
  const download = root.querySelector('#folder-download');
  let files = [];
  let cache = new Map();
  let profile = null;
  let currentFile = null;
  let currentIndex = -1;
  let folderName = '';
  let generation = 0;
  let busy = false;
  let loading = false;
  const compact = ({ image_png, ...rest }) => rest;
  const needsReview = result => !result?.spacing;
  const reviewCount = () => files.filter(file => needsReview(cache.get(file.id))).length;
  function save(id, response) {
    cache.set(id, compact(response));
    rememberCalibration(id, response);
  }
  async function readFolderImage(filePath) {
    const data = await readFile(filePath);
    if (!data) throw new Error('This image is no longer available.');
    return { name: filePath.split(/[\\/]/).pop(), data, path: filePath };
  }
  function update() {
    const reference = calibration.snapshot();
    learn.disabled = busy || loading || !currentFile || !reference.spacing || reference.endpoints.length !== 2;
    run.disabled = busy || loading || !files.length;
    stop.disabled = !busy;
    download.disabled = cache.size === 0;
    select.disabled = busy || loading;
    root.querySelector('#calibration-panel').inert = busy || loading;
    root.dispatchEvent(new CustomEvent('foldercalibrationstate', { detail: {
      canContinue: !busy && !loading && files.length > 0, busy,
    } }));
    files.forEach((file, i) => {
      const result = cache.get(file.id);
      if (select.options[i]) select.options[i].textContent = `${file.name} — ${result?.error ? 'error' : result?.status || 'pending'}`;
    });
  }
  function reset() {
    calibration.cancelLoad();
    generation += 1; files = []; cache.clear(); profile = null; currentFile = null;
    currentIndex = -1; busy = false; loading = false; panel.hidden = true;
    update();
  }
  async function show(index, token = generation) {
    if (!files[index]) return;
    loading = true; currentFile = null; update();
    try {
      const descriptor = files[index];
      const file = await readFolderImage(descriptor.id);
      if (token !== generation) return;
      currentIndex = index; currentFile = file; select.value = String(index);
      const cached = cache.get(descriptor.id);
      const response = await selectRadiograph(file, cached?.error ? null : cached, profile);
      if (token !== generation) return;
      if (response) save(descriptor.id, response);
    } catch (error) {
      if (token === generation) message.textContent = error.message;
    } finally {
      if (token === generation) { loading = false; update(); }
    }
  }
  async function scan(force = false) {
    const token = ++generation;
    busy = true; update();
    try {
      for (let i = 0; i < files.length; i += 1) {
        if (token !== generation) return false;
        const descriptor = files[i];
        const prior = cache.get(descriptor.id);
        // Keep ALL manual corrections, not only the film currently displayed.
        if (prior?.status === 'corrected' || prior?.status === 'cleared') continue;
        if (!force && prior && !prior.error && prior.status !== 'unavailable') continue;
        message.textContent = `Detecting image scales: ${i + 1} of ${files.length} — ${descriptor.name}`;
        try {
          const file = await readFolderImage(descriptor.id);
          if (token !== generation) return false;
          const response = await calibrate({ ...file, profile, includePreview: false });
          if (token !== generation) return false;
          const study = getState().studies.find(s => s.filePath === descriptor.id) ?? { filePath: descriptor.id };
          save(descriptor.id, preferReviewedCalibration(response, calibrationForStudy(study)) ?? response);
        } catch (error) {
          if (token !== generation) return false;
          cache.set(descriptor.id, { error: error.message });
        }
        update();
      }
      if (token !== generation) return false;
      const pending = reviewCount();
      message.textContent = `${files.length - pending} of ${files.length} images calibrated automatically or corrected. `
        + (pending ? `${pending} need reference review; segmentation can still continue.` : 'Each image has its own saved scale.');
      const index = currentIndex >= 0 ? currentIndex : Math.max(0, files.findIndex(file => needsReview(cache.get(file.id))));
      await show(index, token);
      return token === generation;
    } finally {
      if (token === generation) { busy = false; update(); }
    }
  }
  async function openFolder(folderPath, knownFiles = null) {
    if (!folderPath) return;
    reset();
    const token = generation;
    const scanned = knownFiles ? { files: knownFiles } : await scanFolder(folderPath);
    if (token !== generation) return;
    files = scanned.files.map(id => ({ id, name: id.split(/[\\/]/).pop() }));
    folderName = folderPath.split(/[\\/]/).pop(); panel.hidden = false;
    select.replaceChildren(...files.map((file, index) => new Option(file.name, String(index))));
    if (!files.length) { message.textContent = 'No supported images found in this folder.'; update(); return; }
    await scan();
  }
  root.querySelector('#choose-folder').addEventListener('click', async () => {
    try { await openFolder(await chooseFolder()); }
    catch (error) { panel.hidden = false; message.textContent = error.message; }
  });
  select.addEventListener('change', () => { generation += 1; show(Number(select.value)); });
  function stopScanning() {
    calibration.cancelLoad();
    generation += 1; busy = false; loading = false;
    message.textContent = 'Stopped. Completed results are kept; choose an image to review.'; update();
  }
  stop.addEventListener('click', stopScanning);
  async function learnReference() {
    const reference = calibration.snapshot();
    if (!currentFile || !reference.spacing || reference.endpoints.length !== 2) return;
    const token = ++generation; busy = true; update();
    try {
      const learned = await learnCalibrationProfile({ ...currentFile, endpoints: reference.endpoints });
      if (token !== generation) return;
      profile = learned;
      if (reference.calibration) save(files[currentIndex].id, reference.calibration);
      message.textContent = 'Reference appearance learned. Process folder to retry automatic detection.';
    } catch (error) {
      if (token === generation) message.textContent = `Could not learn reference appearance: ${error.message}`;
    } finally {
      if (token === generation) { busy = false; update(); }
    }
  }
  learn.addEventListener('click', learnReference);
  run.addEventListener('click', () => scan(true));
  download.addEventListener('click', () => {
    const output = { folder: folderName, detection_profile: profile,
      images: files.map(file => ({ name: file.name, ...(cache.get(file.id) || { status: 'pending' }) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'spine-contour-calibration.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  root.addEventListener('calibrationchange', event => {
    if (!loading && !busy && currentIndex >= 0 && event.detail.calibration) save(files[currentIndex].id, event.detail.calibration);
    update();
  });
  async function calibrateAndContinue() {
    if (busy || loading || !files.length) return false;
    return scan();
  }
  return { reset, openFolder, stopScanning, calibrateAndContinue, reviewCount };
}
