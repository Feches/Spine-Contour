import { segmentalColumns, segmentalEndplates } from '../data/segmental.js';
import { CERVICAL_LEVELS } from '../data/cervical.js';
import { LEVELS, landmarkAt, femoralCircle, FEMORAL_SIDES, landmarkHandles } from './geometry.js';
import { sameHandle } from './interactions.js';
import { applyWindow } from './window-level.js';
import { LEVEL_CODES, kindOf, levelState, placementSteps, fitRim } from '../data/levels.js';
import { quadrilateral } from '../data/level-projection.js';
import { levelHandles } from './level-handles.js';

export const LEVEL_RGB = {
  C2: [183, 139, 244],
  C3: [255, 99, 132],
  C4: [255, 159, 64],
  C5: [255, 205, 86],
  C6: [75, 192, 192],
  C7: [54, 162, 235],
  L1: [255, 99, 132],
  L2: [255, 159, 64],
  L3: [255, 205, 86],
  L4: [75, 192, 192],
  L5: [54, 162, 235],
  // (2026-10-10, level editor, D9) The three levels the editor adds that the mask overlay never painted.
  T1: [255, 159, 64],
  T4: [255, 205, 86],
  S1: [255, 99, 132],
};
export const FEMORAL_OVERLAY_COLOR = [98, 210, 111];
// Baked into the overlay pixel data once per prediction. The static layer scales this by
// (overlayOpacity / 100) via ctx.globalAlpha at draw time, so the default overlayOpacity of 50
// reproduces the legacy renderer.js's hardcoded alpha of 58 exactly (116 * 0.5 = 58).
// That file was deleted by this plan's Task 11; the reference is historical.
export const BASE_OVERLAY_ALPHA = 116;

// The levels the backend's mask paints. LEVEL_RGB also holds T1, T4 and S1 for the level editor's
// outlines; the stored image has never coloured S1 and has no T1 or T4, and still does not.
const MASK_LEVELS = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'L1', 'L2', 'L3', 'L4', 'L5'];

export function buildLabelColorMap(labels) {
  const map = {};
  for (const level of MASK_LEVELS) {
    const id = labels?.[level];
    if (typeof id === 'number') map[id] = LEVEL_RGB[level];
  }
  return map;
}

export function buildOverlayPixels(maskPixels, _femoralPixels, colorByLabel, alpha) {
  const overlay = new Uint8ClampedArray(maskPixels.length);
  for (let offset = 0; offset < maskPixels.length; offset += 4) {
    const labelId = maskPixels[offset];
    const color = colorByLabel[labelId];
    if (color) {
      overlay[offset] = color[0];
      overlay[offset + 1] = color[1];
      overlay[offset + 2] = color[2];
      overlay[offset + 3] = alpha;
    }
  }
  return overlay;
}

export async function bitmapFromBase64(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
}

export async function loadStudyImages(predictResponse) {
  const [image, mask] = await Promise.all([
    bitmapFromBase64(predictResponse.image_png),
    bitmapFromBase64(predictResponse.mask_png),
  ]);
  const scratch = document.createElement('canvas');
  scratch.width = image.width;
  scratch.height = image.height;
  const context = scratch.getContext('2d');
  context.drawImage(mask, 0, 0);
  const maskPixels = context.getImageData(0, 0, image.width, image.height).data;
  const colorByLabel = buildLabelColorMap(predictResponse.labels);
  const overlayPixels = buildOverlayPixels(maskPixels, null, colorByLabel, BASE_OVERLAY_ALPHA);
  context.clearRect(0, 0, image.width, image.height);
  context.putImageData(new ImageData(overlayPixels, image.width, image.height), 0, 0);
  // `labels` ({ L1: 20, ... }) rides with `mask` so the label record can trace a level's outline from it later
  // (Task 12). The RGBA buffer read above is not kept: `mask` is the source and a film's buffer is 4 bytes a pixel.
  return { image, mask, overlayCanvas: scratch, width: image.width, height: image.height, labels: predictResponse.labels ?? null };
}

// `image` is an ImageBitmap, except for a film shown from its decoded original (imagesFromRaw),
// whose `image` is a canvas: nothing to close.
export function disposeStudyImages(images) {
  if (!images) return;
  images.image.close?.();
  images.mask?.close();
}

// (2026-10-10, level editor) The windowed film's RGBA, reused while the film size is unchanged, so a
// slider tick or a drag frame on a 25-megapixel film does not allocate 100 MB.
let windowScratch = null;

function windowedPixels(raw, window) {
  const size = raw.width * raw.height * 4;
  if (!windowScratch || windowScratch.length !== size) windowScratch = new Uint8ClampedArray(size);
  return applyWindow(raw, window, windowScratch);
}

// A film with no stored image (no segmentation result, or none yet) shown from its decoded original
// at `window`: the same shape loadStudyImages returns, with no mask and no overlay, `raw` attached
// and `preview: true` -- it is never a prediction. A canvas is a valid drawImage source.
export function imagesFromRaw(raw, window) {
  const image = document.createElement('canvas');
  image.width = raw.width;
  image.height = raw.height;
  image.getContext('2d').putImageData(new ImageData(windowedPixels(raw, window), raw.width, raw.height), 0, 0);
  return { image, mask: null, overlayCanvas: null, width: raw.width, height: raw.height, raw, preview: true };
}

