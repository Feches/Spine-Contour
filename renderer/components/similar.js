/**
 * The Find similar tab (similar-cases spec, 2026-09-12, section 8). Mounted by screens/analysis.js
 * into its `.analysis-similar` host and driven from that screen's update() on every store
 * notification, like the measurements panel; a reference-keyed gate decides whether to rebuild.
 * The ranking is data/similarity.js's, the outcomes data/outcomes.js's; the embeddings come from
 * renderer/embeddings.js, loaded the first time the tab is shown (its load bumps
 * state.embeddingsVersion, which is in the key, so the cards fill in when it lands).
 * Every control carries a data-similar-key; the smoke suite keys on those, never on a label.
 */
import { el, clear } from '../dom.js';
import { getState, setState } from '../store.js';
import { findSimilar, openReason, angleLine, subjectFilms, MODES } from '../data/similarity.js';
import { resolveOutcomes, outcomeLine, footerLine, primaryOutcome } from '../data/outcomes.js';
import { studyName, subjectLabel } from '../data/labels.js';
import { ensureEmbeddings, embeddingsMap } from '../embeddings.js';

const DASH = '\u2014';
const SEP = ' \u00B7 ';
const SCOPE_OPTIONS = [['workspace', 'This workspace'], ['all', 'All studies']];
const RANK_OPTIONS = [['all', 'All'], ['shape', 'Shape'], ['alignment', 'Alignment'], ['appearance', 'Appearance']];
const EYEBROW = {
  all: 'RANKED BY SHAPE, ALIGNMENT AND APPEARANCE',
  shape: 'RANKED BY SPINE SHAPE',
  alignment: 'RANKED BY SPINOPELVIC ALIGNMENT',
  appearance: 'RANKED BY APPEARANCE',
};
const EMPTY = {
  unsegmented: 'Segment this study to find similar cases.',
  partial: 'Similar cases need all five lumbar levels and S1; this study\u2019s coverage is partial.',
  'no-embedding': 'No appearance embedding for this study yet \u2014 run Embed on the Find tab, turn on Appearance embeddings in Settings, or rank by shape or alignment.',
  'no-alignment': 'Alignment needs PI, PT, SS and LL; this study is missing one \u2014 rank by shape instead.',
};
// A block the mode asked for that did not enter the distance, named on the card (spec 8.2).
const MISSING = { H: '\u00B7 no hip', A: '\u00B7 no alignment', C: '\u00B7 no appearance', W: '\u00B7 no whole film' };

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

