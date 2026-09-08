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
2. Choose the folder in the Workspace. The card lists every folder the scan found with the timepoint
   and view the load will assign it, read off the folder names where they say so; the user corrects
   an ambiguous one (`fusion1_other`) from a dropdown, then presses Load. Subject comes off the folder
   or filename per film (or the CSV), and the load message says how many films were labelled and how
   many were not.
3. Run segmentation across the cohort.
4. Open the **Parameters** tab on the Studies screen, filter to the workspace, see one row per film
   with every measurement, sort by subject so each patient's films sit together.
5. Export the visible rows as one long-format CSV and analyse. Optionally export a paired (wide)
   CSV with one row per subject and pre/post/Δ columns.
6. On any film, open the comparison view against the same subject's pre-op film and read the deltas.

The clinician user (spec §2) gets the same honesty guarantees as everywhere else: no invented values,
no delta between films of different positions without the positions shown, no silently dropped rows.

## 3. Goals

1. Give a film a **subject**, a **timepoint** and an optional **film date**, so films of one patient
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
   types; it can avoid inviting the wrong thing. This is the same reasoning as HANDOFF decision 26
   (the film's watermark keeps the `SP-nnnn` id rather than the name, because a filename can carry
   PHI and the dropzone promises de-identified input): the subject id is likewise never burned into
   the film, and appears only in the grid, the drawer, the comparison badge and the CSV.
3. **Timepoint is a label with a known order, not a two-value enum.** Fusion research has 6-week,
   1-year and 2-year films, and deformity work has intra-op films. A binary field would have to be
   replaced the first time one appeared. Pairing anchors on the label `Pre-op`; the post side is
   chosen (§11.2).
4. **View stays a string, is seeded from folder and stem tokens that name a position directly, and
   otherwise defaults to `Standing lateral` on every add path as today; it is editable with a
   suggested list.** A folder called `flexion`, `extension`, `prone`, `supine` or `standing` states
   the position, and the load reads it exactly as it reads `pre-op` (§8.1), so a workspace with a
   flexion subfolder and an extension subfolder needs no clicks. Position is **never inferred from a
   timepoint**: an `intra-op` folder sets the timepoint and leaves the view to the default, the CSV
   or the drawer, because "intra-op films are usually prone" is a guess and the app does not guess.
   For folders whose names say nothing (`fusion1`, `fusion1_other`), the Workspace card's **folder
   table** (§8.5) shows what the load will assign to each folder and lets the user change it before
   Load, so the position comes from the user, not from an assumption. The all-standing dataset still
   needs no clicks: every row already reads `Standing lateral`, visibly, before Load. A film added by
   the picker or dropped on the list has no folder table and keeps the default, editable in the
   drawer. The load can also seed view from a CSV column.
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
 * @property {string|null} filmDate   'YYYY-MM-DD'; the film's acquisition date, never addedAt
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

Ties within a sort key break on `filmDate` ascending, then `addedAt` ascending. Tokens match a
**whole** path segment or a whole stem token only (§8.1), never a substring: a folder named
`Preoperative planning` does not match, and `Postgraduate` does not match.

Suggested chips in the drawer: `Pre-op`, `Intra-op`, `Post-op`, `6 wk`, `1 yr`, `2 yr`. Typing any
other label commits it as typed.

### 7.3 View

Suggested list, in `renderer/data/timepoints.js` beside the timepoint vocabulary (it is the same kind
of thing — a controlled label with free-text escape), each with the folder and stem tokens that
normalise to it under the same whole-segment rule as §7.2:

| Label | Tokens (case-insensitive) |
|---|---|
| `Standing lateral` | `standing`, `upright`, `erect` |
| `Supine lateral` | `supine` |
| `Prone lateral` | `prone` |
| `Flexion lateral` | `flexion`, `flex` |
| `Extension lateral` | `extension`, `ext` |

