# Flags on films — design

**Date:** 2026-11-16
**Branch:** `claude/study-flags` (worktree `.claude/worktrees/study-flags`), off `origin/main` @ `4eea101` (v1.7.0).
**Status:** design agreed in chat with the owner on 2026-11-15 and 2026-11-16; this file is the written form for review
before the plan. Nothing is built.

## 1. Why

The owner reviews a library of several hundred films and wants to mark a film with short labels of his own and then
work from them. His examples: a project title, `hardware`, `cement`, `poor segmentation`. He wants to see the labels in
the Studies list, filter the list by them, set them without opening the level editor, and have them travel with the
film into the Parameters tab, the CSV exports, bundles and the label record the trainer reads.

The request began as "show the annotation comment in the list and add flags". After seeing mockups of the comment in
the list, the owner decided that flags take that job: comments stay exactly as they are today (§2, FL5).

## 2. Decisions

The owner's (FL1–FL8), then the designer's (FL9–FL24), each with its reason, so nobody re-asks them.

**The owner's**

- **FL1 Flags are their own field, typed freely.** Not parsed out of the comment, and no `#` anywhere. ("Flags don't
  necessarily need to contain # if it makes it more complicated.")
- **FL2 A FLAGS column in the Find list, and the list filters by flag.**
- **FL3 Flags can be set from the Find list and from the Analysis screen**, without opening the level editor.
- **FL4 On the Analysis screen the flags sit above the comment in the side panel** (mockup E1), not in the header.
- **FL5 Comments are left as they are.** No comment column or line in the Find list, no editing of the comment outside
  the level editor, no change to how it is stored. The search box goes on matching it, as it does today.
- **FL6 Flags reach the Parameters tab, both CSV exports, bundles and the label record.**
- **FL7 The label record is updated on every flag change** (approach 1 of §7), so the labels folder and every bundle
  always match the list.
- **FL8 How each of those places carries flags** was proposed by the designer and accepted by the owner on 2026-11-15:
  a FLAGS column and a flag filter on the Parameters tab; a `Flags` column after `Note` in the per-film CSV, several
  flags in one cell separated by `; `; flags per visit in the paired CSV; in a bundle the flags travel with each study,
  and on import over a film already in the library the bundle's flags are added and none are removed; a `flags` list
  beside `comment` in the label record.

**The designer's**

- **FL9 They are called Flags** in the app, the files and the code (`FLAGS`, `Flags`, `flags`). The owner said "tags"
  twice in passing but asked for flags throughout. Easy to change before the build, costly after: the word is a CSV
  header and a label-record key.
- **FL10 Flags live on the study record**, saved with the library like the subject, as `flags`, a list of text. A film
  with no label record (never edited, never marked reviewed, not yet segmented) must still take a project flag, so the
  label record cannot be their home. The record holds a copy for the trainer (§4.8).
- **FL11 What a flag is.** Text of 1 to 40 characters, at most 20 on a film. Leading and trailing spaces go, runs of
  spaces become one, and a leading `#` is dropped (typing `#hardware` gives `hardware`, since the owner first thought
  of them that way). A flag cannot contain `,` or `;` or a line break: those end the flag being typed, which keeps the
  CSV cell and a pasted list unambiguous.
- **FL12 Two flags are the same when they match ignoring case.** A film never holds two that match. Typing a flag that
  matches one already used in the library takes the library's spelling, so `Hardware` and `hardware` cannot both
  exist by accident.
- **FL13 A film keeps its flags in the order they were added.** That order is what every screen and file shows.
- **FL14 Flags are saved when the person leaves the box**, as the SUBJECT cell is: no Save button. Esc backs out of the
  edit in progress; once saved there is no undo. The list for many films (FL18) applies each click at once. A flag
  change never changes a film's status, its review mark, or the label record's saved time.
- **FL15 FLAGS is the last column, after STATUS**, and the page grows from 1160 to 1280 wide to make room (§4.3). The
  list is already full: its eight columns leave about 90 pixels spare. **Confirmed by the owner on 2026-11-16**,
  knowing that on a narrow window the last column is the one scrolled off-screen (§4.3 has the numbers). Putting
  FLAGS beside SUBJECT, so that DATE and STATUS scroll instead, was offered and turned down.
- **FL16 Flags all look alike**: one neutral chip, no per-flag colour, so they do not compete with the status colours.
- **FL17 The FLAGS menu offers "any" or "every".** With two flags ticked the owner can ask for films with either or
  films with both. The other menus have no such choice because a film has one region, one view, one status.
- **FL18 Many films can be flagged at once** from the bar, over the ticked rows (§4.3). Setting a project title on
  two hundred films one row at a time is not workable. It is also how a misspelt flag is fixed: filter to it, tick
  all, add the right one, remove the wrong one.
- **FL19 The flags block hides while the level editor is open**, with the actions row and the comment. Edit mode swaps
  the whole side panel for the levels panel; putting flags into that panel is a change to the editor, which this round
  leaves alone. A flag is added before opening the editor or after pressing DONE.
- **FL20 The Parameters tab filters by one flag at a time**, from a dropdown on its bar like its other filters. Its
  FLAGS column is read-only text.
- **FL21 The CSV columns are always written**, empty when a film has no flags, so a file's header does not change from
  one export to the next. The comment is not added to any CSV (FL5).
- **FL22 A bundle's flags reach a film even when the rest of that film is skipped.** Today an import skips a film that
  is already in the library unless the bundle's label record is newer. Because a flag change does not touch the saved
  time (FL14), flags would otherwise never arrive for a film both people already have. So flags are merged for every
  film the bundle matches, whatever happens to its annotation (§4.7).
- **FL23 The label record's schema id does not change.** `flags` is added as an optional key under
  `spinecontour.segmentation-label/1`, the way `comment` was in 1.2.0: every existing record still validates, and the
  app always writes the key.
- **FL24 Flags are labels only.** Nothing is hidden, skipped or left out of an export because of a flag. A film
  flagged `poor segmentation` still exports and still goes into a bundle unless the person filters it out.
- **FL25 A ticked flag stays ticked when the last film loses it.** The list then reads empty, and the menu goes on
  offering that flag until it is unticked. This follows ruling R13 of the header-filters round, made for STATUS for
  the same reason: working down `poor segmentation` and clearing it from the last film must end on an empty list, not
  on the whole library with the arrow keys walking out of the queue and the tick coming back unseen the next time the
  flag is typed. A flag that is neither held by a film nor ticked is not offered. The Parameters dropdown keeps its
  choice the same way, so an export never quietly widens to every film.

## 3. What it looks like

Mockups A to E were shown to the owner on 2026-11-15 as images (not kept in the repository). These sketches record
what was chosen.

**Find list.** One new column at the end. A film's flags are small grey chips that wrap inside the cell; a film with
none shows a muted dash.

```
☐ STUDY                    SUBJECT ▽  …  DATE          STATUS ▽          FLAGS ▽
☐ olif-014-preop-lateral   S-014      …  Mar 3, 2026   ● Reviewed        [OLIF outcomes]                    🗑
☐ olif-014-6mo-lateral     S-014      …  Sep 12, 2026  ● Needs review    [OLIF outcomes] [hardware]         🗑
☐ fracture-007-lateral     S-007      …  Jun 2, 2026   ● Needs review    [cement] [poor segmentation]       🗑
☐ fullspine-003            —          …  Aug 18, 2026  ○ Unsegmented     —                                  🗑
```

**Editing a film's flags in its row.** A click on the cell opens it: each chip gains an ×, a text caret follows the
last chip, and a short list under the cell offers the flags already in use that contain what was typed, then
`Create "…"` for a new one.

```
FLAGS
┌──────────────────────────────────┐
│ [OLIF outcomes ×] [hardware ×] ce▏│
└──────────────────────────────────┘
┌──────────────────────────┐
│ cement                   │   ← highlighted; Enter adds it
│ Create "ce"              │
│ ENTER ADDS · ESC CANCELS │
└──────────────────────────┘
```

**The FLAGS header menu.** The other headers' menu, with one new part.

```
All  None                    ×
☑ OLIF outcomes
☐ hardware
☐ cement
☑ poor segmentation
☐ No flags
──────────────────────────────
SHOW FILMS WITH
Any ticked flag      ← chosen
Every ticked flag
──────────────────────────────
SORT
A to Z
Z to A
```

**Flagging the ticked films.** A bar button, `Flag 3 selected`, opens a list. A tick means every ticked film has the
flag, a dash means some do.

```
┌──────────────────────────────┐
│ Find or create a flag…       │
│ ☑ OLIF outcomes        all 3 │
│ ⊟ hardware            1 of 3 │
│ ☐ cement                     │
│ ☐ poor segmentation          │
│ CHANGES THE 3 TICKED FILMS   │
└──────────────────────────────┘
```

**Analysis side panel.** A FLAGS block between the buttons and the comment. `+ Add flag` opens the same editor as the
row.

```
[ Measurements | Similar ]
[ Export CSV ] [ Mark reviewed ] …
FLAGS
[OLIF outcomes] [hardware] [+ Add flag]
COMMENT
Cage at L4–5, screws L4–S1. …            ← unchanged: read-only, shown only when there is one
```

## 4. Behaviour in detail

### 4.1 The flag value

One pure module owns the rules of FL11–FL13, and every screen and file goes through it:

- cleaning one piece of typed text into a flag, or nothing when it is empty or too long;
- whether two flags match (lower-cased comparison);
- adding to and removing from a film's list without ever changing the list it was given (the store is never mutated in
  place), refusing a match and refusing a 21st flag;