// Spec 13: a thumbnail is at most 128 px on its long edge, JPEG, inline as a data URI. Pure size
// math here so it can be tested; the encode below needs a canvas.
export function thumbnailSize(width, height, maxEdge = 128) {
  const longEdge = Math.max(width, height, 1);
  const scale = Math.min(1, maxEdge / longEdge);
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export function thumbnailDataUri(bitmap, maxEdge = 128) {
  const [width, height] = thumbnailSize(bitmap.width, bitmap.height, maxEdge);
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  scratch.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  return scratch.toDataURL('image/jpeg', 0.82);
}

export function createLayeredCanvases(host) {
  const staticCanvas = document.createElement('canvas');
  const dynamicCanvas = document.createElement('canvas');
  // Layout lives in styles/screens/analysis.css under .viewer-canvas. These used to be
  // five inline style writes pinning both canvases to width:100%/height:100%, which
  // stretched every radiograph to the stage's aspect ratio.
  staticCanvas.className = 'viewer-canvas';
  dynamicCanvas.className = 'viewer-canvas viewer-canvas-dynamic';
  host.append(staticCanvas, dynamicCanvas);
  return {
    staticCanvas,
    dynamicCanvas,
    staticCtx: staticCanvas.getContext('2d'),
    dynamicCtx: dynamicCanvas.getContext('2d'),
  };
}

export function sizeCanvases(canvases, width, height) {
  canvases.staticCanvas.width = width;
  canvases.staticCanvas.height = height;
  canvases.dynamicCanvas.width = width;
  canvases.dynamicCanvas.height = height;
}

// The film, then the mask overlay. (2026-10-10, level editor) `opts.window` ({width, level}) with a
// decoded original on `images.raw` puts the windowed original instead of the stored image -- the
// LUT touches the film layer only -- and `opts.editing` leaves the overlay off. With neither set,
// the calls are exactly what they were.
export function drawStaticLayer(ctx, canvas, images, opts) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!images) return;
  if (opts.window && images.raw) {
    const { raw } = images;
    ctx.putImageData(new ImageData(windowedPixels(raw, opts.window), raw.width, raw.height), 0, 0);
  } else {
    ctx.drawImage(images.image, 0, 0);
  }
  if (opts.overlays && images.overlayCanvas && !opts.editing) {
    ctx.globalAlpha = Math.max(0, Math.min(1, opts.overlayOpacity / 100));
    ctx.drawImage(images.overlayCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }
}

// The four off-theme literals the architecture contract sanctions for the stage itself;
// plan 04's edit-mode literals follow CANVAS_MONO below. Everything drawn as DOM
// over this canvas is styled from styles/screens/analysis.css -- see BD-3.
const STAGE_LINE_COLOR = '#38342F';
const STAGE_SELECTED_COLOR = '#D45A32';
const STAGE_LABEL_FILL = 'rgba(250,247,242,.75)';
const LABEL_PLATE_FILL = 'rgba(11,10,9,.78)';

// Canvas text cannot express font-variant-numeric: tabular-nums (the ctx.font shorthand
// has no slot for it), so every canvas-drawn label that contains a number uses Chivo
// Mono, which is monospaced and therefore tabular by construction.
const CANVAS_MONO = "'Chivo Mono', monospace";

// Plan 04 additions to this file's literal set. All of them are pixels drawn INTO the
// canvas, which is the exception the architecture contract grants viewer/canvas.js:
// the stage background (the contract's first literal) as the handle outline; the legacy
// editor's four per-corner colours (renderer.js:43, historical); the femoral handle colour,
// which is the overlay's own femoral green; and the retrace point colour.
const STAGE_BG_COLOR = '#0B0A09';
export const CORNER_COLORS = { SA: '#32d4ff', SP: '#64e19a', IA: '#ffb259', IP: '#fa78d4' };
const FEMORAL_HANDLE_COLOR = `rgb(${FEMORAL_OVERLAY_COLOR.join(',')})`;
export const TRACE_COLOR = '#ffe071';

// Handles keep a constant size ON SCREEN, unlike the outlines, which scale with the image.
// Every handle dimension below is in CSS pixels and is multiplied by opts.pixelRatio
// (image pixels per CSS pixel at the current fit and zoom) at draw time.
const HANDLE_RADIUS_PX = 5;
const HANDLE_HOVER_RADIUS_PX = 8;
const HANDLE_RING_RADIUS_PX = 10;
const HANDLE_LABEL_PX = 11;

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// Draws the level's name (L1..L5, S1) ONLY when that level is selected. Named for what
// it does: the unselected levels are identified by their outline, not by a label, so the
// stage is not covered in text. Sized with the image, like the outlines.
function drawSelectedStageLabel(ctx, text, point, selected, canvasWidth) {
  if (!selected) return;
  const fontSize = Math.max(8, canvasWidth / 90);
  ctx.font = `700 ${fontSize}px ${CANVAS_MONO}`;
  ctx.fillStyle = STAGE_LABEL_FILL;
  ctx.fillText(text, point[0] + fontSize * 0.5, point[1] - fontSize * 0.5);
}

// The point just beyond an endplate's anterior corner (15% of the endplate's length past
// it, along the endplate) and which way a label should extend from it, away from the
// body: +1 rightward, -1 leftward. Scale-free, so it holds at any film size.
function beyondAnterior(sa, sp) {
  const dx = sa[0] - sp[0];
  const dy = sa[1] - sp[1];
  const gap = 0.15;
  return { anchor: [sa[0] + dx * gap, sa[1] + dy * gap], side: dx >= 0 ? 1 : -1 };
}