Intra-op films are prone on a Jackson table; the app does not infer that — an `intra-op` folder sets
the timepoint, not the view (decision 4). A folder named `prone` does.

### 7.4 Persistence and validation

`validateStudy` returns the three fields, each `null` unless a non-empty string. `filmDate` is
additionally checked against `/^\d{4}-\d{2}-\d{2}$/` and nulled with a console warning otherwise (a
malformed date is not fatal to the record). Demo studies may carry the fields; two of the nine should,
so the dev build demonstrates pairing without a fixture. **Done 2026-09-07 as SP-0042 (Pre-op) and
SP-0039 (Post-op), subject `P-8841`; SP-0039's patient fields were rewritten to match (user decision).**

## 8. Seeding on load

### 8.1 From the folder layout

`scanFolder` returns absolute paths. For each film, `renderer/data/seeding.js` (pure) takes the
segments strictly below the workspace root, plus the filename stem, and classifies:

1. Any segment that normalises to a timepoint (§7.2) supplies `timepoint`; any that normalises to a
   view (§7.3) supplies `view`. The **last** such segment wins if two of the same kind match.
2. The **first** segment below the root that is neither a timepoint nor a view supplies `subjectId`.
3. If no folder segment supplied a subject, the stem does. Its trailing `-`/`_`/space separated
   tokens are examined right to left for as long as they normalise to a timepoint or a view, each
   supplying its field; whatever remains is the subject. A stem made only of such tokens supplies no
   subject.

| Layout | subjectId | timepoint | view |
|---|---|---|---|
| `root/pre-op/S001.png` | `S001` | `Pre-op` | default |
| `root/S001/pre-op.png` | `S001` | `Pre-op` | default |
| `root/S001/post-op/lateral.dcm` | `S001` | `Post-op` | default |
| `root/S001_preop.png` | `S001` | `Pre-op` | default |
| `root/flexion/S001.png` | `S001` | `null` | `Flexion lateral` |
| `root/S001/pre-op/extension.png` | `S001` | `Pre-op` | `Extension lateral` |
| `root/S001_preop_flexion.png` | `S001` | `Pre-op` | `Flexion lateral` |
| `root/intra-op/S001.dcm` | `S001` | `Intra-op` | default — not inferred as prone |
| `root/CohortA/1yr/S001.png` | `CohortA` | `1 yr` | default |
| `root/S001.png` | `S001` | `null` | default |
| `root/IMG_0001.png` | `IMG_0001` | `null` | default |

"default" is the folder's row in the folder table (§8.5), which starts at `Standing lateral` and is
whatever the user set it to before Load. The `CohortA` row is the heuristic's known weakness: a
cohort folder between the root and the subject is read as the subject. The load message (§8.4) makes it visible in one load, and the fix is to choose
the cohort folder as the workspace. The last row is harmless but useless; the user edits or the CSV
overrides.

### 8.2 From the workspace CSV