- the flags in use across the library, one spelling per flag (the spelling most films use; on a tie, the first met in
  library order), sorted A to Z;
- joining two lists for an import (§4.7): the first list's order and spellings, then the second list's new ones.

### 4.2 Storage

- A study gains `flags`, a list of text, empty by default. `newStudy` writes the empty list. Demo studies have none
  and cannot be given any.
- `STORE_VERSION` stays 1. `flags` is added to the sanitizer in `renderer/data/persistence.js`, cleaned by §4.1's
  rules: anything that is not a list becomes the empty list, and entries that are not valid flags are dropped. **A
  field missing from that sanitizer is silently lost on the next load**, so this line is the one that must not be
  forgotten.
- Every flag change, from every surface, goes through one store-level function. It writes the new lists in one store
  update and starts the label-record updates of §4.8. No screen writes `flags` any other way.

### 4.3 Find list

**Column.** `FLAGS`, after STATUS and before the trash cell, in the header and in every row.
- The grid gains a tenth track with a floor of 120px. `.studies-page-inner`'s cap goes from 1160px to 1280px. The
  comment above `grid-template-columns` in `styles/screens/studies.css` explains that the floors are load-bearing
  against the cap; their sum must stay inside it.
- To pay for part of the new track, WORKSPACE's floor goes from 96px to 80px and FOLDER's from 84px to 68px. Both
  cells already cut long text with an ellipsis and carry the full path on a title, and a floor only bites on a narrow
  window. The floors then sum to 1096px (996px today).
