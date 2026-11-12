/**
 * Setting the region of several studies at once from the Find tab: the bulk form of the Analysis screen's Region
 * select (screens/analysis.js changeRegion). No DOM. A study whose region changes loses its result exactly as the
 * single-film change clears it, so it reads as unsegmented and the bar's Segment button runs it again with the new
 * region. Studies already set to that region are left alone, results included.
 */
export const REGION_CHOICES = Object.freeze([
  ['auto', 'Auto detect'], ['lumbar', 'Lumbar'], ['cervical', 'Cervical'], ['full_spine', 'Full spine'],
]);
const REGIONS = REGION_CHOICES.map(([value]) => value);

// The fields the single-film change resets (changeRegion), plus the anterior side, which belongs to the old region.
const CLEARED = Object.freeze({
  anteriorSide: null, geometry: null, measurements: null, qc: null, reviewedAt: null, predictionId: null,
  processingError: null, processingErrorAt: null,
});

const requested = (study) => (REGIONS.includes(study?.region) ? study.region : 'auto');
const hasResult = (study) => Boolean(study?.geometry || study?.measurements || study?.predictionId);

// `targets` are the ticked visible real studies. Returns the ids that change and how many results that clears.
export function planRegionChange(targets, region) {
  if (!REGIONS.includes(region)) return { ids: [], unchanged: 0, cleared: 0 };
  const changing = (targets ?? []).filter((study) => study?.source === 'real' && requested(study) !== region);
  return {
    ids: changing.map((study) => study.id),
    unchanged: (targets ?? []).length - changing.length,
    cleared: changing.filter(hasResult).length,
  };
}

// A new studies array; untouched records keep their identity.
export function applyRegionChange(studies, ids, region) {
  if (!REGIONS.includes(region)) return studies;
  const set = new Set(ids);
  return studies.map((study) => (set.has(study.id) ? { ...study, ...CLEARED, region } : study));
}

export function regionChangePrompt(plan, region) {
  const label = REGION_CHOICES.find(([value]) => value === region)?.[1] ?? region;
  const n = plan.ids.length;
  const results = plan.cleared === 0 ? ''
    : ` ${plan.cleared === n ? (n === 1 ? 'Its' : 'Their') : `${plan.cleared} of their`} saved ${plan.cleared === 1 ? 'result' : 'results'} will be cleared; segment ${n === 1 ? 'it' : 'them'} again.`;
  return `Set ${n} ${n === 1 ? 'study' : 'studies'} to ${label}?${results}`;
}

export function regionChangeToast(plan, region) {
  const label = REGION_CHOICES.find(([value]) => value === region)?.[1] ?? region;
  const n = plan.ids.length;
  const skipped = plan.unchanged ? ` ${plan.unchanged} already ${plan.unchanged === 1 ? 'was' : 'were'} ${label}.` : '';
  return `Set ${n} ${n === 1 ? 'study' : 'studies'} to ${label}.${skipped}`;
}