Four structural columns, recognised the way `study_id` is (`findJoinHeader`'s normalisation) and
**never** offered as clinical fields by `autoMap`:

| Header (normalised) | Sets | Accepted values |
|---|---|---|
| `subject_id`, `subject` | `subjectId` | any non-empty text, trimmed |
| `timepoint`, `time_point`, `visit` | `timepoint` | normalised through §7.2 if it matches a token, else stored as typed |
| `study_date`, `film_date` | `filmDate` | `YYYY-MM-DD` or `M/D/YYYY` (Excel's US default); anything else is not written and is counted. A bare `date` column is deliberately not recognised: in a clinical CSV it is as likely to be the surgery date |
| `view`, `position` | `view` | normalised through §7.3 when it names a known position, else stored as typed (amended 2026-09-07, user decision at the final review: a CSV `standing` and a `standing/` folder must give one View) |

The row joins the film by the existing rule (filename stem = `study_id`). Rows that match no film,
duplicates and ambiguous stems are reported exactly as today.

### 8.3 Precedence

Per field, per film, most specific first: an existing non-null stored value is kept; else the CSV
value if the row supplied one; else a token in the film's own stem (§8.1 rule 3); else, for
`timepoint` and `view`, the folder table row for the folder the film sits in (§8.5) — which starts
at the folder's own inferred token and is whatever the user set it to; else null. `view` never
reaches null on a workspace load because its row always holds a value. `subjectId` has no folder-row
step: it follows §8.1 rules 2 and 3. So `fusion1/S001_extension.png` under a row the user set to
`Flexion lateral` is extension, because the film's own name is more specific than its folder. The
drawer overwrites anything.

### 8.4 Load message

`workspaceLoadedMessage` gains up to three clauses, each present only when its count is non-zero:

- `· subject, timepoint or view read from folder or file names for N films`
- `· subject, timepoint, film date or view set from the CSV for N films`
- `· N films have no subject` (or `no timepoint`; both when both)
- `· N film dates could not be read` — the rejected text is stored nowhere; the film's empty Film date cell in
  the Parameters grid is how the user finds which one

The "or file names" wording was added at implementation (2026-09-07): a flat folder seeds every
subject from the film's own stem. The load's own parenthesis reads `(blank fields filled for N)` and
the honesty clause `CSV matched N rows; no blank clinical fields to fill …` is gated on clinical
fills only, so a subject filled from a folder name never makes the message claim a clinical write
(review finding, 2026-09-07).

### 8.5 The folder table

After a scan, the Workspace card lists one row per folder that directly holds at least one supported
film: the root itself when films sit in it, and every subfolder with films, in scan order.

| Column | Content |
|---|---|
| Folder | path relative to the root; `.` for the root |
| Films | count of supported films directly in it |
| Timepoint | dropdown: the §7.2 known labels and `none`; starts at what §8.1 rule 1 infers from the folder's own path |
| View | dropdown: the §7.3 labels; starts at the inferred token, else `Standing lateral` |

The user changes any row before pressing Load, and the row's values apply to every film directly in
that folder under §8.3's precedence. A control in each column header sets the whole column, which is
how a layout with one folder per subject is set in one action, and is also the whole-batch selector
for a workspace with no subfolders (one row). The rows are transient workspace state
(`state.wsFolderRows`), rebuilt by every scan, cleared when the folder is cleared, and never
persisted — the workspace is not a saved thing (roadmap item 2). Changing a row writes nothing; only
Load writes, and a film already in the library keeps its stored values under the fill-blanks rule.

The table is what makes the app's position labels honest: no film gets `Standing lateral` without
that value having been on screen, per folder, before the user pressed Load. It also makes the
inference visible before it is committed, which §16 previously listed as the escalation for the
folder heuristic's weaknesses; a misread cohort folder shows up here as a row, not after the fact.

## 9. Editing

The clinical data drawer (spec §9.5) gets four fixed columns ahead of the clinical field columns,
under a **Study** group heading: Subject (text), Timepoint (text with the §7.2 chips), Film date
(date input), View (text with the §7.3 chips). The grid keeps its shape — one row per visible study —
so the new cells sit beside that study's clinical values. These four columns cannot be removed and
do not appear in the `ADD FIELD` chips, because they are not clinical fields. The same deferred
commit pattern the clinical grid uses (HANDOFF, "two deferred commits") applies, so a rebuild does not
strand typed text. Edits go through `setState` with a new `studies` reference, never in place.

**Implemented 2026-09-07:** the chips are native `<datalist>` suggestions on the Timepoint and View
cells (user decision); a typed timepoint that names a known label is stored as that label, so it
pairs; a typed view that names a known position is stored as its label (2026-09-07); a cleared View
cell stores `''` (the store requires a string) and renders as a dash; Import from CSV also writes
the four fields from the row's structural columns (user decision).

## 10. Parameters tab

### 10.1 Placement

The Studies screen gets a two-tab strip at the top: **Find** (everything the screen is today —
summary, dropzone, table, search) and **Parameters**. The active tab lives in state (`studiesTab:
'find' | 'parameters'`) so navigation back from Analysis returns to the tab the user left. The Find
table does not gain columns; the previous decision that LORDOSIS added nothing to a screen for
*finding* a study stands, and the Parameters tab is where numbers live.

### 10.2 The grid

One row per film. Real studies always; demo studies only in the dev build, with the DEMO pill, and
never exported (2026-09-07: there is no include-demo option and no `Source` column).

Columns, left to right, first column sticky, the grid scrolling horizontally inside its own container
(the page never scrolls horizontally):

| Column | Source | Absent |
|---|---|---|
| Study | `studyName(study)` | — |
| Subject | `subjectId` | `—` |
| Timepoint | `timepoint` | `—` |
| View | `view` | — |
| Film date | `filmDate` | `—` |
| PI, PT, SS, LL L1-S1, PI–LL, L1PA | `measurements` via the existing row helpers | `—` |
| LL L2-S1 … L5-S1 | same, behind a `Levels` toggle, off by default | `—` |
| Clinical fields in use | `state.fields`, as the drawer shows them | empty |
| Workspace, Folder | `workspaceLabel`, `folderLabel` | `—` |

Film date is the acquisition date (§7.1). The Find tab's DATE column is the date the film was added
to the library; the two are different facts and never share a label.

Values render exactly as the measurements panel renders them (one decimal, `—` for absent, the
consistency mark from spec §10.4 on the PI cell). The study name in each row is the link that opens
the study; the rest of the row is not a click target. Each row's Study cell also carries a
checkbox, and the STUDY header a select-all for the visible rows (2026-09-07). The grid uses table
semantics with a per-row link, not the Find table's single-control button row (roadmap 5, the
accessibility note).

### 10.3 Filters and sort

A filter bar above the grid. Filters compose with AND; each control shows its current value and
clears it in place (a dropdown's `All …` entry, a checkbox's untick); there are no separate chips.

| Filter | Control | Notes |
|---|---|---|
| Workspace | dropdown of distinct `workspaceFolder` roots, plus `Added by hand` | the one the user asked for first |
| Folder | dropdown of distinct `folderLabel` values within the chosen workspace | |
| Timepoint | dropdown of labels present, in §7.2 order | |
| View | dropdown of views present | flexion against extension, or standing against prone |
| Subject | text, substring | |
| Paired only | checkbox + a `with` dropdown whose first entry and default is `All paired` (any labelled film that is not Pre-op), then Post-op and the other labels present | keeps subjects having a `Pre-op` film and, under All paired, any other labelled film, else the chosen label; hides everyone else and says how many (user decision at the task-2 gate, 2026-09-07: a follow-up study labels its post films 6 wk or 1 yr as often as Post-op.) |
| Segmented only | checkbox, default on | shows `N unsegmented hidden` beside it |

Sort: by subject (then §7.2 order, then film date), by study name (the id is on the name's tooltip,
not a column), by workspace then folder, or by any measurement column (absent last). The Studies
search box applies to the grid as well as the Find list, composing with the filters. Sorting by
subject draws a thin rule between subjects so a pair reads as a block. The empty grid distinguishes
"no segmented films" from "nothing matches these filters", as the Find table does.

### 10.4 Export the visible set

Two buttons on the filter bar: **Export CSV** (§11.1, the rows the filters show) and, once task 4
lands, **Export paired CSV** (§11.2). Suggested filename `<workspace>-parameters.csv` or
`library-parameters.csv` when no workspace filter is set. Ticking rows narrows the export to the
ticked rows that are visible, in grid order; the button reads `Export N selected` and the count
line `· N SELECTED`; hidden picks stay ticked and return with the filter; with nothing ticked the
export is the visible rows (decided 2026-09-07). The reason a disabled Export button cannot act is
written beside it, not in a tooltip. The Analysis screen's per-study export stays as it is.

## 11. Exports

### 11.1 Long format

`toCsv` gains three columns after `View`: `Subject`, `Timepoint`, `Film date`. Absent values are
empty, never `0` or `—`. The comment block stays (roadmap item 1 decides whether import skips it).

**Clinical columns are the union of every clinical key present on the exported studies**, in
`KNOWN_FIELDS` order then custom, using the existing union helper — not the session's visible field
list. This settles roadmap item 1's third decision: a hidden column no longer vanishes from the file.
The per-study export on the Analysis screen changes with it, since both call `toCsv`. That makes
`toCsv`'s `fields` parameter meaningless; it is dropped, and §18 records the signature change as a
contract amendment rather than leaving a parameter that is silently ignored.

```
Study ID,View,Subject,Timepoint,Film date,LL L1-S1,PI,PT,SS,PI-LL Mismatch,L1PA,...,Age,Sex,ODI
SP-1000,Standing lateral,S001,Pre-op,2025-03-02,38.2,52.1,21.4,30.7,13.9,...,61,F,44
SP-1001,Standing lateral,S001,Post-op,2025-09-14,49.1,52.3,14.0,38.3,3.2,...,61,F,18
```

### 11.2 Paired (wide) format

`toPairedCsv(studies, {post: 'Post-op'})` in `data/csv.js`, pure. One row per subject in the input
that has exactly one `Pre-op` film and exactly one film with the chosen post label.

Columns: `Subject`, `Pre study`, `Post study`, `Pre view`, `Post view`, `Pre film date`, `Post film date`; then
for each measurement column `M pre`, `M post`, `Δ M` (post minus pre, signed, one decimal, empty when
either side is absent); then for each clinical key in the union, `F pre` and `F post`. Every clinical
field is exported both ways rather than guessing which are per-subject and which are per-visit.

```
Subject,Pre study,Post study,Pre view,Post view,Pre film date,Post film date,PT pre,PT post,Δ PT,...
S001,SP-1000,SP-1001,Standing lateral,Standing lateral,2025-03-02,2025-09-14,21.4,14.0,-7.4,...
```

The view columns are what let a reader tell a standing-versus-standing pair from a
standing-versus-prone one without opening the app. They are not optional.

**Amendment decided 2026-09-07 (user, HANDOFF decision 47), to be written into this section at the task-4
brainstorm:** with paired-only defaulting to `All paired`, a subject may carry several later films, so the wide
file is one row per subject with one column group per visit present among the exported rows (`Pre`, then each
later label in §7.2 order), each later group carrying its own Δ against Pre and a subject missing a visit
getting empty cells in that group; a single label chosen in the `with` dropdown collapses it to the two-group
file above. `toPairedCsv`'s signature will change accordingly.

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
  stem that is only a token, a stem carrying both a timepoint and a view token, a view token in a
  folder and in a stem, an `intra-op` folder leaving view at the default, a root with no subfolders.
  The folder table's pure half: `folderRows(files, root)` yields one row per folder directly holding
  a film with its count and inferred values, films in the root give a `.` row, and applying a set of
  rows to the scanned files follows §8.3 exactly — a stem token beats a user-set row, a user-set row
  beats the default, and a film already in the library is untouched.
- `data/timepoints.js`: normalisation of every token, the sort order across all four buckets, tie
  breaking by film date then `addedAt`, custom labels after known ones.
- `data/csv.js`: the three new long columns, the union of clinical keys, `toPairedCsv` with paired,
  unpaired, ambiguous, no-subject and absent-measurement cases, the four structural CSV headers
  routed to fields and never to `clinical`, both date formats and a rejected one.
- `data/persistence.js`: the three fields survive validate, malformed date nulled, older records load
  unchanged.
- The filter and sort functions of the Parameters tab, extracted as pure functions over `Study[]`.
- `workspaceLoadedMessage` with each new clause.

DOM and canvas code gets manual verification plus additions to `tools/smoke/`: a fixture workspace
with `pre-op/` and `post-op/` subfolders and one CSV; assert the load message, the grid's row count
under each filter, the exported file's header and first row, and the compare badge text; and a
folder-table row changed to `Extension lateral` before Load, with the view of a film in that folder
read back from the store after the load. Two of
HANDOFF's known traps apply directly: smoke selectors key on `data-study-id` (and a `data-` attribute
for the new grid rows and filter chips), never on a visible label such as a subject or timepoint,
because the point of several assertions is that a stored field survived; and a suite that prints
nothing has thrown, so a silent run is re-run bare and its stack read before anything is concluded.