- **Narrow windows.** The page column is the window less the sidebar (228px open, 64px collapsed) and 72px of padding.
  Below the floors' sum the table scrolls sideways, with the trash cell stuck to the right edge:

  | | Floors' sum | Window needed, sidebar open | Sidebar collapsed |
  |---|---|---|---|
  | Today | 996px | 1296px | 1132px |
  | With FLAGS | 1096px | 1396px | 1232px |

  The window opens at 1180px wide (`main.js`), so today the list fits only with the sidebar collapsed, and with FLAGS
  it scrolls either way until the window is widened. As the last column, FLAGS is the one scrolled to (FL15).
- A flag longer than the cell is cut with an ellipsis inside its chip, whole on the chip's title.
- While a row shows its two-step delete prompt, the prompt spans from the fifth track to the end and the cells it
  covers are not rendered. FLAGS joins those cells; the two must stay in step or the prompt wraps to a second line.
- Chips wrap and the row grows, as a long name does. No ellipsis.

**Editing a row's flags.** As sketched in §3.
- Real studies only. The cell shows a field outline on hover and keyboard focus, like SUBJECT.
- Click, or Enter on the focused cell, opens it. Enter or a comma adds the highlighted suggestion, or the typed text
  when nothing is highlighted. Backspace in an empty box removes the last flag. × removes that flag. Clicks inside the
  cell do not open the study.
- **The open cell holds a draft, as the SUBJECT editor does (`editingSubject`), and the film's flags are written once,
  when the cell closes:** on a click elsewhere, on Tab, or on Enter in an empty box. Esc closes it and throws the
  draft away. So the row does not leave a filtered list, or move in a sorted one, while it is being edited. Under a
  `No flags` filter a film takes its two flags and then leaves; after the save the row goes where the filters and the
  sort put it, as a row does after a SUBJECT edit.
