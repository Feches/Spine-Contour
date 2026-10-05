import { el } from '../dom.js';
import { bitmapFromBase64 } from '../viewer/canvas.js';
import { comparisonRegions } from '../data/crop-comparison.js';

const COLORS = ['#36b8f2', '#ffae42'];

function measurementsSummary(measurements) {
  const format = (value, unit) => Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : 'Unavailable';
  return el('dl', { class: 'crop-comparison-measures' },
    el('div', {}, el('dt', {}, 'C2–C7 Cobb'), el('dd', {}, format(measurements?.C2C7_COBB, '°'))),
    el('div', {}, el('dt', {}, 'L1–S1 lordosis'), el('dd', {}, format(measurements?.LL?.['L1-S1'], '°'))),
    el('div', {}, el('dt', {}, 'C7–S1 SVA'), el('dd', {}, format(measurements?.GLOBAL_SVA_PX, 'px'))));
}

function drawWindow(ctx, window, scale, color, label, candidate = false) {
  const [left, top, right, bottom] = window;
  ctx.lineWidth = candidate ? 2 : 3;
  ctx.strokeStyle = color;
  ctx.setLineDash(candidate ? [7, 5] : []);
  ctx.strokeRect(left * scale, top * scale, (right - left) * scale, (bottom - top) * scale);
  ctx.setLineDash([]);
  ctx.font = 'bold 14px sans-serif';
  const labelWidth = ctx.measureText(label).width + 12;
  const x = Math.max(0, left * scale);
  const y = Math.max(18, top * scale);
  ctx.fillStyle = '#111';
  ctx.fillRect(x, y - 18, labelWidth, 20);
  ctx.fillStyle = color;
  ctx.fillText(label, x + 6, y - 3);
}

async function resultCard(title, response) {
  const card = el('section', { class: 'crop-comparison-card' }, el('h3', {}, title));
  const image = await bitmapFromBase64(response.image_png);
  try {
    const regions = comparisonRegions(response.qc, image.width);
    const scale = Math.min(1, 640 / image.width, 900 / image.height);
    const canvas = el('canvas', { class: 'crop-comparison-film', width: Math.max(1, Math.round(image.width * scale)),
      height: Math.max(1, Math.round(image.height * scale)), 'aria-label': `${title} full-spine film with accepted crop windows` });
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    regions.forEach((region, index) => {
      if (region.candidateWindow) drawWindow(ctx, region.candidateWindow, scale, COLORS[index],
        `${region.name} proposal`, true);
      if (region.window) drawWindow(ctx, region.window, scale, COLORS[index], region.name);
    });
    card.append(canvas);
    const crops = el('div', { class: 'crop-comparison-crops' });
    for (const [index, region] of regions.entries()) {
      const crop = el('figure', {}, el('figcaption', {},
        el('span', { class: 'crop-comparison-swatch', style: `background:${COLORS[index]}` }),
        `${region.name} · ${region.methodLabel}`));
      const addPreview = (window, label) => {
        const [left, top, right, bottom] = window;
        const clipped = [Math.max(0, left), Math.max(0, top), Math.min(image.width, right), Math.min(image.height, bottom)];
        if (clipped[2] > clipped[0] && clipped[3] > clipped[1]) {
          crop.append(el('p', { class: 'crop-comparison-crop-label' }, label));
          const preview = el('canvas', { width: 240,
            height: Math.max(1, Math.round(240 * (clipped[3] - clipped[1]) / (clipped[2] - clipped[0]))),
            'aria-label': `${region.name} ${label.toLowerCase()} from ${title}` });
          preview.getContext('2d').drawImage(image, clipped[0], clipped[1], clipped[2] - clipped[0],
            clipped[3] - clipped[1], 0, 0, preview.width, preview.height);
          crop.append(preview);
        }
      };
      if (region.window) addPreview(region.window, 'Accepted crop');
      if (region.candidateWindow) addPreview(region.candidateWindow,
        region.window ? 'Initial proposal' : 'Proposal, not accepted');
      if (!region.window && !region.candidateWindow) {
        crop.append(el('p', {}, 'No accepted crop'));
      }
      crops.append(crop);
    }
    card.append(crops);
    card.append(measurementsSummary(response.measurements));
    const fallback = regions.some((region) => region.method === 'search_fallback');
    if (fallback) card.append(el('p', { class: 'crop-comparison-warning' },
      'The trained model did not pass the crop checks for every region; crop search was used where indicated.'));
    return card;
  } finally {
    image.close();
  }
}

export function openCropComparison(studyName) {
  const status = el('p', { class: 'crop-comparison-status', role: 'status', 'aria-live': 'polite' }, 'Preparing comparison…');
  const columns = el('div', { class: 'crop-comparison-columns' },
    el('div', { class: 'crop-comparison-pending' }, 'Crop search pending'),
    el('div', { class: 'crop-comparison-pending' }, 'Trained model pending'));
  const close = el('button', { type: 'button', class: 'btn btn-small', disabled: true }, 'Close');
  const dialog = el('dialog', { class: 'crop-comparison-dialog', 'aria-label': 'Compare crop methods' },
    el('div', { class: 'crop-comparison-heading' },
      el('div', {}, el('h2', {}, 'Compare crop methods'),
        el('p', {}, `${studyName} · same full-spine film · settings and saved measurements are unchanged`)), close),
    status, columns);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => { if (close.disabled) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return {
    setStatus: (message) => { status.textContent = message; },
    addResult: async (index, title, response) => {
      columns.replaceChild(await resultCard(title, response), columns.children[index]);
    },
    addFailure: (index, title, message) => {
      columns.replaceChild(el('section', { class: 'crop-comparison-card' }, el('h3', {}, title),
        el('p', { class: 'crop-comparison-warning' }, message)), columns.children[index]);
    },
    finish: () => { close.disabled = false; },
  };
}
