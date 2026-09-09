// Inspect the actual installer payload, not just the builder's file allowlist.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const asar = require('@electron/asar'); // Existing electron-builder development dependency.

function files(root, depth = 0) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(root, entry.name);
    if (entry.isFile()) return [name];
    if (entry.isDirectory() && depth < 6 && entry.name !== 'backend-runtime') return files(name, depth + 1);
    return [];
  });
}
const archives = files(process.argv[2] || 'dist').filter(file => path.basename(file) === 'app.asar');
assert.equal(archives.length, 1, 'Expected one packaged desktop app');
const archive = archives[0];
const source = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString());
assert.equal(packaged.version, source.version, 'Packaged version differs from source');
assert.equal(packaged.buildChannel, 'preview');
assert.equal(packaged.productName, 'Spine-Contour Preview');
const shipped = ['index.html', 'main.js', 'preload.js', 'store-io.js', 'scan-folder.js',
  ...files('renderer'), ...files('styles')];
for (const file of shipped) {
  // asar traverses directories using path.sep, including on Windows.
  assert.ok(asar.extractFile(archive, path.normalize(file)).equals(fs.readFileSync(file)),
    `Missing or stale packaged source: ${file}`);
}
const executable = process.platform === 'win32' ? 'spine-contour-backend.exe' : 'spine-contour-backend';
assert.ok(fs.existsSync(path.join(path.dirname(archive), 'backend-runtime', executable)), 'Backend runtime missing');
console.log(`Verified preview v${packaged.version}: ${shipped.length} source files match, backend present.`);