- The draft survives a repaint the editor did not cause (a batch finishing a film, say), as the SUBJECT draft does,
  and focus returns to the box (the list's `data-find-key` pattern).
- Suggestions: the flags in use that contain the typed text and are not already in the draft, then `Create "…"` when
  the text matches no flag in use.
- The suggestion list must not be clipped by the table, which scrolls sideways; the header menus solve this by
  mounting on the table's host.

**Filter.** A funnel on the FLAGS header opens the existing header menu (`renderer/components/filter-menu.js`).
- Options: the flags in use anywhere in the library together with any flag that is ticked, A to Z, then `No flags`.
  A ticked flag no film holds any more stays ticked and stays offered until it is unticked (FL25). This is neither of
  the two rules `findFilterOptions` has today: REGION and STATUS offer a fixed list, and VIEW, WORKSPACE and FOLDER
  offer only what is present and let a tick dissolve.
- `findFilters` gains the ticked flags and the any/every choice (default: any). Session-only, like the rest of
  `findFilters`. The funnel shows the tick count, as the others do.
- A film passes when no box is ticked; or `No flags` is ticked and it has none; or flags are ticked and it has any of
  them (any) or all of them (every). `No flags` is always an "or": a film cannot both have flags and have none.
- Across columns the rule is unchanged: every column's filter must pass, and the search box narrows further.

**Sort.** FLAGS sorts from its menu like the other text columns, `A to Z` and `Z to A`, comparing each film's flags
joined in their order, ignoring case. Films with no flags go where the list already puts an empty value.

**Search.** The search box matches flags (`matchesQuery`). A column the box cannot search reads as broken.

**Flagging the ticked films.** As sketched in §3.
- A bar button beside Segment, Export and Delete. It acts on the ticked rows that are showing and are real studies,
  the same set Delete acts on, and reads `Flag N selected`. With nothing ticked it is disabled and its title says why.
- The films it acts on are fixed when the list opens. This matters when the list is filtered by the flag being
  removed: the films leave the list as they lose it, and the open list must go on acting on the films it started with.
- Ticking a row's box adds that flag to every film; clearing it removes it from every film; a dash becomes a tick on
  the first click. Typing a new flag and pressing Enter adds it to every film. Each click is applied at once.
- A film already at 20 flags is left out of an add, and a toast says how many were.

**When flag changes are refused.** While a bundle is being imported or exported, or a delete is running, the row
cell, the bar button and the Analysis block are disabled with a title that says why: those operations read or replace
the label records a flag change writes. A segmentation run or batch does not block flags.

### 4.4 Analysis screen

- A FLAGS block in the side panel between the actions row and the comment block: the `FLAGS` label, the chips, and a
  dashed `+ Add flag` chip. It uses the same editor as the row.
- Shown for a real study whenever edit mode is off, with or without flags (so the first one can be added), on both
  tabs: it sits above the tab bodies, where the comment block already is. Hidden in edit mode (FL19) and for a demo
  study.
- Typing in the box must not trigger the screen's keyboard shortcuts, the arrow-key previous and next above all.
- The block uses the same draft rule as the row: the film's flags are written when the box closes.
- If the Find list is filtered by a flag and that flag is removed from the open film here, the film leaves the list's
  order. Mark reviewed already does this to a film under a STATUS filter; the position readout and the arrows behave
  the same way here. When it was the last film with that flag, the tick stays and the list is empty (FL25).
- The comment block is not touched.

### 4.5 Parameters tab

- A read-only `FLAGS` column after FOLDER, the film's flags joined with `, `, in the grid's muted text style, cut with
  an ellipsis when long and whole on the cell's title.
- A flag dropdown on the bar: `All flags`, each flag in use, `No flags`. `paramFilters` gains the one value. When the
  last film loses the chosen flag the dropdown keeps its choice and goes on offering it, and the grid reads empty
  (FL25). The workspace and folder filters reset in that case; this one must not, or an export pressed next would
  write every film.
- Nothing changes about what the tab exports: the ticked rows that are showing, else every row showing. Filtering to a
  project flag and pressing an export therefore gives that project's CSV.

### 4.6 CSV exports

- **Per-film file (`toCsv`).** A `Flags` column directly after `Note`. The cell is the film's flags in their order,
  joined with `; `, or empty.
- **Paired file (`toPairedCsv`).** A `<visit> flags` column per visit, after the `<visit> film date` columns. A visit
  merged from two same-day films lists both films' flags, the primary film's first, without repeats.
- Both columns are always present. Columns after them move one place to the right; a reader that finds columns by name
  is unaffected, one that counts positions is not. The release notes must say so.
- No comment column (FL5), so nothing a person typed can put a `#` at the start of a line.

### 4.7 Bundles

- `BUNDLE_SCHEMA` stays `spinecontour.bundle/1`. A bundle's `study.json` carries `flags` because the study record does,
  and its label record carries the copy.
- A bundle entry's flags are its study's `flags`, or the label record's when the study has none (the way `commentOf`
  falls back to the record). Both are cleaned by §4.1's rules; an entry's study already passes through the
  persistence sanitizer on import.
