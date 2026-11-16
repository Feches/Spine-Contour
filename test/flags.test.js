import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAGS_MAX, cleanFlag, cleanFlags, splitTyped, sameFlag, sameFlagList, addFlag, removeFlag, flagsInUse,
  librarySpelling, mergeFlags, flagChoices, bulkState, bulkChange, flagsText,
  startFlagEdit, flagEditText, flagEditAdd, flagEditRemove, flagEditActive, flagEditResult,
} from '../renderer/data/flags.js';

test('cleanFlag trims, collapses spaces, drops a leading # and refuses what is not a flag', () => {
  assert.equal(cleanFlag('  poor   segmentation '), 'poor segmentation');
  assert.equal(cleanFlag('#hardware'), 'hardware');
  assert.equal(cleanFlag('## OLIF outcomes'), 'OLIF outcomes');
  assert.equal(cleanFlag('C#7'), 'C#7');
  assert.equal(cleanFlag('a'.repeat(40)), 'a'.repeat(40));
  for (const bad of ['', '   ', '#', 'a,b', 'a;b', 'a\nb', 'a'.repeat(41), null, 7, undefined]) assert.equal(cleanFlag(bad), null);
});

test('cleanFlags cleans a stored list, drops matches and junk, stops at 20, and never throws', () => {
  assert.deepEqual(cleanFlags([' hardware ', 'Hardware', '#cement', '', 7, 'a,b']), ['hardware', 'cement']);
  for (const junk of [undefined, null, 'hardware', 5, {}]) assert.deepEqual(cleanFlags(junk), []);
  assert.equal(cleanFlags(Array.from({ length: 25 }, (_, i) => `f${i}`)).length, FLAGS_MAX);
});

test('splitTyped reads a pasted list', () => {
  assert.deepEqual(splitTyped('#hardware, cement;  poor   segmentation\nhardware'), ['hardware', 'cement', 'poor segmentation']);
  assert.deepEqual(splitTyped(` # , ${'x'.repeat(41)}`), []);
});