// The selected construction's label: what it says and where it anchors, in image space.
// The label itself is a DOM chip over the stage (components/viewer.js) so it can sit in the
// black space around the film and scale with it; no measurement text is drawn on the canvas.
// Every selectedLevel value is handled explicitly; anything else has no label.
export function constructionLabel(geometry, selectedLevel, measurements) {
  if (!geometry || !selectedLevel || !measurements) return null;
  if (selectedLevel.startsWith('SEG_')) {
    const plates = segmentalEndplates(geometry, selectedLevel);
    const value = measurements[selectedLevel];
    if (!plates || !Number.isFinite(value)) return null;
    const def = segmentalColumns('full_spine').find(c => c.key === selectedLevel);
    return { text: `${def.label} ${value.toFixed(1)}°`, ...beyondAnterior(...plates[0]) };
  }
  if (geometry.region === 'full_spine' && selectedLevel === 'GLOBAL_SVA') {
    if (!Number.isFinite(measurements.GLOBAL_SVA_PX)
        || !geometry.c7_centroid || !geometry.s1_superior?.[1]) return null;
    const mm = Number.isFinite(measurements.GLOBAL_SVA_MM);
    return { text: `C7–S1 SVA ${(mm ? measurements.GLOBAL_SVA_MM : measurements.GLOBAL_SVA_PX).toFixed(1)} ${mm ? 'mm' : 'px (uncalibrated)'}`,
      anchor: [geometry.c7_centroid[0], geometry.s1_superior[1][1]], side: 1 };
  }
  if (['cervical', 'full_spine'].includes(geometry.region) && ['C2C7_COBB', 'C2C7_SVA'].includes(selectedLevel)) {
    if (selectedLevel === 'C2C7_COBB' && Number.isFinite(measurements.C2C7_COBB)) {
      return { text: `C2–C7 Cobb ${measurements.C2C7_COBB.toFixed(1)}°`,
        ...beyondAnterior(...geometry.vertebrae.C2.inferior) };
    }
    if (selectedLevel === 'C2C7_SVA' && Number.isFinite(measurements.C2C7_SVA_PX)) {
      const mm = Number.isFinite(measurements.C2C7_SVA_MM);
      return { text: `C2–C7 SVA ${(mm ? measurements.C2C7_SVA_MM : measurements.C2C7_SVA_PX).toFixed(1)} ${mm ? 'mm' : 'px (uncalibrated)'}`,
        anchor: [geometry.c2_centroid[0], geometry.vertebrae.C7.superior[1][1]], side: 1 };
    }
    return null;
  }
  const s1 = geometry.s1_superior;
  if (!s1) return null;
  const s1Mid = midpoint(s1[0], s1[1]);
  const hip = geometry.hip_midpoint;
  if (selectedLevel === 'S1') {
    const { PI, PT, SS } = measurements;
    if (!hip || PI == null || PT == null || SS == null) return null;
    return { text: `PI ${PI.toFixed(1)}°  PT ${PT.toFixed(1)}°  SS ${SS.toFixed(1)}°`, anchor: midpoint(s1Mid, hip), side: 1 };
  }
  if (selectedLevel === 'SS') {
    return measurements.SS == null ? null : { text: `SS ${measurements.SS.toFixed(1)}°`, ...beyondAnterior(s1[0], s1[1]) };
  }
  if (selectedLevel === 'PT') {
    return measurements.PT == null ? null : { text: `PT ${measurements.PT.toFixed(1)}°`, anchor: midpoint(hip, s1Mid), side: 1 };
  }
  if (selectedLevel === 'PI') {
    return measurements.PI == null ? null : { text: `PI ${measurements.PI.toFixed(1)}°`, anchor: midpoint(s1Mid, hip), side: 1 };
  }
  if (selectedLevel === 'L1PA') {
    return measurements.L1PA == null ? null : { text: `L1PA ${measurements.L1PA.toFixed(1)}°`, anchor: midpoint(hip, geometry.l1_center), side: 1 };
  }
  if (LEVELS.includes(selectedLevel)) {
    const body = geometry.vertebrae?.[selectedLevel];
    const key = `${selectedLevel}-S1`;
    const value = measurements.LL?.[key];
    if (!body || value == null) return null;
    return { text: `LL ${key} ${value.toFixed(1)}°`, ...beyondAnterior(body.superior[0], body.superior[1]) };
  }
  return null;
}

// Reference axes (horizontal, vertical, endplate normal) are drawn dashed and slightly
// faded so it is never ambiguous which line is the anatomy being measured and which is the
// datum it is measured against.
function strokeReference(ctx, from, to) {
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(...from);
  ctx.lineTo(...to);
  ctx.stroke();
  ctx.restore();
}