- **A film the import adds** takes the bundle's flags.
- **A film already in the library** keeps its own flags, in order, and gains the bundle's new ones after them. The
  local spelling wins on a match. No local flag is ever removed. This applies both when the import updates the film
  and when it would otherwise skip it as already in the library (FL22). It does not apply to an entry skipped as
  malformed or because the film is being edited, and where several entries match one local film it uses the same
  winning entry the annotation rule uses.
- A film that only gained flags is a fourth outcome beside add, update and skip. The confirm step and the closing
  toast must name it, so the person sees what the import did.
- An update replaces the local label record with the bundle's, whose `flags` are the sender's. After the import every
  film it touched has its record's `flags` set to match its study (§4.8).

### 4.8 Label record

- `flags`: a list of text after `comment`. `toLabelRecord` always writes it, from the study's flags, as an empty list
  when there are none. So Save edits and Mark reviewed carry the flags with no further work.
- `docs/design/level-editor/label-record.schema.json`: `flags` is added as an optional property (a list of non-empty
  strings of at most 40 characters, at most 20, no repeats) and the description gains a dated sentence. The `$id` and
  `LABEL_SCHEMA` do not change. The top level is `additionalProperties: false`, so **a validator holding the old
  schema file rejects a record that has `flags`** (§11).
- **The update on a flag change.** For each changed film that has a label record: read the record, replace `flags`,
  write it back. Nothing else in the record changes. In particular `saved_at` must not: an import treats the record
  with the later `saved_at` as the newer annotation, so a film that was only flagged would overwrite someone else's
  newer level edits.
- A film with no label record gets none created. Its flags live on the study and reach a record when Save edits or
  Mark reviewed first writes one.
- **Writes to one record never interleave.** `renderer/level-editor.js` already makes Save edits and Mark reviewed
  take turns (`saving`, `writeEnded`). A flag update is a read followed by a write, and must take its turn in the same
  order, or it can put back levels a save has just replaced. `writeRecord` builds the record from the study and then
  waits on the save, so a flag changed during that save is missing from the file it writes; the flag update that
  follows must still run. The same holds for a film's first record, whose `labelFile` is not on the study until the
  save has ended. The rule to build and test: **once no write is in flight, the `flags` in every film's record equal
  the flags on its study.**
- A bulk change updates many records. They are written without freezing the list, and a failure is reported once, in
  a toast that counts the records that could not be updated. The study's flags stand either way: the library is the
  truth and the record is the copy.

### 4.9 What must not change

- A film's status and review mark, and a record's `saved_at`, `app_version` and annotation, on any flag change.
- The comment: where it is typed, saved, stored and shown, and the `labelComment` copy on the study.
- The names and order of the existing CSV columns, `BUNDLE_SCHEMA`, `LABEL_SCHEMA`, `STORE_VERSION`.
- The `SP-nnnn` id is never shown or exported.
- The Find list with no flag filter set shows the same films in the same order as today.

## 5. Goals, non-goals, anti-goals

**Goals**
- Put a flag on one film in a couple of keystrokes, from the list or the Analysis screen, and on many films at once.
- See a film's flags while scanning the list; filter, sort and search by them; work through a flagged set with the
  arrow keys on the Analysis screen, which already follows the list's filters.
- Flags arrive wherever the film's data goes: Parameters, both CSVs, bundles, the label record.

**Non-goals (this round)**
- Any change to comments.
- Flags in the level editor's panel (FL19).
- A screen to manage flags: rename everywhere, merge two, delete everywhere, descriptions, colours, a fixed list.
- Setting flags from a workspace CSV column, or from file and folder names.
- Flags that change what the app does (FL24): leaving films out of an export, a bundle or training.
- Remembering the flag filter between sessions; ticking several flags on the Parameters tab; undo.

