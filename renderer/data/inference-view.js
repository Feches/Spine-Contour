import { normaliseView } from './timepoints.js';

// A stored position label maps to the backend's lateral-only model. Free text
// is allowed in study metadata, but is never silently relabelled for inference.
// (2026-10-19) A film whose view is Unknown -- none stored, blank, or the word itself -- passes the
// gate: the backend classifies the film during the run (spec 5.2), so only a view a person set to
// something explicitly non-lateral (AP, oblique, a combination) is refused before it.
export function inferenceView(view) {
  if (typeof view !== 'string') return 'lateral';
  const label = view.trim().toLowerCase().replace(/[-_\s]+/g, ' ');
  if (label === '' || label === 'unknown') return 'lateral';
  if (normaliseView(label) || ['lateral', 'lumbar lateral', 'lateral lumbar', 'cervical lateral', 'lateral cervical', 'full spine lateral', 'lateral full spine'].includes(label)) return 'lateral';
  return null;
}

export function unsupportedViewReason(view) {
  return `Unsupported view "${String(view ?? '').trim() || 'unspecified'}". Choose a lateral view before segmentation.`;
}
