import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoStudiesShown, demoVisibilityPatch } from '../renderer/data/demo-visibility.js';
import { DEMO_STUDIES } from '../renderer/data/demo-studies.js';

const real = [{ id: 'SP-1000', source: 'real' }, { id: 'SP-1001', source: 'real' }];

test('demoStudiesShown reads whether any demo record is in the library', () => {
  assert.equal(demoStudiesShown({ studies: real }), false);
  assert.equal(demoStudiesShown({ studies: [...real, DEMO_STUDIES[0]] }), true);
  assert.equal(demoStudiesShown({}), false);
});

test('hiding removes the demos, prunes their ticks and closes an open or compared demo', () => {
  const state = {
    studies: [...real, ...DEMO_STUDIES], paramSelected: ['SP-1000', DEMO_STUDIES[0].id],
    openId: DEMO_STUDIES[0].id, compareId: DEMO_STUDIES[1].id, screen: 'analysis',
  };
  const patch = demoVisibilityPatch(state, false);
  assert.deepEqual(patch.studies, real);
  assert.deepEqual(patch.paramSelected, ['SP-1000']);
  assert.equal(patch.openId, null);
  assert.equal(patch.screen, 'studies');
  assert.equal(patch.compareId, null);
  assert.equal(patch.editing, false, 'the per-study view state is reset with openId');
  assert.equal(state.studies.length, real.length + DEMO_STUDIES.length, 'the state is not mutated');
});

test('hiding leaves an open real study open', () => {
  const patch = demoVisibilityPatch({ studies: [...real, ...DEMO_STUDIES], paramSelected: [], openId: 'SP-1000', compareId: null, screen: 'analysis' }, false);
  assert.deepEqual(patch.studies, real);
  assert.equal('openId' in patch, false);
  assert.equal('screen' in patch, false);
});

test('showing appends the nine demos after the real studies; the asked-for state is an empty patch', () => {
  const shown = demoVisibilityPatch({ studies: real, paramSelected: [] }, true);
  assert.deepEqual(shown.studies.map((s) => s.id), [...real.map((s) => s.id), ...DEMO_STUDIES.map((s) => s.id)]);
  assert.deepEqual(demoVisibilityPatch({ studies: real, paramSelected: [] }, false), {});
  assert.deepEqual(demoVisibilityPatch({ studies: [...real, ...DEMO_STUDIES], paramSelected: [] }, true), {});
});
