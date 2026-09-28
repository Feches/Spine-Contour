import { getState, setState } from './store.js';
import { loadPerformance, savePerformance, listProcessors, cancelPredict, onPredictionProgress } from './api.js';
import { validPerformance, progressUpdate } from './data/processing.js';
import { showToast } from './components/toast.js';

export async function initializeProcessing() {
  onPredictionProgress((event) => {
    const state = getState();
    if (!state.running) return;
    const next = progressUpdate(state.runStage, event);
    if (next !== state.runStage) setState({ runStage: next });
    if (next !== state.runStage && event.type === 'progress' && event.stage === 'processor') showToast(event.message);
  });
  try {
    const performance = await loadPerformance();
    if (validPerformance(performance)) setState({ performance });
  } catch (error) { console.warn('Could not load processing settings:', error.message); }
  // Not awaited: the first listing starts ONNX Runtime's device discovery, and boot need not wait.
  refreshProcessors();
}

export async function refreshProcessors() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { setState({ processors: await listProcessors() }); return; }
    catch (error) {
      if (attempt === 2) showToast(`Could not list GPUs: ${error.message}. Reopen Settings to retry.`);
      else await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

export async function changePerformance(patch) {
  const state = getState();
  if (state.running || state.batch) return;
  const performance = { ...state.performance, ...patch };
  if (!validPerformance(performance)) return;
  setState({ performance });
  try { await savePerformance(performance); }
  catch (error) { showToast(`Processing settings apply this session but could not be saved: ${error.message}`); }
}

export async function cancelProcessing() {
  const state = getState();
  if (!state.running || !state.runStage || state.runStage.cancelling || state.runStage.stage === 'saving') return;
  const { requestId } = state.runStage;
  setState({ runStage: { ...state.runStage, cancelling: true },
    ...(state.batch ? { batch: { ...state.batch, stopping: true } } : {}) });
  try { await cancelPredict(requestId); }
  catch (error) { showToast(`Could not cancel processing: ${error.message}`); }
}
