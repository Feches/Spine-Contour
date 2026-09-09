import { getState, setState } from './store.js';
import { loadPerformance, savePerformance, cancelPredict, onPredictionProgress } from './api.js';
import { validPerformance, progressUpdate } from './data/processing.js';
import { showToast } from './components/toast.js';

export async function initializeProcessing() {
  onPredictionProgress((event) => {
    const state = getState();
    if (!state.running) return;
    const next = progressUpdate(state.runStage, event);
    if (next !== state.runStage) setState({ runStage: next });
  });
  try {
    const performance = await loadPerformance();
    if (validPerformance(performance)) setState({ performance });
  } catch (error) { console.warn('Could not load processing settings:', error.message); }
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
