import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRE_OP, INTRA_OP, POST_OP, DEFAULT_VIEW, TIMEPOINT_SUGGESTIONS, VIEW_SUGGESTIONS, FILM_DATE,
  normaliseTimepoint, normaliseView, timepointRank, compareTimepoints, parseFilmDate,
} from '../renderer/data/timepoints.js';

test('the three fixed labels and the default view are the spec\'s strings', () => {
  assert.equal(PRE_OP, 'Pre-op');
  assert.equal(INTRA_OP, 'Intra-op');
  assert.equal(POST_OP, 'Post-op');
  assert.equal(DEFAULT_VIEW, 'Standing lateral');
  assert.deepEqual([...TIMEPOINT_SUGGESTIONS], ['Pre-op', 'Intra-op', 'Post-op', '6 wk', '1 yr', '2 yr']);
  assert.deepEqual([...VIEW_SUGGESTIONS], ['Standing lateral', 'Supine lateral', 'Prone lateral', 'Flexion lateral', 'Extension lateral']);
});

test('normaliseTimepoint maps every §7.2 token to its label, whatever the case or separator', () => {
  for (const token of ['pre-op', 'preop', 'pre-operative', 'preoperative', 'pre', 'PRE-OP', 'Pre_Op', 'pre op', 'PreOperative']) {
    assert.equal(normaliseTimepoint(token), 'Pre-op', token);
  }
  for (const token of ['intra-op', 'intraop', 'intra-operative', 'intraoperative', 'INTRA_OP']) {
    assert.equal(normaliseTimepoint(token), 'Intra-op', token);
  }
  for (const token of ['post-op', 'postop', 'post-operative', 'postoperative', 'post', 'Post-Op']) {
    assert.equal(normaliseTimepoint(token), 'Post-op', token);
  }
});

test('normaliseTimepoint reads durations as N wk, N mo or N yr', () => {
  assert.equal(normaliseTimepoint('6wk'), '6 wk');
  assert.equal(normaliseTimepoint('6 weeks'), '6 wk');
  assert.equal(normaliseTimepoint('6-wk'), '6 wk');
  assert.equal(normaliseTimepoint('6_week'), '6 wk');
  assert.equal(normaliseTimepoint('12w'), '12 wk');
  assert.equal(normaliseTimepoint('3mo'), '3 mo');
  assert.equal(normaliseTimepoint('3 months'), '3 mo');
  assert.equal(normaliseTimepoint('12m'), '12 mo');
  assert.equal(normaliseTimepoint('1yr'), '1 yr');
  assert.equal(normaliseTimepoint('2 years'), '2 yr');
  assert.equal(normaliseTimepoint('5Y'), '5 yr');
});

test('normaliseTimepoint maps a canonical label to itself and anything else to null', () => {
  for (const label of ['Pre-op', 'Intra-op', 'Post-op', '6 wk', '3 mo', '1 yr']) assert.equal(normaliseTimepoint(label), label);
  // Whole-token matching only: a folder or stem that merely contains a token does not match.
  for (const text of ['Preoperative planning', 'Postgraduate', 'S001', 'baseline', 'wk', '6', '', '   ', null, undefined]) {
    assert.equal(normaliseTimepoint(text), null, String(text));
  }
});

test('normaliseView maps the §7.3 tokens and labels, and nothing else', () => {
  assert.equal(normaliseView('standing'), 'Standing lateral');
  assert.equal(normaliseView('UPRIGHT'), 'Standing lateral');
  assert.equal(normaliseView('erect'), 'Standing lateral');
  assert.equal(normaliseView('supine'), 'Supine lateral');
  assert.equal(normaliseView('Prone'), 'Prone lateral');
  assert.equal(normaliseView('flexion'), 'Flexion lateral');
  assert.equal(normaliseView('FLEX'), 'Flexion lateral');
  assert.equal(normaliseView('extension'), 'Extension lateral');
  assert.equal(normaliseView('ext'), 'Extension lateral');
  assert.equal(normaliseView('Standing lateral'), 'Standing lateral');
  assert.equal(normaliseView('Flexion-lateral'), 'Flexion lateral');
  for (const text of ['lateral', 'S001', 'pre-op', 'extended', '', null]) assert.equal(normaliseView(text), null, String(text));
});

test('compareTimepoints orders fixed labels, then durations by length, then custom labels, then none', () => {
  const order = ['Pre-op', 'Intra-op', 'Post-op', '6 wk', '3 mo', '1 yr', '2 yr', 'baseline', 'Follow-up', null];
  for (let i = 0; i < order.length; i += 1) {
    for (let j = 0; j < order.length; j += 1) {
      const expected = Math.sign(i - j);
      assert.equal(Math.sign(compareTimepoints(order[i], order[j])), expected, `${order[i]} vs ${order[j]}`);
    }
  }
  // 6 wk (42 days) sorts before 3 mo (90 days) and 12 wk (84 days) before 3 mo too.
  assert.ok(compareTimepoints('12 wk', '3 mo') < 0);
  assert.ok(compareTimepoints('12 mo', '1 yr') < 0);
  // Custom labels compare case-insensitively; an empty string is no label.
  assert.equal(compareTimepoints('baseline', 'BASELINE'), 0);
  assert.equal(compareTimepoints('', null), 0);
  assert.deepEqual(timepointRank('Post-op'), { rank: 2, days: 0, text: '' });
  assert.deepEqual(timepointRank('6 wk'), { rank: 3, days: 42, text: '' });
  assert.deepEqual(timepointRank('Baseline'), { rank: 4, days: 0, text: 'baseline' });
  assert.deepEqual(timepointRank(null), { rank: 5, days: 0, text: '' });
});

test('parseFilmDate accepts ISO and US M/D/YYYY and returns the stored form', () => {
  assert.equal(parseFilmDate('2025-03-02'), '2025-03-02');
  assert.equal(parseFilmDate('3/2/2025'), '2025-03-02');
  assert.equal(parseFilmDate('03/02/2025'), '2025-03-02');
  assert.equal(parseFilmDate('12/31/2024'), '2024-12-31');
  assert.equal(parseFilmDate('  2025-03-02  '), '2025-03-02');
  assert.ok(FILM_DATE.test(parseFilmDate('1/1/2025')));
});

test('parseFilmDate rejects impossible dates, other layouts and empty input', () => {
  for (const text of ['2025-02-30', '2025-13-01', '30/02/2025', '2025/03/02', '2-3-2025', 'March 2, 2025', '2025-03-02T10:00:00Z', '20250302', '', '   ', null, undefined]) {
    assert.equal(parseFilmDate(text), null, String(text));
  }
});
