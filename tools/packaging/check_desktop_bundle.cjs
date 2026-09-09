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
const channel = process.argv[3] || 'preview';
assert.ok(['preview', 'release'].includes(channel), 'Unknown build channel');
if (channel === 'preview') {
  assert.equal(packaged.buildChannel, 'preview');
  assert.equal(packaged.productName, 'Spine-Contour Preview');
} else {
  assert.equal(packaged.buildChannel, undefined, 'Production app must not use the preview profile');
  assert.equal(packaged.name, source.name);
}
const productName = channel === 'preview' ? 'Spine-Contour Preview' : source.build.productName;
const appExecutable = process.platform === 'win32'
  ? path.join(path.dirname(archive), '..', `${productName}.exe`)
  : path.join(path.dirname(archive), '..', 'MacOS', productName);
assert.ok(fs.existsSync(appExecutable), 'Desktop executable or product branding differs from source');
const shipped = ['index.html', 'main.js', 'backend-client.cjs', 'preload.js', 'store-io.js', 'scan-folder.js',
  ...files('renderer'), ...files('styles')];
for (const file of shipped) {
  // asar traverses directories using path.sep, including on Windows.
  assert.ok(asar.extractFile(archive, path.normalize(file)).equals(fs.readFileSync(file)),
    `Missing or stale packaged source: ${file}`);
}
const executable = process.platform === 'win32' ? 'spine-contour-backend.exe' : 'spine-contour-backend';
assert.ok(fs.existsSync(path.join(path.dirname(archive), 'backend-runtime', executable)), 'Backend runtime missing');
console.log(`Verified ${channel} v${packaged.version}: ${shipped.length} source files match, backend present.`);