export function mountSimilar(host) {
  clear(host);
  const root = el('div', { class: 'similar-tab' });
  host.append(root);
  let lastKey = null;
  let loadRequested = false;

  function segmented(label, key, options, current, onPick) {
    return el('div', { class: 'similar-control' },
      el('div', { class: 'sidebar-models-label' }, label),
      el('div', { class: 'model-choice', role: 'group', 'aria-label': label },
        ...options.map(([value, text]) => el('button', {
          type: 'button', class: 'model-choice-btn', 'data-similar-key': `${key}-${value}`,
          'aria-pressed': current === value ? 'true' : 'false',
          onClick: () => onPick(value),
        }, text))));
  }

  function card(match, open, state, mode) {
    const { study, blocks } = match;
    const resolved = resolveOutcomes(subjectFilms(study, state.studies));
    const status = resolved[primaryOutcome().key].status;
    const active = state.compareId === study.id;
    const missing = ['H', 'A', 'C', 'W']
      .filter((key) => MODES[mode][key] && !blocks.includes(key))
      .map((key) => MISSING[key]).join(' ');
    return el('button', {
      type: 'button',
      class: `similar-card${active ? ' is-active' : ''}`,
      'data-similar-key': `card-${study.id}`,
      'data-study-id': study.id,
      'aria-pressed': active ? 'true' : 'false',
      onClick: () => setState((s) => ({ compareId: s.compareId === study.id ? null : study.id })),
    },
      study.thumbnail
        ? el('img', { class: 'similar-thumb', src: study.thumbnail, alt: '' })
        : el('div', { class: 'similar-thumb similar-thumb-empty', 'aria-hidden': 'true' }),
      el('div', { class: 'similar-body' },
        el('div', { class: 'similar-line similar-line-1' },
          el('span', { class: 'similar-name', title: study.id }, studyName(study)),
          el('span', { class: 'similar-match' }, `${match.match}%`,
            missing ? el('span', { class: 'similar-missing' }, ` ${missing}`) : null)),
        el('div', { class: 'similar-line similar-meta' },
          `${subjectLabel(study)}${SEP}${study.timepoint ?? DASH}${SEP}${study.view || DASH}${study.filmDate ? `${SEP}${study.filmDate}` : ''}`),
        el('div', { class: 'similar-line similar-angles' }, angleLine(open, study)),
        el('div', { class: 'similar-line similar-outcome', 'data-outcome': status }, outcomeLine(resolved)),
        el('div', { class: 'similar-line similar-state eyebrow' },
          active ? 'IN VIEWER \u00B7 CLICK TO REMOVE' : 'CLICK TO COMPARE IN VIEWER')));
  }

  function restore(focusKey) {
    if (focusKey === null) return;
    const target = root.querySelector(`[data-similar-key="${focusKey}"]`);
    if (target) target.focus();
  }

  function update() {
    const state = getState();
    const open = state.studies.find((s) => s.id === state.openId) ?? null;
    if (!open || state.tab !== 'sim') return;
    // The embeddings load once, the first time the tab is shown. The load is async and bumps
    // embeddingsVersion when it lands, which is in the key below, so the cards fill in then.
    if (!loadRequested) {
      loadRequested = true;
      ensureEmbeddings();
    }
    const key = [state.studies, state.openId, state.compareId, state.similarScope, state.similarRank, state.embeddingsVersion];
    if (sameKey(key, lastKey)) return;
    lastKey = key;

    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.getAttribute('data-similar-key') : null;
    clear(root);
    const scope = state.similarScope;
    const mode = state.similarRank;
    root.append(
      segmented('SCOPE', 'scope', SCOPE_OPTIONS, scope, (value) => setState({ similarScope: value })),
      segmented('RANK BY', 'rank', RANK_OPTIONS, mode, (value) => setState({ similarRank: value })),
      el('div', { class: 'eyebrow similar-eyebrow' }, EYEBROW[mode]));

    const embeddings = embeddingsMap();
    const reason = openReason(open, mode, embeddings);
    if (reason) {
      root.append(el('div', { class: 'similar-empty', 'data-similar-key': 'empty' }, EMPTY[reason]));
      restore(focusKey);
      return;
    }
    const { matches, total, stale } = findSimilar(open, state.studies, { scope, mode, embeddings, n: 5 });
    if (matches.length === 0) {
      root.append(el('div', { class: 'similar-empty', 'data-similar-key': 'empty' },
        scope === 'workspace' ? 'No other eligible studies in this workspace.' : 'No other eligible studies in the library.'));
    } else {
      root.append(el('div', { class: 'similar-cards' }, ...matches.map((match) => card(match, open, state, mode))));
      const statuses = matches.map((match) => resolveOutcomes(subjectFilms(match.study, state.studies))[primaryOutcome().key].status);
      root.append(el('div', { class: 'eyebrow similar-footer', 'data-similar-key': 'footer' }, footerLine(statuses)));
      const more = total - matches.length;
      if (more > 0) root.append(el('div', { class: 'eyebrow similar-tail', 'data-similar-key': 'more' }, `${more} MORE ${more === 1 ? 'STUDY' : 'STUDIES'} BELOW`));
    }
    if (stale > 0) {
      root.append(el('div', { class: 'eyebrow similar-tail similar-stale', 'data-similar-key': 'stale' },
        `${stale} ${stale === 1 ? 'STUDY NEEDS' : 'STUDIES NEED'} RE-EMBEDDING`));
    }
    restore(focusKey);
  }

  return { update };
}