test('addFlag and removeFlag return new lists and respect matches and the cap', () => {
  const flags = Object.freeze(['OLIF outcomes', 'hardware']);
  assert.deepEqual(addFlag(flags, 'cement'), ['OLIF outcomes', 'hardware', 'cement']);
  assert.deepEqual(addFlag(flags, 'HARDWARE'), ['OLIF outcomes', 'hardware']);
  assert.notEqual(addFlag(flags, 'HARDWARE'), flags);
  assert.deepEqual(removeFlag(flags, 'Hardware'), ['OLIF outcomes']);
  const full = Array.from({ length: 20 }, (_, i) => `f${i}`);
  assert.deepEqual(addFlag(full, 'one more'), full);
  assert.deepEqual(addFlag(undefined, 'cement'), ['cement']);
  assert.equal(sameFlag('Hardware', 'hardware'), true);
  assert.equal(sameFlagList(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameFlagList(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameFlagList(undefined, []), true);
});

test('flagsInUse gives one spelling per flag, the most used, A to Z ignoring case', () => {
  const studies = [{ flags: ['hardware', 'cement'] }, { flags: ['Hardware'] }, { flags: ['hardware'] }, { flags: ['Zeta', 'alpha'] }, {}];
  assert.deepEqual(flagsInUse(studies), ['alpha', 'cement', 'hardware', 'Zeta']);
  assert.deepEqual(flagsInUse([{ flags: ['Cement'] }, { flags: ['cement'] }]), ['Cement'], 'a tie keeps the first met');
  assert.equal(librarySpelling('HARDWARE', ['cement', 'hardware']), 'hardware');
  assert.equal(librarySpelling('new one', ['cement']), 'new one');
});

test('mergeFlags keeps the local order and spelling and appends what is new', () => {
  assert.deepEqual(mergeFlags(['Hardware', 'OLIF outcomes'], ['cement', 'hardware']), ['Hardware', 'OLIF outcomes', 'cement']);
  assert.deepEqual(mergeFlags(undefined, ['cement']), ['cement']);
  assert.deepEqual(mergeFlags(['cement'], undefined), ['cement']);
});

test('flagChoices offers the flags in use that fit, then Create', () => {
  const inUse = ['cement', 'hardware', 'OLIF outcomes'];
  assert.deepEqual(flagChoices({ inUse, draft: ['hardware'], text: '' }),
    [{ kind: 'use', flag: 'cement' }, { kind: 'use', flag: 'OLIF outcomes' }]);
  assert.deepEqual(flagChoices({ inUse, draft: [], text: 'ce' }), [{ kind: 'use', flag: 'cement' }, { kind: 'create', flag: 'ce' }]);
  assert.deepEqual(flagChoices({ inUse, draft: [], text: 'CEMENT' }), [{ kind: 'use', flag: 'cement' }]);
  assert.deepEqual(flagChoices({ inUse, draft: ['cement'], text: 'cement' }), []);
  assert.deepEqual(flagChoices({ inUse, draft: [], text: 'x'.repeat(41) }), []);
});

test('bulkState and bulkChange act on the given real films only', () => {
  const studies = [
    { id: 'A', source: 'real', flags: ['OLIF outcomes', 'hardware'] },
    { id: 'B', source: 'real', flags: ['OLIF outcomes'] },
    { id: 'C', source: 'real' },
    { id: 'D', source: 'demo', flags: [] },
    { id: 'E', source: 'real', flags: Array.from({ length: 20 }, (_, i) => `f${i}`) },
  ];
  assert.equal(bulkState(studies, ['A', 'B'], 'olif outcomes'), 'all');
  assert.equal(bulkState(studies, ['A', 'B', 'C'], 'hardware'), 'some');
  assert.equal(bulkState(studies, ['B', 'C'], 'hardware'), 'none');
  assert.equal(bulkState(studies, [], 'hardware'), 'none');
  assert.deepEqual(bulkChange(studies, ['A', 'B', 'C', 'D', 'E', 'gone'], 'hardware', true),
    { changes: [{ id: 'B', flags: ['OLIF outcomes', 'hardware'] }, { id: 'C', flags: ['hardware'] }], full: 1 });
  assert.deepEqual(bulkChange(studies, ['A', 'B', 'C'], 'HARDWARE', false), { changes: [{ id: 'A', flags: ['OLIF outcomes'] }], full: 0 });
});

test('flagsText joins a film\'s flags and reads a missing list as empty', () => {
  assert.equal(flagsText(['a', 'b'], '; '), 'a; b');
  assert.equal(flagsText(undefined, '; '), '');
});

test("the flag editor's draft transitions are pure and carry extra keys", () => {
  assert.deepEqual(startFlagEdit([' hardware ', 'Hardware']), { draft: ['hardware'], text: '', active: -1 });
  assert.deepEqual(startFlagEdit(undefined), { draft: [], text: '', active: -1 });
  const edit = Object.freeze({ id: 'SP-9001', draft: Object.freeze(['OLIF outcomes']), text: 'har', active: 1 });
  assert.deepEqual(flagEditText(edit, 'ce'), { id: 'SP-9001', draft: ['OLIF outcomes'], text: 'ce', active: 0 });
  assert.equal(flagEditText(edit, '  ').active, -1);
  assert.deepEqual(flagEditAdd(edit, ['HARDWARE', 'cement', 'olif OUTCOMES'], ['cement', 'hardware']),
    { id: 'SP-9001', draft: ['OLIF outcomes', 'hardware', 'cement'], text: '', active: -1 });
  assert.deepEqual(flagEditRemove(edit, 0), { id: 'SP-9001', draft: [], text: 'har', active: 1 });
  assert.deepEqual(flagEditRemove(edit, 3).draft, ['OLIF outcomes']);
  assert.equal(flagEditActive(edit, 5, 2).active, 1);
  assert.equal(flagEditActive(edit, -3, 2).active, -1);
  assert.equal(flagEditActive(edit, 1, 0).active, -1);
  assert.deepEqual(flagEditResult({ draft: ['a'], text: ' Cement, b ', active: 0 }, ['cement']), ['a', 'cement', 'b']);
  assert.deepEqual(flagEditResult(edit, []), ['OLIF outcomes', 'har']);
});
