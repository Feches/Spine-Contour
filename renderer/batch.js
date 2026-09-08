/**
 * Batch segmentation driver (batch spec 8.2): the one wiring of data/batch.js's createBatchDriver
 * to the real store, the toast, the persistence flag and the analysis screen's run core. Module
 * scope, beside router.js, so a batch outlives any screen. screens/studies.js starts and stops it;
 * nothing else imports it. The loop itself is pure and tested in test/batch.test.js.
 */
import { getState, setState } from './store.js';
import { showToast } from './components/toast.js';
import { persistenceDisabledReason } from './api.js';
import { segmentStudy } from './screens/analysis.js';
import { createBatchDriver } from './data/batch.js';

const driver = createBatchDriver({
  segment: (studyId) => segmentStudy(studyId, { batch: true }),
  getState,
  setState,
  showToast,
  persistenceDisabledReason,
});

export const startBatch = driver.startBatch;
export const stopBatch = driver.stopBatch;