function drawSelectedMeasurement(ctx, canvas, geometry, selectedLevel, measurements) {
  if (!selectedLevel || !measurements) return;
  // The same dependencies gate the caption and its construction.
  if (!constructionLabel(geometry, selectedLevel, measurements)) return;
  ctx.save();
  try {
    ctx.strokeStyle = STAGE_SELECTED_COLOR;
    ctx.lineWidth = Math.max(2, canvas.width / 400);
    if (selectedLevel.startsWith('SEG_')) {
      for (const [a, p] of segmentalEndplates(geometry, selectedLevel)) {
        const dx = p[0] - a[0], dy = p[1] - a[1];
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...p); ctx.stroke();
        strokeReference(ctx, [a[0] - dx, a[1] - dy], [p[0] + dx, p[1] + dy]);
      }
    } else if (geometry.region === 'full_spine' && selectedLevel === 'GLOBAL_SVA') {
      const c = geometry.c7_centroid, p = geometry.s1_superior[1];
      const foot = [c[0], p[1]];
      strokeReference(ctx, c, foot);
      ctx.beginPath(); ctx.moveTo(...foot); ctx.lineTo(...p); ctx.stroke();
      const tick = Math.max(4, canvas.width / 150);
      for (const x of [foot[0], p[0]]) { ctx.beginPath(); ctx.moveTo(x, p[1] - tick); ctx.lineTo(x, p[1] + tick); ctx.stroke(); }
    } else if (['cervical', 'full_spine'].includes(geometry.region) && ['C2C7_COBB', 'C2C7_SVA'].includes(selectedLevel)) {
      if (selectedLevel === 'C2C7_COBB') {
        for (const level of ['C2', 'C7']) {
          const [a, p] = geometry.vertebrae[level].inferior;
          const dx = p[0] - a[0], dy = p[1] - a[1];
          ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...p); ctx.stroke();
          strokeReference(ctx, [a[0] - dx * 1.5, a[1] - dy * 1.5], [p[0] + dx * 1.5, p[1] + dy * 1.5]);
        }
      } else if (selectedLevel === 'C2C7_SVA') {
        const c = geometry.c2_centroid, p = geometry.vertebrae.C7.superior[1];
        const foot = [c[0], p[1]];
        strokeReference(ctx, c, foot);
        ctx.beginPath(); ctx.moveTo(...foot); ctx.lineTo(...p); ctx.stroke();
        const tick = Math.max(4, canvas.width / 150);
        for (const x of [foot[0], p[0]]) { ctx.beginPath(); ctx.moveTo(x, p[1] - tick); ctx.lineTo(x, p[1] + tick); ctx.stroke(); }
      }
    } else if (selectedLevel === 'S1') {
      const s1 = geometry.s1_superior;
      const s1Mid = midpoint(s1[0], s1[1]);
      const hip = geometry.hip_midpoint;
      ctx.beginPath();
      ctx.moveTo(...s1Mid);
      ctx.lineTo(...hip);
      ctx.stroke();
    } else if (selectedLevel === 'PI' || selectedLevel === 'PT' || selectedLevel === 'SS') {
      const s1 = geometry.s1_superior;
      const s1Mid = midpoint(s1[0], s1[1]);
      const hip = geometry.hip_midpoint;
      // Reference rays are drawn the same length as the S1-to-hip span so the angle reads at a
      // sensible scale on any image size.
      const span = (hip ? Math.hypot(hip[0] - s1Mid[0], hip[1] - s1Mid[1]) : 0) || canvas.width / 6;

      if (selectedLevel === 'SS') {
        // Sacral slope: the S1 superior endplate against the HORIZONTAL.
        // backend: atan2(s1_vector.y, s1_vector.x)
        ctx.beginPath();
        ctx.moveTo(...s1[0]);
        ctx.lineTo(...s1[1]);
        ctx.stroke();
        // The horizontal extends OPPOSITE the endplate's own x-direction. Flipped from the
        // original on clinical review -- it reads better against the sacrum this way. The
        // reported angle is unaffected: the endplate is drawn as a full segment through
        // s1Mid, so the horizontal ray still forms the acute angle with one half of it
        // whichever side it sticks out.
        const dir = s1[1][0] >= s1[0][0] ? -1 : 1;
        strokeReference(ctx, s1Mid, [s1Mid[0] + dir * span, s1Mid[1]]);
      } else if (selectedLevel === 'PT') {
        // Pelvic tilt: the hip-to-S1-midpoint line against the VERTICAL through the hip.
        // backend: atan2(s1_mid.x - hip.x, hip.y - s1_mid.y)
        ctx.beginPath();
        ctx.moveTo(...hip);
        ctx.lineTo(...s1Mid);
        ctx.stroke();
        strokeReference(ctx, hip, [hip[0], hip[1] - span]);
      } else {
        // Pelvic incidence: the S1-midpoint-to-hip line against the PERPENDICULAR to the S1
        // endplate at its midpoint. backend: angle between the connection and normal_angle,
        // where normal_angle = s1_angle - pi/2, i.e. the endplate vector rotated -90deg.
        ctx.beginPath();
        ctx.moveTo(...s1Mid);
        ctx.lineTo(...hip);
        ctx.stroke();
        const vx = s1[1][0] - s1[0][0];
        const vy = s1[1][1] - s1[0][1];
        const length = Math.hypot(vx, vy) || 1;
        let normal = [vy / length, -vx / length];
        // Draw the perpendicular on the side the hip is on, so the two rays open into the angle
        // actually being reported rather than its supplement.
        if (normal[0] * (hip[0] - s1Mid[0]) + normal[1] * (hip[1] - s1Mid[1]) < 0) {
          normal = [-normal[0], -normal[1]];
        }
        strokeReference(ctx, s1Mid, [s1Mid[0] + normal[0] * span, s1Mid[1] + normal[1] * span]);
      }
    } else if (selectedLevel === 'L1PA') {
      // L1 pelvic angle: the angle subtended at the hip midpoint between the L1 body
      // centroid and the S1 endplate midpoint. Two rays from the hip -- NOT an endplate
      // pair. This branch exists because falling through to the lordosis branch below drew
      // the wrong construction under the right label. See the contract's selectedLevel
      // section.
      const hip = geometry.hip_midpoint;
      const l1c = geometry.l1_center;
      const s1Mid = midpoint(geometry.s1_superior[0], geometry.s1_superior[1]);
      ctx.beginPath();
      ctx.moveTo(...hip);
      ctx.lineTo(...l1c);
      ctx.moveTo(...hip);
      ctx.lineTo(...s1Mid);
      ctx.stroke();
    } else if (LEVELS.includes(selectedLevel)) {
      // Explicit branch, not a catch-all `else`. The architecture contract's selectedLevel
      // section makes this a binding rule: anything switching on selectedLevel must handle
      // non-level values explicitly rather than falling into a branch that assumes a
      // vertebra -- that exact shape is how L1PA once drew the lordosis line under its own
      // label. selectedLevel's domain also includes 'S1' | 'PI' | 'PT' | 'SS' | 'L1PA' | null,
      // all handled above; this branch is reached only for an actual vertebral level.
      const body = geometry.vertebrae?.[selectedLevel];
      const s1 = geometry.s1_superior;
      if (body) {
        ctx.beginPath();
        ctx.moveTo(...body.superior[0]);
        ctx.lineTo(...body.superior[1]);
        ctx.moveTo(...s1[0]);
        ctx.lineTo(...s1[1]);
        ctx.stroke();
      }
    }
  } finally {
    ctx.restore();
  }
}

