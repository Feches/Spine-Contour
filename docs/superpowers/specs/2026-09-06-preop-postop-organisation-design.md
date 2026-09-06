# Pre-op / post-op organisation and the Parameters tab — design

**Status:** draft for review, 2026-09-06. Brainstormed on branch `claude/preop-postop-xray-org-2c4d80`
(off `claude/studies-ui-updates-bb040d`). Nothing here is implemented.

**Builds on:** `2026-08-31-spine-contour-ui-redesign-design.md` (the approved spec; section numbers
below that start with "spec §" refer to it) and the binding architecture contract
`plans/2026-08-31-00-architecture-contract.md`. Where this document changes a stored shape or a
module interface, §18 lists the amendment it forces.

---

## 1. Problem

A researcher studying spinopelvic change after lumbar fusion has, for each patient, at least two
lateral films: one before surgery and one after. Often more — an intra-operative film, and follow-ups
at six weeks, one year and two years. The question they want the app to answer is "how did PT, SS,
lordosis and PI–LL change from before to after, across the cohort", and the artefact they want is one
CSV they can open in R, pandas or Excel and run a paired analysis on.

The app cannot help with any of that today:

- **A record is a film, not a patient.** A `Study` carries an id, a filename, a display name, the
  workspace root it came from and a free-form clinical map. There is no subject key, no timepoint and
  no acquisition date; the only date is `addedAt`, when the film entered the library.
- **Folders are visible but not meaningful.** The Studies table shows WORKSPACE and FOLDER (roadmap
  item 2, done 2026-09-06), and the code's own example is `CohortA/pre-op`, but nothing pairs a film in
  `pre-op/` with its sibling in `post-op/`.
- **Position is asserted, not recorded.** Every real film is stored with `view: 'Standing lateral'`,
  hard-coded at every add path. An intra-operative film is prone. PI is anatomic and does not change
  with position; PT, SS and lordosis do.
- **Export is one film at a time.** The Analysis screen's `Export CSV` writes only the open study
  (`screens/analysis.js`, `toCsv(live.studies.filter((s) => s.id === live.openId), …)`). There is no
  way to export a workspace, a cohort or the library.
- **Comparison mode is specified but not built.** Spec §10.6 defines the split viewer with Δ columns,
  `data/measurements.js` has `deltaRow`, and the store has a `compareId` slot, but the Analysis screen
  reads "Find similar arrives in a later build" (plan 07, deferred past the first release). A pre/post
  pair is the most natural entry into that mode, more so than nearest-neighbour matching.

Roadmap item 1 (the CSV round trip) already asks for a stable external identity in the export. Subject
and timepoint *are* that identity for analysis purposes, so the two conversations are one.

## 2. Users and workflow

The researcher (spec §2), doing this:

1. Arrange films on disk as `Fusion2025/pre-op/S001.png`, `Fusion2025/post-op/S001.png`, … or any of
   the layouts in §8.1, optionally with a clinical CSV.
2. Load the folder in the Workspace. Subject and timepoint are read off the folder names (or the CSV)
   for every film, and the load message says how many were inferred and how many were not.
3. Run segmentation across the cohort.
4. Open the **Parameters** tab on the Studies screen, filter to the workspace, see one row per film
   with every measurement, sort by subject so each patient's films sit together.
5. Export the visible rows as one long-format CSV and analyse. Optionally export a paired (wide)
   CSV with one row per subject and pre/post/Δ columns.
6. On any film, open the comparison view against the same subject's pre-op film and read the deltas.

The clinician user (spec §2) gets the same honesty guarantees as everywhere else: no invented values,
no delta between films of different positions without the positions shown, no silently dropped rows.

## 3. Goals

1. Give a film a **subject**, a **timepoint** and an optional **study date**, so films of one patient
   can be found, grouped, paired and exported together.
2. Make **view** a recorded, editable fact rather than a constant, so a standing-versus-prone
   comparison is visibly that.
