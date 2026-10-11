# The vertebral level editor

Edit mode on the Analysis screen is a level editor (2026-10-10). It lists every vertebral level the app knows, lets the
annotator place the levels the model missed, mark the ones that are not on the film, and adjust the rest; it adds a
display-only window / level to the stage; and **Save edits** writes one JSON label record per film, whose job is
retraining the segmentation models. Design: `docs/design/level-editor/HANDOFF.md`. Plan, decisions D1–D14 and the
execution rulings R1–R18: `docs/superpowers/plans/2026-10-10-level-editor.md`. Contract: the 2026-10-10 amendment of
`docs/superpowers/plans/2026-08-31-00-architecture-contract.md`.

## Entering and leaving

The toolbar's pencil (**Edit segmentation**) enters edit mode. The right panel's tabs, its Export / Mark reviewed row and
the Measurements panel give way to the **Vertebral levels** panel; the header shows `EDITING SEGMENTATION`; the edit bar
across the top of the stage reads `EDITING SEGMENTATION` with a help line, then RESET TO PREDICTION and DONE. Entering
edit mode turns the Pan toggle off (the middle button and the left+right chord still pan). While editing, the toolbar's
Re-run segmentation and the region bar's Run segmentation are disabled, titled `Finish editing before re-running
segmentation` (R17): a run would replace the levels under the editor.

DONE, the pencil, Escape and Back leave edit mode. With nothing unsaved they leave at once. With unsaved changes the
panel's footer asks `Discard 2 unsaved changes? Saved edits are kept.` with **Save edits**, **Discard** and **Keep
editing** (D7). Going elsewhere through the sidebar keeps the unsaved level state in memory for the session: opening
the study again and pressing Edit brings it back. Deleting the study, re-running it or changing its Region drops it.

## The panel

Sixteen levels in five groups, each group with a tri-state checkbox (every level visible / none / mixed) and a
disclosure button:

| Group | Levels | Geometry |
|---|---|---|
| Cervical `C2–C7` | C2 | inferior endplate (IA, IP) and the body's centroid (D8) |
| | C3–C7 | four corners SA, SP, IA, IP |
| Thoracic `T1 · T4` | T1 | superior endplate (anterior, posterior) |
| | T4 | centroid |
| Lumbar `L1–L5` | L1–L5 | four corners |
| Sacral `S1 ENDPLATE` | S1 | superior endplate |
| Femoral heads `2–4 RIM POINTS` | Head 1, Head 2 | centre and radius fitted from 2–4 rim points |

Each row has a visibility checkbox (`<level> visible on film`), a select button with the level's colour swatch, name
and state badge, and an action: **Place…** for a level with nothing placed, **CLEAR** for a level placed by hand,
**CANCEL** while it is being placed. A femoral head always offers Place… while visible (rim points replace its
circle); a head placed by hand shows Place… above CLEAR (R18). The header carries a summary, for example `7 PLACED ·
1 TO PLACE · 8 NOT VISIBLE` (a clause is left out at zero; PLACED is always written); each group carries its own count.
The footer says whether the training label is complete (`TRAINING LABEL · COMPLETE` when every level is placed or
marked not visible, else which visible levels still need placing), the unsaved count, **Discard** and **Save edits**.

### The five states, and what they mean for training

The state is derived from three things: the visibility checkbox, the level's geometry and the model's own output.

| State | Badge | When | Training use |
|---|---|---|---|
| `segmented` | Segmented | visible, geometry equal to the model's | positive label |
| `edited` | Edited | visible, geometry moved away from the model's | positive label, plus the model's original as an error pair |
| `manual` | Manual | visible, placed by hand where the model found nothing | positive label; marks a missed level |
| `not_placed` | Not placed | visible, nothing placed | **ignored**: the film is incomplete |
| `not_visible` | Not visible | checkbox off | **negative label**: the annotator looked and the level is absent |

`Placing…` shows while a placement is in progress. **Not visible and not placed must never be confused:** a level the
annotator checked and found absent teaches the model "not here"; a level nobody looked at teaches it nothing, and
counting it as absent would teach it the wrong thing. Each level also records who set its state (`source`): `model`,
`annotator` or `film_type`.

### Film-type defaults

A film opens with the groups its type shows visible and the rest not visible (`source: film_type`) (D5, D6):

| Film type | Visible at first |
|---|---|
| Lumbar | Lumbar, Sacral, Femoral heads |
| Cervical | Cervical, and T1 only (T4 starts not visible) |
| Full spine | all five groups |
| Auto with no result yet | every one of the sixteen levels, until the annotator unchecks it |

A level the model found is visible whatever its group. Any checkbox click makes the source `annotator`.

### Unchecking a level

Unchecking keeps the level's geometry in memory for the session, so checking it again restores it; the saved record
omits the geometry of a level that is not visible. Under an unchecked row a note names the measurements it leaves as a
dash, for that film type: unchecking S1 on a lumbar film says `LL, PI, PT, SS, PI–LL, L1PA and L5–S1 will show —`. The
note never shows a value. Unchecking the level being placed cancels the placement. T1 and T4 feed no measurement today,
so they have no note (D12).

## Placing a level

**Place…** starts a placement; the edit bar reads `PLACING L3 · 1 OF 4` with a chip per step, UNDO and CANCEL, and the
help line names the next click. Clicks are in pixels of the stored image and clamp to it, including clicks on the black
surround. A click within one pixel of the previous point is ignored (a zero-length endplate is a measurement error).

| Kind | Clicks |
|---|---|
| C3–C7, L1–L5 | 4: superior-anterior, superior-posterior, inferior-anterior, inferior-posterior (SA → SP → IA → IP) |
| C2 | 3: inferior-anterior corner, inferior-posterior corner, then the centroid of the body |
| T1, S1 | 2: the anterior then the posterior corner of the superior endplate |
| T4 | 1: the centroid |
| Femoral head | 2–4 rim points: two are read as the ends of a diameter, three or four are fitted; **FIT** finishes from 2, the fourth click finishes by itself (`PLACING FEMORAL HEAD 1 · 2 OF 4 RIM POINTS`) |

UNDO takes the last point back; CANCEL (in the edit bar or on the row) abandons the placement; selecting another row
cancels it too. A level placed by hand can be removed with **CLEAR**, which sends it back to Not placed (D13). A
segmented vertebral level has no Place… or reset of its own: drag its handles, uncheck it, or use Discard or RESET TO
PREDICTION for the whole study.

## Handles and the keyboard

Selecting a row gives that level its handles on the stage (only the selected level has handles) and focuses its first
handle; the help line says `L3 selected — drag a handle to adjust it.`. A corner handle carries its corner's colour, a
centroid the level's colour, a rim point the trace yellow. An edited level, when selected, shows the model's original
geometry dashed beneath it. Dragging a handle moves that point, clamped to the image; a femoral head's rim point refits
the circle through its rim (a model head's four rim points are synthesised at 45° intervals until the first edit).
Every drag release and nudge is committed through the measure queue, so the measurements and `studies.json` follow at
once (D2).

| Key | In edit mode |
|---|---|
| Tab / Shift+Tab | the next / previous handle across every visible, placed level in panel order, selecting its level (inside the edit bar, the W/L panel and the levels panel Tab moves focus as usual) |
| Arrow keys | nudge the focused handle 1 px; Shift: 10 px |
| Escape | one thing at a time: closes the exit prompt (Keep editing), cancels a placement, closes the W/L panel, then leaves edit mode |
| Delete, Backspace | nothing (the level editor has no delete; uncheck or CLEAR instead) |

Handles and placement clicks pause while the W/L panel is open. The left+right chord and the middle button pan in every
mode; with the Pan toggle pressed, a primary drag pans even over a handle. Not built: the handoff's suggested row keys
(↑/↓ between rows, Space to toggle visible, P for Place…), deferred to `docs/ROADMAP.md`.

## Discard, RESET TO PREDICTION, Save edits

- **Discard** puts every level back to the baseline: the saved label record when one exists, otherwise the state at
  entry, and commits it through `/measure`. Toast: `Discarded 2 changes.`
- **RESET TO PREDICTION** (D14, in the edit bar) returns the whole study to the model's output: the prediction's own
  numbers on the record (no `/measure`) and every level to the model's geometry. The baseline and the record are
  untouched, so the reset itself can be an unsaved change.
- **Save edits** writes the label record and makes the current levels the baseline. Toast: `Saved 2 edits to the label
  record.` (`Saved the label record.` for a first save with nothing changed, which is allowed: it confirms the model's
  output, D10). Save is disabled, with `NOTHING TO SAVE`, only when a record already exists and nothing has changed
  since.

### The label record

One file per film at **`<userData>/labels/<stem>.label.json`** (D3): the stem is the film's filename without its
extension (`lateral_lumbar_001.dcm` → `lateral_lumbar_001.label.json`), made safe for every file system (reserved and
control characters become `_`, leading dots go, at most 180 characters, a Windows device name takes a `_`, R12). A
second film with the same stem gets `-2`, the third `-3`; the name is stored on the study as `labelFile` and kept
across saves. The file is written atomically, removed when the study is deleted, and moved aside with the rest of the
library if `studies.json` is ever quarantined (`labels.corrupt-<stamp>`). `<userData>` is `%APPDATA%\spine-contour`
on Windows.

Its shape is `docs/design/level-editor/label-record.schema.json` (`spinecontour.segmentation-label/1`; an example
beside it). In short: `study` (the stem, never the SP id), `image` (`file`, `sha256` of the stored image's grey pixels,
`width_px`, `height_px`), `film` (`region`, `view`), `model` (`name`, and `version`: the graph's ONNX hash from the
run's `qc.model_versions`), `app_version`, `saved_at`, `complete`, `levels` keyed by code, and `femoral_heads[]`. Every
level carries `state` and `source`; a placed one carries its geometry (`corners` `{sa, sp, ia, ip}` for a body, `{ia,
ip}` plus `centroid` for C2, `{sa, sp}` for T1 and S1, `centroid` for T4; a head's `center`, `radius` and `rim`). An
edited level also carries the model's original (`model_corners`, `model_centroid`, `model_circle`); a segmented body
level carries the model's mask outline as `contour` (a polygon of at least three points, R10), null for edited and
manual levels and for films with no mask. Coordinates are pixels of the stored image, origin top-left. Window / level
is never recorded (D11).

## Window / level

The toolbar's window / level button (shown only in edit mode) opens a panel with WIDTH and LEVEL sliders, RESET (the
file's default window) and DONE; the edit bar reads `WINDOW / LEVEL` (`· PLACING PAUSED` during a placement); the study
chip reads `W 256 · L 128`. Dragging on the film changes the window too: left–right the width, up–down the level, four
units per screen pixel. **It is display only**: measurements, the levels and the label record never change, nothing is
saved, and it resets when the study is opened again (D11).

The pixels are the ORIGINAL film's, not the 8-bit image the model stored: the backend's `POST /decode` returns the
uploaded file's own values (16-bit for DICOM, with RescaleSlope/Intercept applied and MONOCHROME1 inverted), and the
renderer applies a linear lookup table to the film layer only (D1). The default window is the DICOM's own
WindowCenter / WindowWidth when it has them, 0..255 for an 8-bit film (R13), else the full value range. A
toolbar-cropped stored image uses the top rows of the original. When there is nothing to window the panel says why:
`The source film could not be found.` (the film moved or was never on disk), `The original film does not match the
stored image.`, or the decoder's own reason.

## Films with no result

A film whose segmentation failed, or that was never segmented, opens in edit mode on its decoded original, and every
level can be placed by hand. This is the case the feature exists for. Once a level is placed the study has geometry and
measurements but no prediction id and no `qc.models`: the app treats it as hand-placed (`isHandPlaced`, R16) and shows
it from its original outside edit mode too, never FILM UNAVAILABLE. Its record names model `none`.

## Demo studies

Demo studies have no film, so Edit stays disabled for them and they can neither place nor window anything. They never
write a label record; the save path refuses with `Demo studies are not exported`.

## Verification

`tools/smoke/smoke-levels.mjs` (phases `dom` and `film`; see `tools/smoke/README.md`) covers the panel, placing,
unchecking, Save edits and the record on disk, Discard and the exit prompt, femoral rim points, window / level, the
keyboard and the stash; the pure modules have unit tests (`test/levels`, `level-projection`, `level-handles`,
`window-level`, `label-record`, `contours`). The human gate (plan Task 15) is the owner's.