function drawHandle(ctx, canvas, point, color, { selected, hovered, label, pixelRatio }) {
  const radius = (hovered ? HANDLE_HOVER_RADIUS_PX : HANDLE_RADIUS_PX) * pixelRatio;
  if (selected) {
    ctx.beginPath();
    ctx.arc(point[0], point[1], HANDLE_RING_RADIUS_PX * pixelRatio, 0, 2 * Math.PI);
    ctx.strokeStyle = STAGE_SELECTED_COLOR;
    ctx.lineWidth = 2 * pixelRatio;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(point[0], point[1], radius, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = STAGE_BG_COLOR;
  ctx.lineWidth = pixelRatio;
  ctx.stroke();
  if (!(selected || hovered) || !label) return;
  const fontSize = HANDLE_LABEL_PX * pixelRatio;
  const pad = 4 * pixelRatio;
  ctx.font = `600 ${fontSize}px ${CANVAS_MONO}`;
  const width = ctx.measureText(label).width + 2 * pad;
  const height = fontSize + 2 * pad;
  // Keep the plate inside the canvas.
  const x = Math.max(0, Math.min(point[0] + radius + 2 * pad, canvas.width - width));
  const y = Math.max(0, Math.min(point[1] - radius - height, canvas.height - height));
  ctx.fillStyle = LABEL_PLATE_FILL;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = STAGE_LABEL_FILL;
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + pad, y + pad);
  ctx.textBaseline = 'alphabetic';
}

// Lumbar: 22 landmarks and centre/rim handles for femoral heads. Cervical:
// all available endplate corners and the C2 centroid. Order matters for labels: a selected or
// hovered handle's label is drawn with it, so later handles can overlap it.
function drawHandles(ctx, canvas, geometry, { selection, hover, pixelRatio }) {
  const handleOpts = (handle, label) => ({
    selected: sameHandle(selection, handle),
    hovered: sameHandle(hover, handle),
    label,
    pixelRatio,
  });
  for (const { level, corner } of landmarkHandles(geometry)) {
    const handle = { kind: 'landmark', level, corner };
    const point = landmarkAt(geometry, level, corner);
    if (!point) continue;
    const label = geometry.vertebrae?.[level]?.anterior_confirmed === false
      ? `${level} ${corner.startsWith('S') ? 'upper' : 'lower'} ${corner.endsWith('A') ? '1' : '2'}`
      : `${level} ${corner === 'CENTROID' ? 'centroid' : corner}`;
    drawHandle(ctx, canvas, point, CORNER_COLORS[corner] ?? STAGE_SELECTED_COLOR, handleOpts(handle, label));
  }
  for (const side of FEMORAL_SIDES) {
    const circle = femoralCircle(geometry, side);
    if (!circle) continue;
    const [cx, cy, r] = circle;
    const name = side === 'left' ? 'Head 1' : 'Head 2';
    drawHandle(ctx, canvas, [cx, cy], FEMORAL_HANDLE_COLOR, handleOpts({ kind: 'femoral', side, part: 'center' }, name));
    drawHandle(ctx, canvas, [cx + r, cy], FEMORAL_HANDLE_COLOR, handleOpts({ kind: 'femoral', side, part: 'rim' }, `${name} \u00B7 resize`));
  }
}

function drawTracePoints(ctx, tracePoints, pixelRatio) {
  const fontSize = HANDLE_LABEL_PX * pixelRatio;
  ctx.font = `600 ${fontSize}px ${CANVAS_MONO}`;
  tracePoints.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point[0], point[1], HANDLE_RADIUS_PX * pixelRatio, 0, 2 * Math.PI);
    ctx.fillStyle = TRACE_COLOR;
    ctx.fill();
    ctx.strokeStyle = STAGE_BG_COLOR;
    ctx.lineWidth = pixelRatio;
    ctx.stroke();
    ctx.fillStyle = STAGE_LABEL_FILL;
    ctx.fillText(String(index + 1), point[0] + 8 * pixelRatio, point[1] - 8 * pixelRatio);
  });
}

// ---- Level editor (2026-10-10) ----
//
// What the level editor draws on the dynamic layer while editing (handoff §5; plan Task 9): every visible
// placed level filled and outlined, the selected level's handles, the model's own geometry dashed under an
// edited level, a plate naming each level, and the placement in progress. Every size is in CSS pixels times
// `opts.pixelRatio`, like the handles above, so it holds its size on screen at any fit and zoom. The editor
// state is read, never written.