3. Add a **Parameters tab** to the Studies screen: every segmented film's measurements in one grid,
   filterable by workspace, folder, timepoint, subject and pairing, exportable as a whole.
4. Seed the new fields from **folder layout and the workspace CSV** so a well-organised dataset needs
   no typing, while every seeded value is visible and editable.
5. Add the **"compare with pre-op"** entry into spec §10.6's comparison mode.
6. Do all of it **without a store version bump**, following the `name` / `workspaceFolder` precedent
   of optional, null-defaulting fields.

## 4. Non-goals

- A patient entity, a `patients` array, or any normalisation beyond a string key on the film. Every
  attribute a "patient" would hold (age, sex, diagnosis) already lives per film in `clinical`, and the
  long-format export handles per-subject and per-visit fields identically. Revisit only if a real
  analysis need appears that a string key cannot serve.
- Reading DICOM tags (`PatientID`, `StudyDate`). The backend reads only pixels today; `PatientID` is
  PHI and would need hashing or omission; this is a later, separate decision (§16).
- Global deformity parameters (SVA, T1 pelvic angle, thoracic kyphosis, C7 plumb line). The models do
  not read the landmarks, and SVA is a length needing pixel spacing. These columns must not appear at
  all — not as `—` — until a model produces them.
- Fixing the CSV import round trip (roadmap item 1), except for the one decision it shares with this
  spec (§11.1, export the union of clinical fields).
- Comparing more than two films side by side. The viewer stays two panes; the exports carry N films.
- Any backend change.

## 5. Current state this builds on

| Piece | Where | What it gives us |
|---|---|---|
| Recursive folder scan, root stored per film | `scan-folder.js`, `workspaceFolder` | The workspace filter and the path segments §8.1 classifies |
| Load fills only blank clinical keys; drawer is the overwrite path | `screens/workspace.js`, `components/clinical-data.js` | The precedence rule in §8.3 is the same rule |
| CSV join on filename stem, `study_id` never a clinical field | `data/csv.js` `findJoinHeader`, `joinClinical` | Model for treating `subject_id` etc. as structural columns |
| `toCsv(studies, fields, opts)` takes an array | `data/csv.js` | Exporting a filtered set is passing a different array |
| Union of clinical field names over studies | `data/csv.js` (~line 284) | The hidden-fields decision in §11.1 |
| `deltaRow(row, otherRow, threshold)` | `data/measurements.js` | Δ columns for both the viewer and the paired export |
| `compareId` in state, `COMPARING · {id}` header, split panes | `store.js`, spec §9.5 / §10.6 | Comparison mode; plan 07 builds it |
| `view` stored as a free string; demo studies use five values | contract `Study`, `demo-studies.js` | No new field needed for position |
| Optional null-default fields without a version bump | `name`, `workspaceFolder` | The persistence pattern for every new field here |

## 6. Decisions

Each of these was a fork in the brainstorm. The choice and the reason are recorded so nobody reopens
them by accident; any can be reversed before implementation starts.

1. **Structural fields on the record, not clinical-map entries and not folders.** Folders are an
   input path: they cannot pair a film added by hand or from a second load, they give a one-year
   follow-up no home, and analysis code would have to parse paths. Clinical-map entries would work
   with almost no code (the CSV load already fills them) but put identity in a bag of free text the
   user can hide or overwrite, and the app cannot act on them without special-casing key names.
   Moving from the clinical-map interim to structural fields later would be a one-line lift, so
   starting with the clinical map is a legitimate stopgap if the fields slip; the design target is the
   fields.
2. **The key is called Subject, not Patient, and the UI says it is a study code.** A research library
   holding MRNs beside radiographs is a PHI store, and the app is investigational. The label, the
   drawer placeholder and the CSV header all say "Subject". The app cannot enforce what the user
   types; it can avoid inviting the wrong thing.
