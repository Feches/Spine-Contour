import { normaliseView } from './timepoints.js';

// A stored position label maps to the backend's lateral-only model. Free text
// is allowed in study metadata, but is never silently relabelled for inference.
export function inferenceView(view) {
  if (typeof view !== 'string') return null;
  const label = view.trim().toLowerCase().replace(/[-_\s]+/g, ' ');
  if (normaliseView(label) || ['lateral', 'lumbar lateral', 'lateral lumbar'].includes(label)) return 'lateral';
  return null;
}

export function unsupportedViewReason(view) {
  return `Unsupported view "${String(view ?? '').trim() || 'unspecified'}". Choose a lateral view before segmentation.`;
}