const LEVEL_STROKE_ALPHA = 0.85;
const LEVEL_STROKE_PX = 1.25;
const SELECTED_STROKE_PX = 2;
const GHOST_COLOR = 'rgba(250,247,242,.7)';
const INK_COLOR = '#FAF7F2';
const LEVEL_HANDLE_RADIUS_PX = 6;
const LEVEL_HANDLE_OUTLINE_PX = 2;
const CENTRE_DOT_RADIUS_PX = 3.5;
const C2_CENTROID_RADIUS_PX = 3;
const T4_CENTROID_RADIUS_PX = 5;
const PLACEMENT_LINE_PX = 1.5;
const EDITOR_DASH_PX = [6, 5];
const LABEL_FONT_PX = 11;
const LABEL_HEIGHT_PX = 18;
const LABEL_PAD_PX = 6;
const LABEL_RADIUS_PX = 4;
const LABEL_OFFSET_PX = 14;

const isPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isPair = (pair) => Array.isArray(pair) && pair.length === 2 && isPoint(pair[0]) && isPoint(pair[1]);
const rgba = (color, alpha) => `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
const dashFor = (pixelRatio) => EDITOR_DASH_PX.map(length => length * pixelRatio);

// A level's overlay colour; the femoral heads share the femoral green.
function levelColor(code) {
  return kindOf(code) === 'circle' ? FEMORAL_OVERLAY_COLOR : LEVEL_RGB[code];
}

/**
 * The canvas colour a handle or a placement step is drawn in: SA SP IA IP are the corner colours, `trace` is
 * the rim-point colour, `level` is the level's own overlay colour (the femoral green for a head).
 */
export function colorFor(colorKey, code) {
  if (Object.hasOwn(CORNER_COLORS, colorKey)) return CORNER_COLORS[colorKey];
  if (colorKey === 'trace') return TRACE_COLOR;
  const rgb = levelColor(code);
  return rgb ? `rgb(${rgb.join(',')})` : STAGE_SELECTED_COLOR;
}

// A level's shape as drawable parts: a polyline (`line`, `closed`) or a circle (`arc`, `radius`). `area` parts
// can be filled; `dot` parts are the centroid marks, which stay filled when the level is selected. A two-point
// endplate has no area. Geometry that is not what its kind says gives no parts: a bad record draws nothing.
function shapeParts(code, geometry, pixelRatio) {
  if (!geometry) return [];
  switch (kindOf(code)) {
    case 'body':
      return isPair(geometry.superior) && isPair(geometry.inferior)
        ? [{ line: quadrilateral(geometry), closed: true, area: true }] : [];
    case 'c2':
      return isPair(geometry.inferior) && isPoint(geometry.centroid)
        ? [{ line: geometry.inferior }, { arc: geometry.centroid, radius: C2_CENTROID_RADIUS_PX * pixelRatio, area: true, dot: true }] : [];
    case 'endplate':
      return isPair(geometry.superior) ? [{ line: geometry.superior }] : [];
    case 'centroid':
      return isPoint(geometry.centroid)
        ? [{ arc: geometry.centroid, radius: T4_CENTROID_RADIUS_PX * pixelRatio, area: true, dot: true }] : [];
    case 'circle':
      return isPoint(geometry.center) && geometry.radius >= 0
        ? [{ arc: geometry.center, radius: geometry.radius, area: true }] : [];
    default:
      return [];
  }
}

function tracePart(ctx, part) {
  ctx.beginPath();
  if (part.line) {
    part.line.forEach((point, index) => (index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1])));
    if (part.closed) ctx.closePath();
  } else {
    ctx.arc(part.arc[0], part.arc[1], part.radius, 0, 2 * Math.PI);
  }
}

// The model's own geometry, dashed, under the current one.
function drawGhost(ctx, code, modelGeometry, pixelRatio) {
  ctx.save();
  ctx.setLineDash(dashFor(pixelRatio));
  ctx.strokeStyle = GHOST_COLOR;
  ctx.lineWidth = LEVEL_STROKE_PX * pixelRatio;
  for (const part of shapeParts(code, modelGeometry, pixelRatio)) {
    tracePart(ctx, part);
    ctx.stroke();
  }
  ctx.restore();
}

// The label plate's anchor: the posterior corner (the middle of the posterior edge for a body).
function labelAnchor(code, geometry) {
  switch (kindOf(code)) {
    case 'body': return midpoint(geometry.superior[1], geometry.inferior[1]);
    case 'c2': return geometry.inferior[1];
    case 'endplate': return geometry.superior[1];
    case 'centroid': return geometry.centroid;
    default: return null;
  }
}

function drawLevelLabel(ctx, code, anchor, selected, pixelRatio) {
  ctx.font = `500 ${LABEL_FONT_PX * pixelRatio}px ${CANVAS_MONO}`;
  const width = ctx.measureText(code).width + 2 * LABEL_PAD_PX * pixelRatio;
  const height = LABEL_HEIGHT_PX * pixelRatio;
  const x = anchor[0] + LABEL_OFFSET_PX * pixelRatio;
  const y = anchor[1] - height / 2;
  ctx.fillStyle = LABEL_PLATE_FILL;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, LABEL_RADIUS_PX * pixelRatio);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, width, height);
  }
  ctx.fillStyle = selected ? STAGE_SELECTED_COLOR : STAGE_LABEL_FILL;
  ctx.textBaseline = 'middle';
  ctx.fillText(code, x + LABEL_PAD_PX * pixelRatio, anchor[1]);
}

// The selected level's draggable points (and a head's fixed centre dot). The focused handle also gets the ring;
// a focus that names another level, or a handle this level does not have, draws nothing extra.
function drawLevelHandles(ctx, code, geometry, focused, pixelRatio) {
  if (kindOf(code) === 'circle' && isPoint(geometry.center)) {
    ctx.beginPath();
    ctx.arc(geometry.center[0], geometry.center[1], CENTRE_DOT_RADIUS_PX * pixelRatio, 0, 2 * Math.PI);
    ctx.fillStyle = INK_COLOR;
    ctx.fill();
  }
  for (const { handle, point, colorKey } of levelHandles(code, geometry)) {
    if (focused && focused.code === code && focused.handle === handle) {
      ctx.beginPath();
      ctx.arc(point[0], point[1], HANDLE_RING_RADIUS_PX * pixelRatio, 0, 2 * Math.PI);
      ctx.strokeStyle = STAGE_SELECTED_COLOR;
      ctx.lineWidth = SELECTED_STROKE_PX * pixelRatio;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(point[0], point[1], LEVEL_HANDLE_RADIUS_PX * pixelRatio, 0, 2 * Math.PI);
    ctx.fillStyle = colorFor(colorKey, code);
    ctx.fill();
    ctx.strokeStyle = STAGE_BG_COLOR;
    ctx.lineWidth = LEVEL_HANDLE_OUTLINE_PX * pixelRatio;
    ctx.stroke();
  }
}

// One placed level: ghost, fill, outline, label. True when it was drawn (its handles are drawn by the caller, last).
function drawPlacedLevel(ctx, editor, code, geometry, { overlays, fillAlpha, pixelRatio }) {
  const selected = editor.selected === code;
  // Overlays off hides every level but the selected one: no fill, no outline, no label.
  if (!overlays && !selected) return false;
  const parts = shapeParts(code, geometry, pixelRatio);
  if (parts.length === 0) return false;
  if (selected && levelState({ ...editor.levels[code], geometry }, editor.model?.[code]) === 'edited') {
    drawGhost(ctx, code, editor.model[code], pixelRatio);
  }
  const rgb = levelColor(code);
  for (const part of parts) {
    tracePart(ctx, part);
    if (part.area && (part.dot || overlays)) {
      ctx.fillStyle = rgba(rgb, part.dot && selected ? 1 : fillAlpha);
      ctx.fill();
    }
    ctx.strokeStyle = selected ? STAGE_SELECTED_COLOR : rgba(rgb, LEVEL_STROKE_ALPHA);
    ctx.lineWidth = (selected ? SELECTED_STROKE_PX : LEVEL_STROKE_PX) * pixelRatio;
    ctx.stroke();
  }
  const anchor = labelAnchor(code, geometry);
  if (anchor) drawLevelLabel(ctx, code, anchor, selected, pixelRatio);
  return true;
}

// The placement in progress: each click as a dot in its step's colour, then either a dashed line through them or,
// for a femoral head with two points or more, the dashed circle they fit and its centre.
function drawPlacement(ctx, canvas, placing, pixelRatio) {
  const points = placing.points ?? [];
  if (points.length === 0) return;
  const { steps } = placementSteps(placing.code);
  const circle = kindOf(placing.code) === 'circle';
  const fit = circle && points.length >= 2 ? fitRim(points, Math.hypot(canvas.width, canvas.height)) : null;
  if (circle ? fit : points.length >= 2) {
    ctx.save();
    ctx.setLineDash(dashFor(pixelRatio));
    ctx.strokeStyle = STAGE_SELECTED_COLOR;
    ctx.lineWidth = PLACEMENT_LINE_PX * pixelRatio;
    ctx.beginPath();
    if (fit) {
      ctx.arc(fit.center[0], fit.center[1], fit.radius, 0, 2 * Math.PI);
    } else {
      points.forEach((point, index) => (index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1])));
    }
    ctx.stroke();
    ctx.restore();
  }
  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point[0], point[1], LEVEL_HANDLE_RADIUS_PX * pixelRatio, 0, 2 * Math.PI);
    ctx.fillStyle = colorFor(steps[index]?.colorKey ?? 'trace', placing.code);
    ctx.fill();
    ctx.strokeStyle = STAGE_BG_COLOR;
    ctx.lineWidth = LEVEL_HANDLE_OUTLINE_PX * pixelRatio;
    ctx.stroke();
  });
  if (fit) {
    ctx.beginPath();
    ctx.arc(fit.center[0], fit.center[1], CENTRE_DOT_RADIUS_PX * pixelRatio, 0, 2 * Math.PI);
    ctx.fillStyle = STAGE_SELECTED_COLOR;
    ctx.fill();
  }
}

/**
 * Draws the level editor (`state.levelEditor`) over the film. `opts`: `overlays` and `overlayOpacity` (the toolbar's
 * fill toggle and 0-100 slider), `pixelRatio` (image pixels per CSS pixel), `handle` (the focused handle,
 * `{code, handle}` or null) and `dragGeometry` (`{code, geometry}` or null: one level's geometry for this frame, a
 * drag in progress, in place of the stored one). Every visible level with geometry is drawn except the one being
 * placed; only the selected level has handles.
 */
export function drawLevelEditor(ctx, canvas, editor, opts) {
  const { overlays = true, overlayOpacity = 50, pixelRatio = 1, handle = null, dragGeometry = null } = opts ?? {};
  const fillAlpha = (BASE_OVERLAY_ALPHA / 255) * (Math.max(0, Math.min(100, overlayOpacity)) / 100);
  ctx.save();
  ctx.lineJoin = 'round';
  let selected = null;
  for (const code of LEVEL_CODES) {
    const entry = editor.levels?.[code];
    if (!entry?.visible || editor.placing?.code === code) continue;
    const geometry = dragGeometry?.code === code ? dragGeometry.geometry : entry.geometry;
    if (!geometry) continue;
    if (drawPlacedLevel(ctx, editor, code, geometry, { overlays, fillAlpha, pixelRatio }) && editor.selected === code) {
      selected = { code, geometry };
    }
  }
  // The selected level's handles go above every level, so a later level's fill or outline never covers one.
  if (selected) drawLevelHandles(ctx, selected.code, selected.geometry, handle, pixelRatio);
  if (editor.placing) drawPlacement(ctx, canvas, editor.placing, pixelRatio);
  ctx.restore();
}

export function drawDynamicLayer(ctx, canvas, geometry, opts) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (opts?.editor) {
    // (2026-10-10, level editor) The editor draws every level itself, so the region outlines, the S1 line, the C7
    // cross, the femoral circles and the old handles are skipped. The selected measurement's construction stays
    // (under the editor), and a film with no geometry (a failed run) still has an editor to draw.
    if (geometry) drawSelectedMeasurement(ctx, canvas, geometry, opts.selectedLevel ?? null, opts.measurements);
    drawLevelEditor(ctx, canvas, opts.editor, {
      overlays: opts.overlays ?? true,
      overlayOpacity: opts.overlayOpacity ?? 50,
      pixelRatio: opts.pixelRatio ?? 1,
      handle: opts.handle ?? null,
      dragGeometry: opts.dragGeometry ?? null,
    });
    return;
  }
  if (!geometry) return;
  const selectedLevel = opts.selectedLevel ?? null;
  const lineWidth = Math.max(2, canvas.width / 600);
  ctx.lineJoin = 'round';
  for (const level of geometry.region === 'cervical' ? CERVICAL_LEVELS : geometry.region === 'full_spine' ? [...CERVICAL_LEVELS, ...LEVELS] : LEVELS) {
    const body = geometry.vertebrae?.[level];
    if (!body) continue;
    const selected = level === selectedLevel;
    ctx.strokeStyle = selected ? STAGE_SELECTED_COLOR
      : LEVEL_RGB[level] ? `rgb(${LEVEL_RGB[level].join(',')})` : STAGE_LINE_COLOR;
    ctx.lineWidth = selected ? lineWidth * 1.6 : lineWidth;
    ctx.beginPath();
    const outline = body.quadrilateral ?? body.inferior;
    if (!outline) continue;
    outline.forEach((point, index) => (index ? ctx.lineTo(...point) : ctx.moveTo(...point)));
    if (body.quadrilateral) ctx.closePath();
    ctx.stroke();
    drawSelectedStageLabel(ctx, level, outline[0], selected, canvas.width);
  }
  const selectedS1 = selectedLevel === 'S1';
  ctx.strokeStyle = selectedS1 ? STAGE_SELECTED_COLOR : STAGE_LINE_COLOR;
  ctx.lineWidth = selectedS1 ? lineWidth * 1.6 : lineWidth;
  if (geometry.s1_superior) {
    ctx.beginPath();
    ctx.moveTo(...geometry.s1_superior[0]);
    ctx.lineTo(...geometry.s1_superior[1]);
    ctx.stroke();
    drawSelectedStageLabel(ctx, 'S1', geometry.s1_superior[0], selectedS1, canvas.width);
  }
  if (geometry.region === 'full_spine' && geometry.c7_centroid) {
    const [x, y] = geometry.c7_centroid;
    const arm = Math.max(4, canvas.width / 150);
    ctx.strokeStyle = `rgb(${LEVEL_RGB.C7.join(',')})`;
    ctx.beginPath(); ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm); ctx.stroke();
    drawSelectedStageLabel(ctx, 'C7', geometry.c7_centroid, selectedLevel === 'GLOBAL_SVA', canvas.width);
  }

  const pixelRatio = opts.pixelRatio ?? 1;
  (geometry.femoral_circles ?? []).forEach(([x, y, r], index) => {
    const selectedCircle = Boolean(opts.editing) && opts.selection?.kind === 'femoral'
      && opts.selection.side === FEMORAL_SIDES[index];
    ctx.strokeStyle = selectedCircle ? STAGE_SELECTED_COLOR : FEMORAL_HANDLE_COLOR;
    ctx.lineWidth = selectedCircle ? lineWidth * 1.6 : lineWidth;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.stroke();
    if (!opts.editing) {
      const arm = 4 * pixelRatio;
      ctx.beginPath();
      ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y);
      ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm);
      ctx.stroke();
    }
  });
  if (geometry.femoral_circles?.length === 2 && geometry.hip_midpoint) {
    const [a, b] = geometry.femoral_circles;
    const [x, y] = geometry.hip_midpoint;
    ctx.save();
    ctx.strokeStyle = FEMORAL_HANDLE_COLOR;
    ctx.lineWidth = 1.5 * pixelRatio;
    ctx.setLineDash([4 * pixelRatio, 3 * pixelRatio]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.setLineDash([]);
    // A diamond distinguishes the bilateral midpoint from each circle's centre handle.
    const arm = 5 * pixelRatio;
    ctx.beginPath(); ctx.moveTo(x, y - arm); ctx.lineTo(x + arm, y);
    ctx.lineTo(x, y + arm); ctx.lineTo(x - arm, y); ctx.closePath();
    ctx.fillStyle = STAGE_BG_COLOR; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawSelectedMeasurement(ctx, canvas, geometry, selectedLevel, opts.measurements);

  // Handles exist only in edit mode -- outside it the stage is exactly plan 03's
  // user-verified rendering -- and are drawn LAST so they sit above the construction lines.
  if (!opts.editing) return;
  drawHandles(ctx, canvas, geometry, { selection: opts.selection ?? null, hover: opts.hover ?? null, pixelRatio });
  if (opts.retracing) drawTracePoints(ctx, opts.tracePoints ?? [], pixelRatio);
}