3. **Timepoint is a label with a known order, not a two-value enum.** Fusion research has 6-week,
   1-year and 2-year films, and deformity work has intra-op films. A binary field would have to be
   replaced the first time one appeared. Pairing anchors on the label `Pre-op`; the post side is
   chosen (§11.2).
4. **View stays a string, defaults to `Standing lateral` on every add path as today, and becomes
   editable with a suggested list.** Changing the default to null would make every film read `—`
   until set, which is more honest but adds a click per film to the common all-standing dataset. The
   per-load selector alternative is an open question (§16). The load can also seed view from a CSV
   column.
5. **No per-field provenance flag for seeded values.** A subject label is not a measurement; the
   Parameters grid makes every seeded value visible in a column, the load message says how many were
   inferred and from what, and the drawer edits them. Storing "this was guessed" per field is extra
   state for a distinction the grid already makes obvious. Roadmap item 3 (model provenance) is a
   different problem and keeps its own plan.
6. **Explicit beats inferred; nothing overwrites a stored value on load.** CSV columns win over folder
   inference when both supply a value. Neither writes onto a film that already has a non-null value.
   The drawer is the overwrite path, exactly as for clinical data.
7. **The Parameters tab defaults to segmented films only, and says how many it is hiding.** The tab
   exists to look at numbers; an unsegmented film has none. Hiding them without a count would make a
   film look lost.
8. **Long format is the primary export; paired format is a convenience that ships last.** Every
   stats package wants long format and pivots it in one line. The wide export is for the Excel-first
   workflow and shares its delta code with comparison mode, so it lands after that mode exists.
9. **Nothing drops silently.** Unpaired subjects, ambiguous subjects (two pre-op films), films with no
   subject, unparseable dates: counted and named in the toast, never omitted without a word. This is
   the CSV import's existing rule applied to the new paths.

## 7. Data model

### 7.1 New fields on `Study`

```js
/**
 * Additions to the contract's Study typedef. All three are optional and default to null, so a record
 * written before they existed loads unchanged. They MUST be listed in validateStudy's returned object
 * or the saver writes them and the next load drops them (the workspaceFolder trap).
 *
 * @property {string|null} subjectId   study code shared by every film of one subject. Stored as
 *                                     typed after trimming; pairing, filtering and grouping compare
 *                                     it case-insensitively, as the stem join does; never an MRN
 *                                     (decision 2)
 * @property {string|null} timepoint   'Pre-op' | 'Intra-op' | 'Post-op' | '6 wk' | '1 yr' | … or any
 *                                     user label (§7.2)
 * @property {string|null} studyDate   'YYYY-MM-DD'; the film's acquisition date, never addedAt
 */
```

`view` is unchanged in type (`string`, required by `validateStudy`) and in default. What changes is
that it is editable (§9) and seedable (§8.2).

`STORE_VERSION` stays `1`. If a later change makes any of these required, bump then.

### 7.2 Timepoint labels and order

A small module, `renderer/data/timepoints.js`, owns the vocabulary:

| Label | Sort key | Folder / stem tokens that normalise to it (case-insensitive; `-`, `_`, space optional) |
|---|---|---|
| `Pre-op` | 0 | `pre-op`, `preop`, `pre-operative`, `preoperative`, `pre` |
| `Intra-op` | 1 | `intra-op`, `intraop`, `intra-operative`, `intraoperative` |
| `Post-op` | 2 | `post-op`, `postop`, `post-operative`, `postoperative`, `post` |
| `N wk` / `N mo` / `N yr` | 3, then by duration in days | `6wk`, `6 weeks`, `3mo`, `3 months`, `1yr`, `2 years`, … |
| any other string | 4, then alphabetical | none — only the CSV or the drawer can set these |

Ties within a sort key break on `studyDate` ascending, then `addedAt` ascending. Tokens match a
**whole** path segment or a whole stem token only (§8.1), never a substring: a folder named
`Preoperative planning` does not match, and `Postgraduate` does not match.

