// Study flags: short free-text tags a reviewer puts on a film ("hardware", "OLIF outcomes").
//
// A flag is one to FLAG_MAX_LENGTH characters with no comma, semicolon or line break. Two flags are the same flag
// when they differ only in case (`flagKey`); a film keeps the spelling it was given. A film holds at most
// FLAGS_MAX flags. Pure: no DOM, no store, no I/O; nothing mutates an argument and every list returned is new.

export const FLAG_MAX_LENGTH = 40;
export const FLAGS_MAX = 20;
/** The filter value that means "films with no flags". */
export const NO_FLAGS = '__no_flags__';

const FORBIDDEN = /[,;\r\n]/;

/**
 * The flag a typed or stored string stands for, or null when it is not one: trimmed, leading `#` marks (and the
 * spaces after them) dropped, whitespace runs collapsed to one space. Empty, over 40 characters, or holding a
 * comma, semicolon or line break gives null.
 */
export function cleanFlag(text) {
  if (typeof text !== 'string') return null;
  if (FORBIDDEN.test(text.trim())) return null;
  const flag = text.trim().replace(/^#+\s*/, '').replace(/\s+/g, ' ');
  if (flag === '' || flag.length > FLAG_MAX_LENGTH) return null;
  return flag;
}

/** The lower-cased flag: the value filters and maps key on. */
export function flagKey(flag) {
  return String(flag).toLowerCase();
}

/** True when two flags differ at most in case. */
export function sameFlag(a, b) {
  return flagKey(a) === flagKey(b);
}

/** True when both lists hold the same strings in the same order; a missing list reads as empty. */
export function sameFlagList(a, b) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  return x.length === y.length && x.every((flag, i) => flag === y[i]);
}

/** A stored list read safely: each entry cleaned, junk and later matches dropped, at most FLAGS_MAX. Never throws. */
export function cleanFlags(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of value) {
    const flag = cleanFlag(entry);
    if (flag === null || seen.has(flagKey(flag))) continue;
    seen.add(flagKey(flag));
    out.push(flag);
    if (out.length === FLAGS_MAX) break;
  }
  return out;
}

/** A pasted or typed list ("a, b; c" or one per line) as flags. */
export function splitTyped(text) {
  return cleanFlags(String(text ?? '').split(/[,;\r\n]/));
}

/** `flags` with `flag` appended; unchanged when `flag` is not a flag, matches one held, or the list is full. */
export function addFlag(flags, flag) {
  const held = cleanFlags(flags);
  const clean = cleanFlag(flag);
  if (clean === null || held.length >= FLAGS_MAX || held.some((f) => sameFlag(f, clean))) return held;
  return [...held, clean];
}

/** `flags` without the flag that matches `flag`. */
export function removeFlag(flags, flag) {
  return cleanFlags(flags).filter((f) => !sameFlag(f, flag));
}

/**
 * Every flag held by any of `studies`, one spelling each (the one most films use; a tie goes to the first met),
 * sorted A to Z ignoring case.
 */
export function flagsInUse(studies) {
  const byKey = new Map();
  for (const study of studies ?? []) {
    for (const flag of cleanFlags(study?.flags)) {
      const key = flagKey(flag);
      if (!byKey.has(key)) byKey.set(key, new Map());
      const spellings = byKey.get(key);
      spellings.set(flag, (spellings.get(flag) ?? 0) + 1);
    }
  }
  const out = [];
  for (const [key, spellings] of byKey) {
    let best = null;
    let bestCount = 0;
    for (const [spelling, count] of spellings) {
      if (count > bestCount) { best = spelling; bestCount = count; }
    }
    out.push({ key, spelling: best });
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.spelling < b.spelling ? -1 : a.spelling > b.spelling ? 1 : 0));
  return out.map((e) => e.spelling);
}

/** The spelling the library already uses for `flag`, or `flag` itself when it is new. */
export function librarySpelling(flag, inUse) {
  return (inUse ?? []).find((f) => sameFlag(f, flag)) ?? flag;
}

/** `local` in its order and spelling, then each flag of `incoming` that `local` does not match. */
export function mergeFlags(local, incoming) {
  return cleanFlags([...cleanFlags(local), ...cleanFlags(incoming)]);
}

/**
 * What the flag picker offers for the text typed so far: the flags in use that are not already in `draft` and
 * contain the text (all of them when it is blank), then one `create` entry when the text is a new flag.
 */
