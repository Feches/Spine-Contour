// Manual references are original-image data, independent of study creation or filenames.
const { readFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { writeJsonAtomic } = require('./store-io.js');
const calibrationModule = import('./renderer/data/calibration.js');

function createCalibrationStore(directory) {
  let writes = Promise.resolve();
  const file = digest => path.join(directory, `${digest}.json`);

  async function read(digest) {
    let raw;
    try { raw = await readFile(file(digest), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { /* Refuse to erase a damaged manual reference. */ }
    const { normalizeCalibration } = await calibrationModule;
    const reference = normalizeCalibration(parsed);
    if (!reference || reference.source_sha256 !== digest || !['corrected', 'cleared'].includes(reference.status)) {
      throw new Error('The saved reference for this image could not be read. It has been left unchanged.');
    }
    return reference;
  }

  function save(value) {
    // Queue before the first await so an immediately following prediction waits for this save.
    const snapshot = structuredClone(value);
    const task = writes.catch(() => {}).then(async () => {
      const { normalizeCalibration } = await calibrationModule;
      const reference = normalizeCalibration(snapshot);
      if (!reference || !['corrected', 'cleared'].includes(reference.status)) throw new Error('Invalid image reference.');
      const prior = await read(reference.source_sha256);
      reference.review_revision = (prior?.review_revision ?? 0) + 1;
      await writeJsonAtomic(file(reference.source_sha256), reference);
      return reference;
    });
    writes = task;
    return task;
  }

  async function forImage(bytes) {
    await writes.catch(() => {});
    return read(createHash('sha256').update(bytes).digest('hex'));
  }
  return { save, forImage };
}

module.exports = { createCalibrationStore };