## 15. Sequencing

Four tasks, each its own branch off `claude/studies-ui-updates-bb040d`, each with its own
implementation plan, each merged back before the next starts:

1. **Parameters tab** — DONE (plan `2026-09-06-parameters-tab.md`) — with workspace, folder and
   segmented-only filters, sort, and long export of the visible set with the union-of-clinical-keys
   rule. No new fields; nothing in §7–§9. Independently useful, and every later piece lands in it.
2. **Subject, timepoint, film date and view** — DONE (plan `2026-09-07-study-fields.md`): §7, §8
   including the folder table, §9, the timepoint, view, subject and paired-only filters, subject
   sort, the load message, the three new export columns.
3. **Compare with pre-op** (§12), after plan 07 has built comparison mode.
4. **Paired export** (§11.2, §11.3).

## 16. Risks and open questions

- **PHI.** The app can label the field Subject and say why; it cannot stop an MRN being typed. The
  README's research-use language should say the library is not a place for identifiers.
- **Folder heuristics.** Whole-segment matching removes the obvious false positives, but a cohort
  folder between root and subject is misread (§8.1). The load message is the safeguard. If it proves
  insufficient, the next step is a preview of inferred values on the Workspace card before Load, not
  a cleverer heuristic.
- **A folder table with hundreds of rows.** The layout `root/S001/pre-op.png` gives every subject
  its own folder, so the table has one row per subject. The column-header control sets a whole
  column at once and the table scrolls, which is workable. If it proves not to be, the escalation is
  to collapse rows whose inferred values are identical into one summary row (`212 folders · none ·
  Standing lateral`) with an expand control — not to hide the table, because its point is that every
  assignment was on screen before Load.