export function flagChoices({ inUse, draft, text }) {
  const used = inUse ?? [];
  const held = draft ?? [];
  const blank = typeof text !== 'string' || text.trim() === '';
  const clean = cleanFlag(text);
  if (!blank && clean === null) return [];
  const needle = blank ? '' : flagKey(clean);
  const choices = used
    .filter((f) => !held.some((h) => sameFlag(h, f)) && flagKey(f).includes(needle))
    .map((flag) => ({ kind: 'use', flag }));
  if (!blank && !used.some((f) => sameFlag(f, clean)) && !held.some((h) => sameFlag(h, clean))) {
    choices.push({ kind: 'create', flag: clean });
  }
  return choices;
}

function targets(studies, ids) {
  const wanted = new Set(ids ?? []);
  return (studies ?? []).filter((s) => wanted.has(s.id) && s.source === 'real');
}

const holds = (study, flag) => cleanFlags(study.flags).some((f) => sameFlag(f, flag));

/** Whether `flag` is on all, some or none of the real films in `ids`. */
export function bulkState(studies, ids, flag) {
  const films = targets(studies, ids);
  const n = films.filter((s) => holds(s, flag)).length;
  if (n === 0) return 'none';
  return n === films.length ? 'all' : 'some';
}

/**
 * The edits that put `flag` on (or take it off) the real films in `ids`: the films that change, in `studies` order,
 * with their new lists, and `full`, how many films could not take it because they hold FLAGS_MAX flags.
 */
export function bulkChange(studies, ids, flag, on) {
  const changes = [];
  let full = 0;
  for (const study of targets(studies, ids)) {
    const held = cleanFlags(study.flags);
    const has = held.some((f) => sameFlag(f, flag));
    if (on) {
      if (has) continue;
      if (held.length >= FLAGS_MAX) { full += 1; continue; }
      changes.push({ id: study.id, flags: addFlag(held, flag) });
    } else if (has) {
      changes.push({ id: study.id, flags: removeFlag(held, flag) });
    }
  }
  return { changes, full };
}

/** A film's flags joined with `separator`; a missing list is the empty string. */
export function flagsText(flags, separator) {
  return cleanFlags(flags).join(separator);
}

// The flag editor's draft, as pure transitions (2026-11-16, study flags; spec section 4.3). The Find list's FLAGS cell
// and the Analysis side panel hold `{ ...edit }` (the screen adds its `id`) and call these from the editor's callbacks,
// so the two screens cannot drift. `active` is the highlighted suggestion's index, -1 for none: nothing is highlighted
// while the box is empty, so Enter in an empty box closes the editor; typing highlights the first suggestion. Each
// helper returns a new object and leaves `edit` and its `draft` alone; keys the screen added are carried through.

/** A fresh edit of `flags`: the cleaned list, an empty box, nothing highlighted. */
export function startFlagEdit(flags) {
  return { draft: cleanFlags(flags), text: '', active: -1 };
}

/** `edit` with the box's text replaced; the first suggestion is highlighted, or none when the text is blank. */
export function flagEditText(edit, text) {
  return { ...edit, text, active: String(text).trim() === '' ? -1 : 0 };
}

/** `edit` with each of `flags` added (in the library's spelling) and the box emptied. */
export function flagEditAdd(edit, flags, inUse) {
  let draft = edit.draft;
  for (const flag of flags ?? []) draft = addFlag(draft, librarySpelling(flag, inUse));
  return { ...edit, draft, text: '', active: -1 };
}

/** `edit` without the flag at `index`; an index out of range changes nothing. */
export function flagEditRemove(edit, index) {
  if (!Number.isInteger(index) || index < 0 || index >= edit.draft.length) return { ...edit, draft: [...edit.draft] };
  return { ...edit, draft: edit.draft.filter((_, i) => i !== index) };
}

/** `edit` with the highlight moved to `index`, kept within -1 ... count - 1. */
export function flagEditActive(edit, index, count) {
  return { ...edit, active: Math.max(-1, Math.min(count - 1, index)) };
}

/** The flags to save when the editor closes: the draft plus whatever is still typed in the box. */
export function flagEditResult(edit, inUse) {
  let flags = edit.draft;
  for (const flag of splitTyped(edit.text)) flags = addFlag(flags, librarySpelling(flag, inUse));
  return flags;
}
