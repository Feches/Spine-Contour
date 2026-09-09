export const DEFAULT_PERFORMANCE = Object.freeze({ mode: 'standard', cpuThreads: 2 });

export function validPerformance(value) {
  return value && ['standard', 'low-memory'].includes(value.mode)
    && Number.isInteger(value.cpuThreads) && value.cpuThreads >= 1 && value.cpuThreads <= 4;
}

export function progressUpdate(current, event) {
  if (!current || current.requestId !== event?.requestId || current.cancelling || current.stage === 'saving') return current;
  if (!['progress', 'heartbeat'].includes(event.type)) return current;
  const elapsed = Number.isFinite(event.elapsed_seconds) && event.elapsed_seconds >= 0
    ? Math.max(current.elapsed_seconds ?? 0, event.elapsed_seconds) : current.elapsed_seconds;
  if (event.type === 'heartbeat') return { ...current, elapsed_seconds: elapsed };
  if (typeof event.message !== 'string' || !event.message.trim()) return current;
  const hasCount = Number.isInteger(event.completed) && Number.isInteger(event.total)
    && event.total > 0 && event.completed >= 0 && event.completed <= event.total;
  return { ...current, stage: event.stage, message: event.message, elapsed_seconds: elapsed,
    completed: hasCount ? event.completed : null, total: hasCount ? event.total : null };
}

export function progressTitle(progress) {
  return progress?.cancelling ? 'Cancelling processing…' : progress?.message || 'Starting image processing…';
}

export function progressDetail(progress) {
  if (!progress) return 'Waiting for the processing worker';
  if (progress.cancelling) return 'Stopping after the current operation. Completed results are kept.';
  const seconds = Math.max(0, Math.floor(progress.elapsed_seconds || 0));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} elapsed`;
  const parts = [];
  if (progress.total > 0) {
    const units = progress.stage === 'search' ? 'regions checked' : 'passes completed';
    parts.push(`${progress.completed} of ${progress.total} ${units}`);
  }
  parts.push(elapsed);
  if (progress.mode === 'low-memory') parts.push('Low memory');
  return parts.join(' · ');
}