- **Default view, resolved.** The per-load selector and null-until-set alternatives that stood here
  are superseded by the folder table (§8.5, decided with the user 2026-09-06): a whole-batch selector
  is the table's one-row case or its column-header control, and no film is labelled `Standing
  lateral` without that value having been shown per folder before Load.
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
surgery); inferring view from a timepoint (an `intra-op` folder does not set prone); a third
comparison pane; PDF export.

## 18. Amendments this forces

- **Architecture contract, `Study` typedef:** add `subjectId`, `timepoint`, `filmDate` with the same
  optional-null wording as `name` and `workspaceFolder`; note that `view` is now user-editable.
- **Architecture contract, module list:** `data/seeding.js`, `data/timepoints.js`; `toCsv`'s new
  columns and union rule; `toPairedCsv`; `screens/studies.js` exports for the Parameters tab's pure
  filter/sort; `workspaceLoadedMessage`'s new clauses; `state.studiesTab`; `state.wsFolderRows` (transient, reset
  by every scan, never persisted) and the `folderRows` / apply functions in `data/seeding.js`.
- **Roadmap item 1:** the "export hidden fields or not" decision is made here (union). Update the
  item.
- **Roadmap item 2:** superseded in part; the FOLDER/WORKSPACE columns stay, and the Parameters tab is
  where filtering by them actually happens.
- **HANDOFF:** the drawer's Study row group and its deferred-commit pattern; the new smoke fixture.
- **Spec §9.4 (Studies) and §10.7 (Export CSV):** the tab strip and the new columns.