**Anti-goals: these would make it a failure even if it works**
- A flag change that loses or replaces an annotation, by racing a save (§4.8) or through an import (FL14, FL22).
- A flag change that alters status, the review mark or `saved_at`.
- Flags that vanish after an update or a restart (§4.2's sanitizer line).
- A list that feels slower with several hundred films: flags are drawn for every row on every repaint.
- A `#` or any flag syntax leaking into a file.

## 6. Constraints

From `CLAUDE.md`, all binding here:
- No bundler, no framework, no runtime dependencies: vanilla ES modules. The flag editor is hand-built like the
  SUBJECT editor and the header menus.
- Do not loosen the CSP. No new fonts or remote anything.
- Both electron-builder file allowlists must list any new file that ships, and stay in step.
- Pure logic gets real `node --test` coverage; DOM code gets explicit manual verification steps, said plainly.
- `renderer/` cannot resolve `node:` specifiers.
- Conventional commits; commit after each completed task.

From the owner's standing rules:
- He tests before anything is pushed. No push, pull request or release without his say-so.
- No screenshot that shows a real radiograph is taken, read or sent. Checks in the running app are made by reading
  the page, not by capturing it.
- The main checkout is on an old held branch with uncommitted work and is never touched.

## 7. Approaches

The open question was where flags live and when the label record gets them.

1. **Flags on the study; the label record updated on every flag change. Chosen by the owner.** The labels folder and
   every bundle always match the list, whoever reads them and whenever. Costs: a read and a write of a small file per
   flagged film (a bulk change over 300 films touches up to 300), and the write-ordering rule of §4.8 to build and
   test.
2. **Flags on the study; the label record updated only by Save edits, Mark reviewed and a bundle export.** Less to
   build and no ordering problem. But between those moments the labels folder is behind the list, and the owner named
   the label record as a place flags must reach. Anything reading that folder directly would see old flags.
3. **Flags only in the label record, as the comment is. Ruled out.** A film with no record could not be flagged
   without inventing a record for it, and a record means "this film has labels". Project flags on films not yet
   segmented or reviewed are the owner's first example.

Whichever of 1 and 2, a flag change must leave `saved_at` alone (§4.8).

## 8. Known limits

- **An older version of the app drops flags.** Opened by a build from before this change, a library's flags are
  removed the next time that build saves, and a bundle's flags are ignored on import.
- **A quit or crash partway through a large bulk change** can leave some label records with their old flags. The
  library is right; those records are corrected the next time that film's flags change or its record is saved.
- **Position-counting CSV readers** see every column after `Note` move by one (§4.6).
- **No rename.** A misspelt flag is fixed with the filter and the bulk list (FL18).

## 9. Checking it

- **Unit tests (`node --test test/*.test.js`, 1265 passing on the branch point):** the flag rules (§4.1); the list's
  filter in both modes with `No flags`, the tick that stays when no film holds its flag, sort and search
  (`test/find.test.js`); the Parameters filter and its kept choice (`test/parameters.test.js`); both CSVs (`test/csv.test.js`); the sanitizer, including a library saved before
  flags (`test/persistence.test.js`); the import plan's four outcomes and the join (`test/bundle.test.js`); the record
  writer, the reader and the schema (`test/label-record.test.js`); and the write order of §4.8, which should be
  shaped so its rule can be tested without a window.
- **Smoke suites (`tools/smoke`):** extend the ones that cover the list, the Parameters tab, bundles, the level
  editor's save and persistence.
- **By hand, in the running app, on a scratch profile:** each surface of §4.3 to §4.5 with the keyboard and the
  mouse; a flag added while a save is in flight; a bulk change over a few hundred films; export a bundle, import it
  into a second profile that already holds some of the films with different flags; open a label record from disk and
  confirm `flags` changed and `saved_at` did not.
- The owner tests the build before anything is pushed.

## 10. Left to the builder

- Module and function names, and how the flag editor is split between the row, the bar and the Analysis block (one
  component used three times is the intent).
- How the suggestion list and the bulk list are placed and dismissed; the exact keyboard handling beyond §4.3.
- The wording of titles, toasts and the import's confirm line for films that only gained flags, in the style of the
  existing ones.
- How flag updates join the existing write order, and how many records a bulk change writes at a time.
- Where an empty flags cell sorts, by the list's existing rule for empty text.
- The chip and block styles, from the existing tokens.
- Which documents need the change written in: at least `docs/bundles.md`, `docs/level-editor.md`, `README.md` where
  it lists CSV columns, `CHANGELOG.md`, `docs/superpowers/HANDOFF.md` and `CLAUDE.md`.

## 11. For the owner, outside the code

Tell Michael before a release with this change reaches his trainer: label records gain an optional `flags` list under
the same schema id, and a validator using the old `label-record.schema.json` will reject them until it takes the new
file. The same note belongs in the release notes, with the CSV column change of §4.6.
