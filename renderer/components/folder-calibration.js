import { chooseFolder, scanFolder, readFile, calibrate, learnCalibrationProfile } from '../api.js';
import { calibrationMath } from '../data/calibration.js';

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
  async function readFolderImage(filePath) {
    const bytes = await readFile(filePath);
    if (!bytes) throw new Error('This image is no longer available.');
    return { name: filePath.split(/[\\/]/).pop(), data: bytes, path: filePath };
  }
  const compact = response => { const { image_png, ...rest } = response; return rest; };

  function update() {
    learn.disabled = busy || loading || !currentFile || !calibration.snapshot().spacing
      || calibration.snapshot().endpoints.length !== 2;
    run.disabled = busy || loading || !profile;
    stop.disabled = !busy;
    download.disabled = cache.size === 0;
    select.disabled = busy;
    const reference = calibration.snapshot();
    root.dispatchEvent(new CustomEvent('foldercalibrationstate', { detail: {
      canContinue: !busy && !loading && Boolean(currentFile && reference.spacing)
        && (reference.endpoints.length === 2 || reference.spacing?.source === 'dicom_pixel_spacing'),
      busy,
    } }));
    for (let i = 0; i < files.length; i += 1) {
      const result = cache.get(files[i].id);
      const label = result?.error ? 'error' : result?.status || 'pending';
      if (select.options[i]) select.options[i].textContent = `${files[i].name} — ${label}`;
    }
  }
  function reset() {
    generation += 1; files = []; cache.clear(); profile = null; currentFile = null;
    currentIndex = -1; busy = false; loading = false; panel.hidden = true;
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
      if (response) cache.set(descriptor.id, compact(response));
    } catch (error) {
      if (token === generation) message.textContent = error.message;
    } finally {
      if (token === generation) { loading = false; update(); }
    }
  }
  async function scan(findFirst) {
    const token = ++generation;
    busy = true; update();
    let firstFound = -1;
    try {
      for (let i = 0; i < files.length; i += 1) {
        if (token !== generation) return;
        const descriptor = files[i];
        if (!findFirst && i === currentIndex && cache.get(descriptor.id)?.status === 'corrected') continue;
        message.textContent = `${findFirst ? 'Finding a reference' : 'Applying reference appearance'}: ${i + 1} of ${files.length} — ${descriptor.name}`;
        try {
          const file = await readFolderImage(descriptor.id);
          if (token !== generation) return;
          const response = await calibrate({ ...file, profile, includePreview: false });
          if (token !== generation) return;
          cache.set(descriptor.id, compact(response));
          if (findFirst && (response.candidates.length || response.spacing)) { firstFound = i; break; }
        } catch (error) {
          if (token !== generation) return;
          cache.set(descriptor.id, { error: error.message });
        }
        update();
      }
      if (token !== generation) return;
      message.textContent = findFirst
        ? (firstFound >= 0 ? 'Reference found. Correct its green endpoints and length, apply it, then use its appearance for the folder.'
          : 'No automatic reference found. Draw a reference on an image below to teach its appearance.')
        : `Folder processed. Each image has its own scale. Choose an image to review its result; ambiguous and missing references need correction.`;
      if (findFirst && files.length) await show(Math.max(0, firstFound), token);
      return token === generation;
    } finally {
      if (token === generation) { busy = false; update(); }
    }
  }
  async function openFolder(folderPath, knownFiles = null) {
    if (!folderPath) return;
    const scanned = knownFiles ? { files: knownFiles } : await scanFolder(folderPath);
    reset(); files = scanned.files.map(filePath => ({ id: filePath, name: filePath.split(/[\\/]/).pop() }));
    folderName = folderPath.split(/[\\/]/).pop(); panel.hidden = false;
    select.replaceChildren(...files.map((file, index) => new Option(file.name, String(index))));
    if (!files.length) { message.textContent = 'No supported images found in this folder.'; update(); return; }
    await scan(true);
  }
  root.querySelector('#choose-folder').addEventListener('click', async () => {
    try { await openFolder(await chooseFolder()); }
    catch (error) { panel.hidden = false; message.textContent = error.message; }
  });
  select.addEventListener('change', () => { generation += 1; show(Number(select.value)); });
  function stopScanning() {
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
      const descriptor = files[currentIndex];
      const old = cache.get(descriptor.id);
      const length = calibrationMath.distance(reference.endpoints);
      cache.set(descriptor.id, { ...old, status: 'corrected', selected_index: 0, spacing: reference.spacing,
        message: 'Using your corrected reference.',
        candidates: [{ value_mm: reference.value_mm, endpoints: reference.endpoints, length_px: length,
          raw_text: `${reference.value_mm} mm (corrected)`, status: 'accepted' }] });
      message.textContent = 'Reference appearance learned. Ready to process the folder.';
      return true;
    } catch (error) {
      if (token === generation) message.textContent = `Could not learn reference appearance: ${error.message}`;
    } finally {
      if (token === generation) { busy = false; update(); }
    }
  }
  learn.addEventListener('click', learnReference);
  run.addEventListener('click', () => scan(false));
  download.addEventListener('click', () => {
    const output = { folder: folderName, detection_profile: profile,
      images: files.map(file => ({ name: file.name, ...(cache.get(file.id) || { status: 'pending' }) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'spine-contour-calibration.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  root.addEventListener('calibrationchange', event => {
    const reference = event.detail;
    if (!loading && currentIndex >= 0 && reference.spacing?.source === 'manual_reference' && reference.endpoints.length === 2) {
      const id = files[currentIndex]?.id;
      const old = cache.get(id);
      if (old) cache.set(id, { ...old, status: 'corrected', spacing: reference.spacing, selected_index: 0,
        message: 'Using your corrected reference.', candidates: [{ value_mm: reference.value_mm,
          endpoints: reference.endpoints, length_px: calibrationMath.distance(reference.endpoints),
          raw_text: `${reference.value_mm} mm (corrected)`, status: 'accepted' }] });
    }
    update();
  });
  async function calibrateAndContinue() {
    if (busy || loading || !currentFile) return false;
    if (calibration.snapshot().spacing?.source === 'dicom_pixel_spacing') return scan(false);
    if (!(await learnReference())) return false;
    return scan(false);
  }
  function reviewCount() {
    return files.filter(file => !['detected', 'corrected', 'dicom'].includes(cache.get(file.id)?.status)).length;
  }
  return { reset, openFolder, stopScanning, calibrateAndContinue, reviewCount };
}