Suggested chips in the drawer: `Pre-op`, `Intra-op`, `Post-op`, `6 wk`, `1 yr`, `2 yr`. Typing any
other label commits it as typed.

### 7.3 View

Suggested list, in `renderer/data/timepoints.js` beside the timepoint vocabulary (it is the same kind
of thing — a controlled label with free-text escape): `Standing lateral`, `Supine lateral`,
`Prone lateral`, `Flexion lateral`, `Extension lateral`. Intra-op films are prone on a Jackson table;
the app does not infer that — an `intra-op` folder sets the timepoint, not the view.

### 7.4 Persistence and validation

`validateStudy` returns the three fields, each `null` unless a non-empty string. `studyDate` is
additionally checked against `/^\d{4}-\d{2}-\d{2}$/` and nulled with a console warning otherwise (a
malformed date is not fatal to the record). Demo studies may carry the fields; two of the nine should,
so the dev build demonstrates pairing without a fixture.

## 8. Seeding on load

### 8.1 From the folder layout

`scanFolder` returns absolute paths. For each film, `renderer/data/seeding.js` (pure) takes the
segments strictly below the workspace root, plus the filename stem, and classifies:

1. Any segment that normalises to a timepoint (§7.2) supplies `timepoint`. The **last** such segment
   wins if two match.
2. The **first** segment below the root that is not a timepoint supplies `subjectId`.
3. If no folder segment supplied a subject, the stem does — unless the stem's last `-`/`_`/space
   separated token is a timepoint, in which case that token is the timepoint and the rest of the stem
   is the subject.

| Layout | subjectId | timepoint |
|---|---|---|
| `root/pre-op/S001.png` | `S001` | `Pre-op` |
| `root/S001/pre-op.png` | `S001` | `Pre-op` |
| `root/S001/post-op/lateral.dcm` | `S001` | `Post-op` |
| `root/S001_preop.png` | `S001` | `Pre-op` |
| `root/CohortA/1yr/S001.png` | `CohortA` | `1 yr` |
| `root/S001.png` | `S001` | `null` |
| `root/IMG_0001.png` | `IMG_0001` | `null` |

The fifth row is the heuristic's known weakness: a cohort folder between the root and the subject is
read as the subject. The load message (§8.4) makes it visible in one load, and the fix is to choose
the cohort folder as the workspace. The last row is harmless but useless; the user edits or the CSV
overrides.

### 8.2 From the workspace CSV

