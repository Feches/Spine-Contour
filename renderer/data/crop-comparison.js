// Final accepted windows are in original-image pixels. A model run may use search
// for either region after landmark QC, so report the actual method per region.
export function comparisonRegions(qc, imageWidth = null) {
  const framing = qc?.framing ?? {};
  return [
    { name: 'Cervical', window: framing.cervical_window, method: framing.cervical?.method_used },
    { name: 'Lumbar', window: framing.lumbar_window, method: framing.lumbar?.method_used },
  ].map((region) => {
    const window = validWindow(region.window) ? region.window : null;
    const proposed = region.name === 'Cervical' ? framing.cervical?.model_proposals?.[0]
      : framing.lumbar?.model_proposals?.[0] ?? framing.lumbar?.model_proposal;
    const candidateWindow = validWindow(proposed) && (!framing.canonical_mirror || Number.isFinite(imageWidth))
      ? framing.canonical_mirror
        ? [imageWidth - proposed[2], proposed[1], imageWidth - proposed[0], proposed[3]] : proposed
      : null;
    const searchWindow = region.name === 'Lumbar' && validWindow(framing.lumbar?.localizer?.window)
      ? framing.lumbar.localizer.window : null;
    return { ...region, window, candidateWindow: candidateWindow ?? (!window ? searchWindow : null),
      methodLabel: !window ? 'No accepted crop'
      : region.method === 'model' ? 'Trained model'
      : region.method === 'search_fallback' ? 'Crop search fallback'
      : region.method === 'search' ? 'Crop search' : 'Unknown method' };
  });
}

export function validWindow(window) {
  return Array.isArray(window) && window.length === 4 && window.every(Number.isFinite)
    && window[0] >= 0 && window[1] >= 0 && window[2] > window[0] && window[3] > window[1];
}
