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
import { findSimilar, openReason, angleLine, subjectFilms, hasRegion, defaultRegion, BLOCKS } from '../data/similarity.js';
import { resolveOutcomes, outcomeLine, footerLine, primaryOutcome } from '../data/outcomes.js';
import { studyName, subjectLabel } from '../data/labels.js';
import { ensureEmbeddings, embeddingsMap } from '../embeddings.js';

const DASH = '\u2014';
const SEP = ' \u00B7 ';
const SCOPE_OPTIONS = [['workspace', 'This workspace'], ['all', 'All studies']];
const REGION_OPTIONS = [['lumbar', 'Lumbar'], ['cervical', 'Cervical'], ['full_spine', 'Whole spine']];
const RANK_OPTIONS = [['all', 'All'], ['shape', 'Shape'], ['alignment', 'Alignment'], ['appearance', 'Appearance']];
const REGION_WORD = { lumbar: 'LUMBAR', cervical: 'CERVICAL', full_spine: 'WHOLE-SPINE' };
const REGION_TEXT = { lumbar: 'lumbar', cervical: 'cervical', full_spine: 'whole-spine' };
const KIND_WORDS = { all: 'SHAPE, ALIGNMENT AND APPEARANCE', shape: 'SHAPE', alignment: 'ALIGNMENT', appearance: 'APPEARANCE' };
const MISSING = Object.fromEntries(BLOCKS.map((block) => [block.key, `\u00B7 ${block.label}`]));

function emptyText(reason, region) {
  switch (reason) {
    case 'unsegmented': return 'Segment this study to find similar cases.';
    case 'no-region': return `This study has no ${REGION_TEXT[region]} anatomy to rank on \u2014 choose another region.`;
    case 'no-embedding': return 'No appearance embedding for this study yet \u2014 run Embed on the Find tab, turn on Appearance embeddings in Settings, or rank by shape or alignment.';
    case 'no-alignment': return `Alignment needs at least one measured ${REGION_TEXT[region]} angle on this study.`;
    default: return '';
  }
}

function sameKey(a, b) {
  return a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]);
}

export function mountSimilar(host) {
  clear(host);
  const root = el('div', { class: 'similar-tab' });
  host.append(root);
  let lastKey = null;
  let loadRequested = false;

  function segmented(label, key, options, current, onPick, disabled = () => null) {
    return el('div', { class: 'similar-control' },
      el('div', { class: 'sidebar-models-label' }, label),
      el('div', { class: 'model-choice', role: 'group', 'aria-label': label },
        ...options.map(([value, text]) => {
          const why = disabled(value);
          return el('button', {
            type: 'button', class: 'model-choice-btn', 'data-similar-key': `${key}-${value}`,
            'aria-pressed': current === value ? 'true' : 'false',
            disabled: why !== null, title: why ?? '',
            onClick: () => onPick(value),
          }, text);
        })));
  }

  function card(match, open, state, region) {
    const { study, absent } = match;
    const resolved = resolveOutcomes(subjectFilms(study, state.studies));
    const status = resolved[primaryOutcome().key].status;
    const active = state.compareId === study.id;
    const missing = absent.map((key) => MISSING[key]).join(' ');
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
          el('span', { class: 'similar-name', title: studyName(study) }, studyName(study)),
          el('span', { class: 'similar-match' }, `${match.match}%`,
            missing ? el('span', { class: 'similar-missing' }, ` ${missing}`) : null)),
        el('div', { class: 'similar-line similar-meta' },
          `${subjectLabel(study)}${SEP}${study.timepoint ?? DASH}${SEP}${study.view || DASH}${SEP}${study.filmDate || DASH}`),
        el('div', { class: 'similar-line similar-angles' }, angleLine(open, study, region)),
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
    const key = [state.studies, state.openId, state.compareId, state.similarScope, state.similarRank, state.similarRegion, state.embeddingsVersion];
    if (sameKey(key, lastKey)) return;
    lastKey = key;

    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.getAttribute('data-similar-key') : null;
    clear(root);
    const scope = state.similarScope;
    const mode = state.similarRank;
    const region = state.similarRegion?.openId === open.id ? state.similarRegion.region : defaultRegion(open);
    const regionReason = (value) => (hasRegion(open, value) ? null : `This study has no ${REGION_TEXT[value]} anatomy`);
    root.append(
      segmented('SCOPE', 'scope', SCOPE_OPTIONS, scope, (value) => setState({ similarScope: value })),
      segmented('REGION', 'region', REGION_OPTIONS, region, (value) => setState({ similarRegion: { openId: open.id, region: value } }), regionReason),
      segmented('RANK BY', 'rank', RANK_OPTIONS, mode, (value) => setState({ similarRank: value })),
      el('div', { class: 'eyebrow similar-eyebrow' }, `RANKED BY ${REGION_WORD[region]} ${KIND_WORDS[mode]}`));

    const embeddings = embeddingsMap();
    const reason = openReason(open, region, mode, embeddings);
    if (reason) {
      root.append(el('div', { class: 'similar-empty', 'data-similar-key': 'empty' }, emptyText(reason, region)));
      restore(focusKey);
      return;
    }
    const { matches, total, stale } = findSimilar(open, state.studies, { scope, region, mode, embeddings, n: 10 });
    if (matches.length === 0) {
      root.append(el('div', { class: 'similar-empty', 'data-similar-key': 'empty' },
        scope === 'workspace' ? 'No other eligible studies in this workspace.' : 'No other eligible studies in the library.'));
    } else {
      root.append(el('div', { class: 'similar-cards' }, ...matches.map((match) => card(match, open, state, region))));
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