Four structural columns, recognised the way `study_id` is (`findJoinHeader`'s normalisation) and
**never** offered as clinical fields by `autoMap`:

| Header (normalised) | Sets | Accepted values |
|---|---|---|
| `subject_id`, `subject` | `subjectId` | any non-empty text, trimmed |
| `timepoint`, `time_point`, `visit` | `timepoint` | normalised through §7.2 if it matches a token, else stored as typed |
| `study_date`, `film_date` | `studyDate` | `YYYY-MM-DD` or `M/D/YYYY` (Excel's US default); anything else is not written and is counted. A bare `date` column is deliberately not recognised: in a clinical CSV it is as likely to be the surgery date |
| `view`, `position` | `view` | stored as typed after trimming |

The row joins the film by the existing rule (filename stem = `study_id`). Rows that match no film,
duplicates and ambiguous stems are reported exactly as today.

### 8.3 Precedence

Per field, per film, in order: an existing non-null stored value is kept; else the CSV value if the
row supplied one; else the folder inference; else null. The drawer overwrites anything.

### 8.4 Load message

`workspaceLoadedMessage` gains up to three clauses, each present only when its count is non-zero:

- `· subject and timepoint read from folder names for N films`
- `· subject, timepoint or date set from the CSV for N films`
- `· N films have no subject` (or `no timepoint`; both when both)
- `· N dates could not be read` — the rejected text is stored nowhere; the film's empty Date cell in
  the Parameters grid is how the user finds which one

## 9. Editing

The clinical data drawer (spec §9.5) gets four fixed columns ahead of the clinical field columns,
under a **Study** group heading: Subject (text), Timepoint (text with the §7.2 chips), Study date
(date input), View (text with the §7.3 chips). The grid keeps its shape — one row per visible study —
so the new cells sit beside that study's clinical values. These four columns cannot be removed and
do not appear in the `ADD FIELD` chips, because they are not clinical fields. The same deferred
commit pattern the clinical grid uses (HANDOFF, "two deferred commits") applies, so a rebuild does not
strand typed text. Edits go through `setState` with a new `studies` reference, never in place.

## 10. Parameters tab

### 10.1 Placement

The Studies screen gets a two-tab strip at the top: **Find** (everything the screen is today —
summary, dropzone, table, search) and **Parameters**. The active tab lives in state (`studiesTab:
'find' | 'parameters'`) so navigation back from Analysis returns to the tab the user left. The Find
table does not gain columns; the previous decision that LORDOSIS added nothing to a screen for
*finding* a study stands, and the Parameters tab is where numbers live.

### 10.2 The grid

One row per film. Real studies always; demo studies only in the dev build, with the DEMO pill, and
excluded from export unless the export dialog includes them (spec §10.7).

Columns, left to right, first column sticky, the grid scrolling horizontally inside its own container
(the page never scrolls horizontally):

| Column | Source | Absent |
|---|---|---|
| Study | `studyName(study)` | — |
| Subject | `subjectId` | `—` |
| Timepoint | `timepoint` | `—` |
| View | `view` | — |
| Date | `studyDate` | `—` |
| PI, PT, SS, LL L1-S1, PI–LL, L1PA | `measurements` via the existing row helpers | `—` |
| LL L2-S1 … L5-S1 | same, behind a `Levels` toggle, off by default | `—` |
| Clinical fields in use | `state.fields`, as the drawer shows them | empty |
| Workspace, Folder | `workspaceLabel`, `folderLabel` | `—` |

Values render exactly as the measurements panel renders them (one decimal, `—` for absent, the
consistency mark from spec §10.4 on the PI cell). Clicking a row opens the study, as in Find. The grid
uses table semantics with a per-row link, not the Find table's single-control button row (roadmap 5,
the accessibility note).

### 10.3 Filters and sort

A filter bar above the grid. Filters compose with AND; each shows its current value as a chip that
clears it.

| Filter | Control | Notes |
|---|---|---|
| Workspace | dropdown of distinct `workspaceFolder` roots, plus `Added by hand` | the one the user asked for first |
| Folder | dropdown of distinct `folderLabel` values within the chosen workspace | |
| Timepoint | dropdown of labels present, in §7.2 order | |
| Subject | text, substring | |
| Paired only | checkbox + a `with` dropdown of post-side labels, default `Post-op` | keeps subjects having both a `Pre-op` film and the chosen label; hides everyone else and says how many |
| Segmented only | checkbox, default on | shows `N unsegmented hidden` beside it |

Sort: by subject (then §7.2 order, then date), by study id, by workspace then folder, or by any
measurement column (absent last). Sorting by subject draws a thin rule between subjects so a pair
reads as a block. The empty grid distinguishes "no segmented films" from "nothing matches these
filters", as the Find table does.

### 10.4 Export the visible set

Two buttons on the filter bar: **Export CSV** (§11.1, the rows the filters show) and, once task 4
lands, **Export paired CSV** (§11.2). Suggested filename `<workspace>-parameters.csv` or
`library-parameters.csv` when no workspace filter is set. The Analysis screen's per-study export stays
as it is.

## 11. Exports

### 11.1 Long format

`toCsv` gains three columns after `View`: `Subject`, `Timepoint`, `Study date`. Absent values are
empty, never `0` or `—`. The comment block stays (roadmap item 1 decides whether import skips it).

**Clinical columns are the union of every clinical key present on the exported studies**, in
`KNOWN_FIELDS` order then custom, using the existing union helper — not the session's visible field
list. This settles roadmap item 1's third decision: a hidden column no longer vanishes from the file.
The per-study export on the Analysis screen changes with it, since both call `toCsv`. That makes
`toCsv`'s `fields` parameter meaningless; it is dropped, and §18 records the signature change as a
contract amendment rather than leaving a parameter that is silently ignored.

```
Study ID,Source,View,Subject,Timepoint,Study date,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,...,Age,Sex,ODI
SP-1000,real,Standing lateral,S001,Pre-op,2025-03-02,38.2,52.1,21.4,30.7,13.9,...,61,F,44
SP-1001,real,Standing lateral,S001,Post-op,2025-09-14,49.1,52.3,14.0,38.3,3.2,...,61,F,18
```

### 11.2 Paired (wide) format

`toPairedCsv(studies, {post: 'Post-op'})` in `data/csv.js`, pure. One row per subject in the input
that has exactly one `Pre-op` film and exactly one film with the chosen post label.

Columns: `Subject`, `Pre study`, `Post study`, `Pre view`, `Post view`, `Pre date`, `Post date`; then
for each measurement column `M pre`, `M post`, `Δ M` (post minus pre, signed, one decimal, empty when
either side is absent); then for each clinical key in the union, `F pre` and `F post`. Every clinical
field is exported both ways rather than guessing which are per-subject and which are per-visit.

```
Subject,Pre study,Post study,Pre view,Post view,Pre date,Post date,PT pre,PT post,Δ PT,...
S001,SP-1000,SP-1001,Standing lateral,Standing lateral,2025-03-02,2025-09-14,21.4,14.0,-7.4,...
```

The view columns are what let a reader tell a standing-versus-standing pair from a
standing-versus-prone one without opening the app. They are not optional.

### 11.3 Reporting

Both exports toast what they wrote and what they left out: `Exported N rows` for long;
`Exported N pairs · M subjects unpaired (S007, S012, …) · K ambiguous (two Pre-op films: S003)` for
wide, naming up to five subjects per clause. Films with no subject are counted as unpaired. Nothing is
omitted without a clause.

## 12. Compare with pre-op

Depends on comparison mode (spec §10.6, plan 07). This section defines only the entry point.

On the Analysis screen, when the open study has a `subjectId` and the library holds at least one other
film with the same subject, a **Compare with…** control lists those films in §7.2 order, each as
`{timepoint} · {studyName} · {view}`. The default selection is the subject's `Pre-op` film when the
open study is not itself pre-op; otherwise the list opens with no default. Choosing one sets
`compareId`; the header badge reads `COMPARING · {id} · {timepoint}`. When the two views differ the
badge appends the pair, e.g. `Standing vs Prone`, so a positional delta is never shown without its
cause. Δ columns and the 5° threshold are spec §10.6's unchanged. `compareId` is nulled on delete of
either study, as HANDOFF already requires.

## 13. Backend changes

None. The framing search on this branch already locates the lumbosacral region in a long-cassette
film, so an intra-op or full-spine lateral yields PI, PT, SS, LL and L1PA without any change.

## 14. Testing

Pure modules get `node --test` coverage:

- `data/seeding.js`: every row of the §8.1 table, both separators, mixed case, a cohort folder, a
  stem that is only a token, a root with no subfolders.
- `data/timepoints.js`: normalisation of every token, the sort order across all four buckets, tie
  breaking by date then `addedAt`, custom labels after known ones.
- `data/csv.js`: the three new long columns, the union of clinical keys, `toPairedCsv` with paired,
  unpaired, ambiguous, no-subject and absent-measurement cases, the four structural CSV headers
  routed to fields and never to `clinical`, both date formats and a rejected one.
- `data/persistence.js`: the three fields survive validate, malformed date nulled, older records load
  unchanged.
- The filter and sort functions of the Parameters tab, extracted as pure functions over `Study[]`.
- `workspaceLoadedMessage` with each new clause.

DOM and canvas code gets manual verification plus additions to `tools/smoke/`: a fixture workspace
with `pre-op/` and `post-op/` subfolders and one CSV; assert the load message, the grid's row count
under each filter, the exported file's header and first row, and the compare badge text.

## 15. Sequencing

Four tasks, each its own branch off `claude/studies-ui-updates-bb040d`, each with its own
implementation plan, each merged back before the next starts:

1. **Parameters tab** with workspace, folder and segmented-only filters, sort, and long export of the
   visible set with the union-of-clinical-keys rule. No new fields; nothing in §7–§9. Independently
   useful, and every later piece lands in it.
2. **Subject, timepoint, date and view**: §7, §8, §9, the timepoint and subject and paired-only
   filters, subject sort, the load message, the three new export columns.
3. **Compare with pre-op** (§12), after plan 07 has built comparison mode.
4. **Paired export** (§11.2, §11.3).

## 16. Risks and open questions

- **PHI.** The app can label the field Subject and say why; it cannot stop an MRN being typed. The
  README's research-use language should say the library is not a place for identifiers.
- **Folder heuristics.** Whole-segment matching removes the obvious false positives, but a cohort
  folder between root and subject is misread (§8.1). The load message is the safeguard. If it proves
  insufficient, the next step is a preview of inferred values on the Workspace card before Load, not
  a cleverer heuristic.
- **Default view.** Decision 4 keeps `Standing lateral` as the assumed default. The honest
  alternative is a **per-load View selector on the Workspace card**, default `Standing lateral`, so
  the value is asserted by the user once per load rather than by the app. This is cheap and worth
  deciding before task 2. The null-until-set alternative is recorded and not recommended.
- **Two pre-op films for one subject** (a repeat, a flexion pair). Ambiguous for pairing; reported,
  never guessed. The user resolves it by relabelling one (`Pre-op flexion`).
- **Width.** The grid scrolls in its container. If the sticky first column plus fourteen numeric
  columns is unreadable on the laptop screen the app is tested on, the `Levels` toggle default and
  the clinical columns are the first things to collapse.
- **Roadmap item 1 coupling.** The import join key stays the filename stem; nothing here changes it.
  The identity question in roadmap 1 (a/b/c) is still open, but option (c)'s "stable external
  identifier" is now `Subject` + `Timepoint` for analysis purposes, which may be enough.
- **Plan 07.** Task 3 cannot start before comparison mode exists. If plan 07 stays deferred, tasks 1,
  2 and 4 still deliver the whole export workflow.
- **Date formats.** Two accepted forms is a deliberate floor. If a dataset arrives with another, add
  it to the parser and its test; do not loosen to "anything Date.parse accepts", which reads `3/4/2025`
  differently by locale.

## 17. Out of scope

Everything in §4, plus: a Subjects screen; bulk relabelling; timepoint arithmetic (days since
surgery); inferring view from anything; a third comparison pane; PDF export.

## 18. Amendments this forces

- **Architecture contract, `Study` typedef:** add `subjectId`, `timepoint`, `studyDate` with the same
  optional-null wording as `name` and `workspaceFolder`; note that `view` is now user-editable.
- **Architecture contract, module list:** `data/seeding.js`, `data/timepoints.js`; `toCsv`'s new
  columns and union rule; `toPairedCsv`; `screens/studies.js` exports for the Parameters tab's pure
  filter/sort; `workspaceLoadedMessage`'s new clauses; `state.studiesTab`.
- **Roadmap item 1:** the "export hidden fields or not" decision is made here (union). Update the
  item.
- **Roadmap item 2:** superseded in part; the FOLDER/WORKSPACE columns stay, and the Parameters tab is
  where filtering by them actually happens.
- **HANDOFF:** the drawer's Study row group and its deferred-commit pattern; the new smoke fixture.
- **Spec §9.4 (Studies) and §10.7 (Export CSV):** the tab strip and the new columns.
