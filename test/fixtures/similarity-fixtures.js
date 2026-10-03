// Shared fixtures for test/similarity-blocks.test.js and test/similarity.test.js. A helper module, not a
// test file: importing a *.test.js file from another re-registers its tests.

// Five lumbar bodies 100 px apart, anterior on the right, S1 under them, the hip below and in front.
export function lumbarGeometry({ dx = 0, dy = 0, scale = 1, levels = ['L1', 'L2', 'L3', 'L4', 'L5'], hip = true, s1 = true, unoriented = [] } = {}) {
  const px = (x, y) => [x * scale + dx, y * scale + dy];
  const vertebrae = {};
  levels.forEach((level) => {
    const i = ['L1', 'L2', 'L3', 'L4', 'L5'].indexOf(level);
    const top = 100 + i * 100;
    vertebrae[level] = {
      superior: [px(160, top), px(100, top)], inferior: [px(160, top + 80), px(100, top + 80)],
      quadrilateral: [px(160, top), px(100, top), px(100, top + 80), px(160, top + 80)],
      ...(unoriented.includes(level) ? { anterior_confirmed: false } : {}),
    };
  });
  return { vertebrae, s1_superior: s1 ? [px(170, 610), px(110, 620)] : null, l1_center: px(130, 140),
    hip_midpoint: hip ? px(260, 760) : null, femoral_circles: [], image_width: 1000, image_height: 1000 };
}

// C2 (inferior only) over C3-C7, 60 px apart, anterior on the LEFT of the image (anterior_side 'left').
export function cervicalGeometry({ dx = 0, dy = 0, scale = 1, side = 'left', levels = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'] } = {}) {
  const px = (x, y) => [x * scale + dx, y * scale + dy];
  const vertebrae = {};
  levels.forEach((level) => {
    const i = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'].indexOf(level);
    const top = 50 + i * 60;
    vertebrae[level] = level === 'C2'
      ? { superior: null, inferior: [px(40, top + 40), px(80, top + 40)], quadrilateral: null }
      : { superior: [px(40, top), px(80, top)], inferior: [px(40, top + 40), px(80, top + 40)],
        quadrilateral: [px(40, top), px(80, top), px(80, top + 40), px(40, top + 40)] };
  });
  return { region: 'cervical', vertebrae, anterior_side: side, c2_centroid: px(60, 70), image_width: 1000, image_height: 1000 };
}

// normalizeCalibration (calibration.js) needs a 64-hex source_sha256, a status it knows (a calibrated one: detected,
// dicom or corrected) and, for 'dicom', the spacing source 'dicom_pixel_spacing'; without them every millimetre reads null.
export const CALIBRATION = { version: 1, source_sha256: 'a'.repeat(64), width: 1000, height: 1000, coordinate_space: 'original_image',
  status: 'dicom', spacing: { row_mm: 0.5, column_mm: 0.5, source: 'dicom_pixel_spacing' }, candidates: [], selected_index: null };

export function study(id, overrides = {}) {
  return {
    id, source: 'real', filePath: `C:\\films\\${id}.png`, fileName: `${id}.png`, name: null, workspaceFolder: 'C:\\films',
    subjectId: null, timepoint: null, filmDate: null, reviewedAt: null, addedAt: '2026-09-30T00:00:00.000Z',
    view: 'Standing lateral', thumbnail: null, region: 'lumbar', anteriorSide: null,
    measurements: { PI: 50, PT: 12, SS: 38, L1PA: 8, LL: { 'L1-S1': 49 } },
    geometry: lumbarGeometry(), qc: { coverage: { partial: false, unoriented: [] } }, clinical: {}, calibration: null, ...overrides,
  };
}
