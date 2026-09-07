/* Separate original-image canvas keeps off-crop rulers editable throughout segmentation. */
import { calibrationMath as math } from '../data/calibration.js';
import { calibrate } from '../api.js';

export function createCalibrationViewer(root) {
  const panel = root.querySelector('#calibration-panel');
  const canvas = root.querySelector('#calibration-canvas');
  const message = root.querySelector('#calibration-message');
  const referenceSelect = root.querySelector('#calibration-reference');
  const value = root.querySelector('#calibration-value');
  const apply = root.querySelector('#calibration-apply');
  const manual = root.querySelector('#calibration-manual');
  const measure = root.querySelector('#calibration-distance');
  const clear = root.querySelector('#calibration-clear');
  const scaleOutput = root.querySelector('#calibration-scale');
  const lengthOutput = root.querySelector('#calibration-length');
  const distanceOutput = root.querySelector('#calibration-distance-value');
  let revision = 0;
  let bitmap = null;
  let data = null;
  let spacing = null;
  let reference = [];
  let distancePoints = [];
  let mode = 'reference';
  let dragging = null;

  function publish() {
    root.dispatchEvent(new CustomEvent('calibrationchange', { detail: snapshot() }));
  }
  function snapshot() {
    return { coordinate_space: 'original_image', spacing: spacing && { ...spacing },
      endpoints: reference.map(p => [...p]), value_mm: Number(value.value) || null };
  }
  function update() {
    const length = math.distance(reference);
    lengthOutput.textContent = length == null ? 'Place both endpoints' : `${length.toFixed(2)} pixels`;
    scaleOutput.textContent = spacing
      ? (Math.abs(spacing.row_mm - spacing.column_mm) < 1e-9
        ? `${spacing.row_mm.toFixed(5)} mm / pixel`
        : `${spacing.column_mm.toFixed(5)} × ${spacing.row_mm.toFixed(5)} mm / pixel (x, y)`)
      : 'Not calibrated';
    const distance = math.distance(distancePoints, spacing);
    distanceOutput.textContent = spacing && distance != null ? `${distance.toFixed(2)} mm` : '—';
    apply.disabled = !math.reference(reference, Number(value.value));
    manual.disabled = !bitmap;
    clear.disabled = !bitmap;
    measure.disabled = !spacing;
    if (!spacing && mode === 'distance') mode = 'reference';
    measure.classList.toggle('active', mode === 'distance');
    draw();
  }
  function drawSegment(ctx, points, color) {
    if (!points.length) return;
    const factor = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2 * factor;
    if (points.length === 2) {
      ctx.beginPath(); ctx.moveTo(...points[0]); ctx.lineTo(...points[1]); ctx.stroke();
    }
    for (const point of points) {
      ctx.beginPath(); ctx.arc(...point, 5 * factor, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = factor; ctx.stroke();
    }
  }
  function draw() {
    if (!bitmap) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    drawSegment(ctx, reference, '#62e4a4');
    drawSegment(ctx, distancePoints, '#ffce67');
  }
  function pickCandidate(index) {
    const candidate = data?.candidates[index];
    reference = candidate ? candidate.endpoints.map(p => [...p]) : [];
    value.value = candidate ? candidate.value_mm : '';
    spacing = null;
    distancePoints = [];
    mode = 'reference';
    message.textContent = candidate
      ? `Reference: ${candidate.raw_text}. Check the green endpoints and apply its length.`
      : 'Click the two ends of a known reference, enter its length in mm, then apply.';
    update(); publish();
  }
  referenceSelect.addEventListener('change', () => pickCandidate(Number(referenceSelect.value)));
  value.addEventListener('input', () => {
    spacing = null;
    message.textContent = 'Apply the reference length to update the image scale.';
    update(); publish();
  });
  apply.addEventListener('click', () => {
    const next = math.reference(reference, Number(value.value));
    if (!next) return;
    spacing = next;
    message.textContent = 'Reference applied. Select Measure distance, then click two points.';
    update(); publish();
  });
  manual.addEventListener('click', () => {
    referenceSelect.value = '-1'; reference = []; spacing = null; distancePoints = [];
    mode = 'reference'; value.disabled = false;
    message.textContent = 'Click the two ends of a known reference, enter its length in mm, then apply.';
    update(); publish();
  });
  clear.addEventListener('click', () => {
    reference = []; spacing = null; distancePoints = []; value.value = ''; mode = 'reference';
    referenceSelect.value = '-1';
    message.textContent = 'Scale cleared. Draw a reference or choose a detected reference.';
    update(); publish();
  });
  measure.addEventListener('click', () => {
    mode = 'distance'; distancePoints = [];
    message.textContent = 'Click two points to measure their distance. Drag either point to adjust.';
    update();
  });
  const pointFromEvent = event => {
    const box = canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(canvas.width - 1, (event.clientX - box.left) * canvas.width / box.width)),
      Math.max(0, Math.min(canvas.height - 1, (event.clientY - box.top) * canvas.height / box.height))];
  };
  canvas.addEventListener('pointerdown', event => {
    if (!bitmap || event.button !== 0) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const points = mode === 'distance' ? distancePoints : reference;
    const box = canvas.getBoundingClientRect();
    let nearest = points.findIndex(p => Math.hypot((p[0]-point[0])*box.width/canvas.width, (p[1]-point[1])*box.height/canvas.height) < 14);
    if (nearest < 0) {
      if (points.length === 2) points.splice(0);
      points.push(point); nearest = points.length - 1;
    }
    points[nearest] = point;
    dragging = { index: nearest, mode };
    canvas.setPointerCapture(event.pointerId);
    if (mode === 'reference') {
      spacing = null;
      message.textContent = 'Adjust the green endpoints, then apply the reference length.';
    }
    update(); publish();
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    const points = dragging.mode === 'distance' ? distancePoints : reference;
    points[dragging.index] = pointFromEvent(event);
    update();
  });
  const finishDrag = () => { dragging = null; publish(); };
  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  new ResizeObserver(draw).observe(canvas);

  async function load(file, cached = null, profile = null) {
    const current = ++revision;
    if (bitmap) bitmap.close();
    bitmap = null; data = null; spacing = null; reference = []; distancePoints = []; dragging = null;
    mode = 'reference'; value.value = ''; referenceSelect.replaceChildren();
    canvas.hidden = true; panel.hidden = false; value.disabled = false;
    message.textContent = 'Finding the image scale…'; update(); publish();
    try {
      const previewResponse = await calibrate({ ...file, profile, previewOnly: Boolean(cached) });
      const response = cached ? { ...previewResponse, ...cached, image_png: previewResponse.image_png } : previewResponse;
      if (current !== revision) return;
      const bytes = Uint8Array.from(atob(response.image_png), char => char.charCodeAt(0));
      const decoded = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      if (current !== revision) { decoded.close(); return; }
      bitmap = decoded; data = response;
      canvas.width = response.width; canvas.height = response.height; canvas.hidden = false;
      const blank = new Option('Draw a reference', '-1'); referenceSelect.add(blank);
      response.candidates.forEach((candidate, index) => {
        referenceSelect.add(new Option(`${candidate.raw_text} — ${candidate.length_px.toFixed(1)} px`, String(index)));
      });
      if (response.selected_index !== null) {
        referenceSelect.value = String(response.selected_index);
        const candidate = response.candidates[response.selected_index];
        reference = candidate.endpoints.map(p => [...p]); value.value = candidate.value_mm;
      }
      spacing = response.spacing;
      message.textContent = response.message;
      update(); publish();
      return response;
    } catch (error) {
      if (current !== revision) return;
      message.textContent = `Could not load image scale: ${error.message}`;
      update();
    }
  }
  return { load, snapshot };
}
