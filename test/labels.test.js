import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultName, studyName, workspaceLabel, folderLabel, pathTitle } from '../renderer/data/labels.js';

const DASH = '\u2014';

test('defaultName strips the extension and the directory', () => {
  assert.equal(defaultName('pre01.jpg'), 'pre01');
  assert.equal(defaultName('C:\\Studies\\CohortA\\pre01.jpg'), 'pre01');
  assert.equal(defaultName('/home/cody/films/pre01.dcm'), 'pre01');
  assert.equal(defaultName('scan.anon.dcm'), 'scan.anon');
  assert.equal(defaultName('noext'), 'noext');
  assert.equal(defaultName('.hidden'), '.hidden'); // a leading dot is not an extension
});

test('defaultName is null when there is no usable name, so the id keeps naming the study', () => {
  assert.equal(defaultName(''), null);
  assert.equal(defaultName(undefined), null);
  assert.equal(defaultName(null), null);
});

test('studyName prefers the stored name', () => {
  assert.equal(studyName({ id: 'SP-1001', name: 'pre01', fileName: 'other.jpg' }), 'pre01');
});

test('studyName derives from the filename when nothing is stored, so old records need no migration', () => {
  assert.equal(studyName({ id: 'SP-1001', fileName: 'pre01.jpg' }), 'pre01');
  assert.equal(studyName({ id: 'SP-1001', name: null, fileName: 'pre01.jpg' }), 'pre01');
  assert.equal(studyName({ id: 'SP-1001', name: '   ', fileName: 'pre01.jpg' }), 'pre01'); // blank is not a name
});

test('studyName falls back to the id only when there is no filename either', () => {
  assert.equal(studyName({ id: 'SP-1001' }), 'SP-1001');
  assert.equal(studyName({ id: 'SP-1001', fileName: null }), 'SP-1001');
  assert.equal(studyName({ id: 'SP-1001', fileName: '' }), 'SP-1001');
  assert.equal(studyName(null), DASH);
});

test('workspaceLabel is the last segment of the stored workspace root', () => {
  assert.equal(workspaceLabel({ workspaceFolder: 'C:\\Studies\\CohortA' }), 'CohortA');
  assert.equal(workspaceLabel({ workspaceFolder: 'C:\\Studies\\CohortA\\' }), 'CohortA');
  assert.equal(workspaceLabel({ workspaceFolder: '/home/cody/CohortB' }), 'CohortB');
});

test('workspaceLabel is an em dash for a study that did not come from a workspace', () => {
  assert.equal(workspaceLabel({ workspaceFolder: null }), DASH);
  assert.equal(workspaceLabel({}), DASH); // picker, drop, and every pre-existing record
  assert.equal(workspaceLabel(null), DASH);
});

test('folderLabel is the folder the film sits in, on either separator', () => {
  assert.equal(folderLabel({ filePath: 'C:\\Studies\\CohortA\\pre01.jpg' }), 'CohortA');
  assert.equal(folderLabel({ filePath: 'C:\\Studies\\CohortA\\pre-op\\x2.jpg' }), 'pre-op');
  assert.equal(folderLabel({ filePath: '/home/cody/Downloads/scan.jpg' }), 'Downloads');
});

test('folderLabel is an em dash when there is no path to derive one from', () => {
  assert.equal(folderLabel({ filePath: null }), DASH); // every demo study
  assert.equal(folderLabel({ filePath: '' }), DASH);
  assert.equal(folderLabel({}), DASH);
  assert.equal(folderLabel({ filePath: 'bare.jpg' }), DASH); // a name with no directory part
});

test('the two cells together separate same-named films in different workspaces', () => {
  const a = { workspaceFolder: 'C:\\Studies\\CohortA', filePath: 'C:\\Studies\\CohortA\\pre-op\\scan.jpg' };
  const b = { workspaceFolder: 'C:\\Studies\\CohortB', filePath: 'C:\\Studies\\CohortB\\pre-op\\scan.jpg' };
  assert.equal(folderLabel(a), folderLabel(b)); // the subfolder alone is ambiguous
  assert.notEqual(workspaceLabel(a), workspaceLabel(b)); // the pair is not
});

test('pathTitle carries the full path, or nothing', () => {
  assert.equal(pathTitle({ filePath: 'C:\\a\\b.jpg' }), 'C:\\a\\b.jpg');
  assert.equal(pathTitle({ filePath: null }), null);
  assert.equal(pathTitle(null), null);
});
