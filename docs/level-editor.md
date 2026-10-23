# The vertebral level editor

Edit mode on the Analysis screen is a level editor (2026-10-10). It lists every vertebral level the app knows, lets the
annotator place the levels the model missed, mark the ones that are not on the film, and adjust the rest; it came with
a display-only window / level for the stage, which since the gate feedback of 2026-10-11 works outside edit mode too;
and **Save edits** writes one JSON label record per film, whose job is retraining the segmentation models (since
2026-10-12 **Mark reviewed** writes it too, for a film accepted without an edit). Since 2026-10-13 (gate feedback G7)
each level's label plate sits outside its body on the posterior side and can be dragged. Design:
`docs/design/level-editor/HANDOFF.md`. Plan, decisions D1–D20 and the execution rulings R1–R45:
`docs/superpowers/plans/2026-10-10-level-editor.md`. Contract: the 2026-10-10 amendment of
`docs/superpowers/plans/2026-08-31-00-architecture-contract.md`.

Since 2026-10-15 (annotation editor round 2, decisions E1–E7) a film also has one free-text **comment** in its label
record, a film whose result no model produced reads **Hand-placed**, and an Edited level has its own **REVERT**. Spec
`docs/superpowers/specs/2026-10-15-annotation-editor-round-2-design.md`; plan
`docs/superpowers/plans/2026-10-15-annotation-editor-round-2.md` (rulings P1–P10).

## Entering and leaving

The toolbar's pencil (**Edit segmentation**) enters edit mode. The right panel's tabs, its Export / Mark reviewed row and
the Measurements panel give way to the **Vertebral levels** panel; the header shows `EDITING SEGMENTATION`; the edit bar
across the top of the stage reads `EDITING SEGMENTATION` with a help line, then RESET TO PREDICTION and DONE. Entering
edit mode turns the Pan toggle off (the middle button and the left+right chord still pan). While editing, the toolbar's
Re-run segmentation is disabled, titled `Finish editing before re-running segmentation` (R17), and the stage's
UNSEGMENTED strip or card, with its Run segmentation, is hidden (since 2026-10-21 the strip serves every unsegmented
film; the region bar's own Run segmentation is gone): a run would replace the levels under the editor. The region bar's Region and Orientation selects
are disabled too, titled `Finish editing before changing the region` and `Finish editing before changing the
orientation` (R21): either change clears the study, its levels included.

DONE, the pencil, Escape and Back leave edit mode. With nothing unsaved they leave at once. With unsaved changes the
panel's footer asks `Discard 2 unsaved changes? Saved edits are kept.` with **Save edits**, **Discard** and **Keep
editing** (D7). Going elsewhere through the sidebar keeps the unsaved level state in memory for the session: opening
the study again and pressing Edit brings it back. Deleting the study, re-running it or changing its Region drops it.

## The panel

Sixteen levels in five groups, each group with a tri-state checkbox (every level visible / none / mixed) and a
disclosure button:

| Group | Levels | Geometry |
|---|---|---|
| Cervical `C2–C7` | C2 | inferior endplate (IA, IP) and the body's centroid (D8); either may stand alone (2026-10-21, N1) |
| | C3–C7 | four corners SA, SP, IA, IP, or one endplate alone (2026-10-21, N1); C7 also takes an optional centroid (2026-10-22, N8) |
| Thoracic `T1 · T4` | T1 | superior endplate (anterior, posterior); feeds the T1 slope (2026-10-22) |
| | T4 | centroid; feeds the T4 pelvic angle (2026-10-22) |
| Lumbar `L1–L5` | L1–L5 | four corners, or one endplate alone (2026-10-21, N1) |
| Sacral `S1 ENDPLATE` | S1 | superior endplate |
| Femoral heads `2–4 RIM POINTS` | Head 1, Head 2 | centre and radius fitted from 2–4 rim points |

Each row has a visibility checkbox (`<level> visible on film`), a select button with the level's colour swatch, name
and state badge, and an action: **Place…** for a level with nothing placed, **CLEAR** for a level placed by hand,
**REVERT** for an Edited level (round 2, E3), **CANCEL** while it is being placed. A femoral head always offers Place…
while visible (rim points replace its circle); a head placed by hand shows Place… above CLEAR (R18), and an edited head
Place… above REVERT. The header carries a summary, for example `7 PLACED ·
1 TO PLACE · 8 NOT VISIBLE` (a clause is left out at zero; PLACED is always written); each group carries its own count.
The footer starts with the **comment box** (below), then says whether the training label is complete (`TRAINING LABEL ·
COMPLETE` when every level is placed or marked not visible, else which visible levels still need placing), the unsaved
count, **Discard** and **Save edits**.

**REVERT** (round 2, E3 and E7). An Edited level shows a mono **REVERT** button in its action column (`Revert L4 to the
model's output`). It returns that one level to the model's geometry and its `source` to `model`, so the level reads
Segmented again, the dashed model ghost goes, and the measurements follow through `/measure` like a handle drag. A
Segmented level has nothing to revert, a Manual one has CLEAR, and a level being placed has CANCEL. Whether it changes
the unsaved count depends on the baseline: reverting an unsaved edit lowers it, reverting an edit that was saved raises
it, and Save edits then writes the level `segmented` with its contour again.

**The comment** (round 2, E1). Above the training-label status the footer carries a `COMMENT` box: one free-text
comment per film, not per level, three rows tall, 2,000 characters at most, resizable vertically up to 30% of the
window's height, with the placeholder `Anything the next reader or the trainer should know about this film.`. Typing
counts as one unsaved change while the text differs from the saved one (whitespace at either end ignored), so the
footer's count and Save edits follow each keystroke; the arrows and Escape stay in the box, and Tab moves focus out of
it as it does anywhere else; none of them ever reaches the stage's handle keys. The box is never rebuilt while the
panel changes around it, so its caret and its undo (Ctrl+Z) are kept. Outside edit mode the Analysis panel shows a
saved comment read-only, as a `COMMENT` block under the Export / Mark reviewed row (capped at six lines, scrollable),
and the Find list's search matches it (no column).

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

A film whose run found the wrong region (a cervical film read as lumbar) keeps that region in edit mode: its
measurements read the run's region, so cervical levels placed on it are saved in the label record but measure
nothing. To annotate it as what it is, set the Region on the Analysis screen first (since 1.3.1 that works while a
batch runs over other films; it clears the run's result), then press Edit: the editor opens on the original film
with that region's defaults, the placed levels are measured as that region's, and Save edits makes the film
Hand-placed. No run is needed.

### Unchecking a level

Unchecking keeps the level's geometry in memory for the session, so checking it again restores it; the saved record
omits the geometry of a level that is not visible. Under an unchecked row a note names the measurements it leaves as a
dash, for that film type: unchecking S1 on a lumbar film says `LL, PI, PT, SS, PI–LL, L1PA, T4PA and L5–S1 will show —`.
The note never shows a value. Unchecking the level being placed cancels the placement. Since 2026-10-22 T1 and T4 feed
measurements, so they have notes: unchecking T1 on a cervical or full-spine film says `T1 slope will show —`, and
unchecking T4 on a lumbar or full-spine film says `T4PA will show —` (D12, which said T1 and T4 feed nothing, is
superseded). On a film outside a measurement's family (T1 on a lumbar film, T4 on a cervical one) the point is kept and
drawn but the note stays silent.

Entering edit mode and Save edits re-apply the levels the editor holds hidden or unplaced to the stored geometry when
the two disagree (a re-measure that failed, or a run that overtook the editor), so the stage and the record never keep
different views. The rule runs in both directions, presence only: a level the record holds placed and visible that
the study lacks (a T1 or T4 placed before 1.4.0, or a hand-placed level whose commit was lost) lands on the first Edit,
and the heads are compared by count. Like any other re-measure it clears the film's Reviewed mark: the mark stands
only over numbers the record agrees with.

Outside edit mode the mask overlay colours a level only while the study's geometry holds it, so an unchecked level's
pixels are no longer painted; checking it again or RESET TO PREDICTION brings the colour back (the stored image is
untouched).

### T1 slope and T4 pelvic angle

(2026-10-22, 1.4.0.) The owner asked for the T4 centroid to be kept when it is added, and chose the T1 slope with it ("I
want T1 slope otherwise no point in annotating T1"). A T1 superior endplate and a T4 centroid placed by hand now reach
the study on every film (`geometry.t1_superior`, a pair, anterior then posterior; `geometry.t4_centroid`, a point; each
null when the level is hidden or unplaced), so they survive leaving edit mode and reopening the film, and two measurements
read from them. Both come from the backend's `/measure`; the renderer displays the stored value and computes nothing.

- **T4 pelvic angle (`T4PA`)** is L1PA's construction with the T4 centroid: the angle at the hip axis (the mean of the two
  femoral circle centres) between the line to the T4 centroid and the line to the S1 superior endplate midpoint, unsigned,
  0 to 180 degrees. It belongs to the lumbar family (a lumbar or full-spine film). It needs the T4 centroid, both femoral
  heads and S1.
- **T1 slope (`T1S`)** is the acute angle between the T1 superior endplate line and the image horizontal, unsigned, 0 to 90
  degrees (SS's rule on the T1 pair; the horizontal is the acquisition image's, not rotated to the anatomy). It belongs
  to the cervical family (a cervical or full-spine film). It needs the T1 endplate with two distinct points.

A measurement whose input is missing, or whose film is outside its family, reads a dash in the panel and the grid and
an empty cell in the CSV, never a number. The Measurements panel gains **T4 PELVIC ANGLE** after L1 PELVIC ANGLE and
**T1 SLOPE** after C2–C7 SVA; clicking a row selects its construction (`selectedLevel` `'T4PA'` or `'T1S'`): T4PA draws
the two segments from the hip axis to the T4 centroid and to the S1 midpoint, T1S draws the T1 line with a dashed
horizontal through its midpoint. Outside edit mode the stage draws the T1 endplate as a line in T1's colour and the T4
centroid as a cross in T4's, on every region. The Parameters grid has a **T4PA** column and a **T1 slope** column, and
both CSV exports carry `T4PA` and `T1 slope (deg)`. No model places T1 or T4, so a prediction never produces either
value. A point hidden and then saved is not kept: the record holds the level not visible, so checking it after a reopen
shows it unplaced and Place… puts it back (within one edit session the point is kept while hidden).

## Placing a level

**Place…** starts a placement; the edit bar reads `PLACING L3 · 1 OF 4` with a chip per step, UNDO and CANCEL, and the
help line names the next click. Clicks are in pixels of the stored image and clamp to it, including clicks on the black
surround. Left alone, the clicks fill the steps in the order of the table below.

The step chips choose which point the next click sets (gate feedback G2, 2026-10-11). For a vertebral body, C2, T1, S1
or T4, click a chip and the next click on the film places that point: the IP chip of L3 makes the bar read
`PLACING L3 · 4 OF 4` and the help line ask for the inferior-posterior corner, whatever is placed already. After the
click the next empty step is current again (the one after it, wrapping round to the first), so the points can go in
any order; the level is placed once every step has its point. Clicking the chip of a point already placed and then the
film moves that point (re-placing it). A chip whose dot is filled is placed; the chip on the accent ground is the
current one, and a placed point chosen again shows both. A femoral head's chips only show progress and cannot be
clicked: its rim points are unordered. Once the level is placed, and whenever a placed level is selected, the same
row lists that level's points with every dot filled (since 2026-10-20; see Handles and the keyboard).

**Placing only some of a level's points** (2026-10-21, N1–N2). A vertebral body may be finished with one endplate (SA
and SP, or IA and IP) and C2 with its inferior pair or its centroid alone, when the rest is not on the film: the
shoulders hide C7's inferior endplate, a lumbar film is cut off above L1. Once such a part is whole, the edit bar's
**FINISH**, which sits right after FIT and shows only while a body or C2 is being placed, is enabled
(`Finish with the points placed; the rest are not on this film`). Pressing it stores the part placed and records the
rest as not on this film; the row reads Manual (Edited, if the model had placed the level), and Place… is still
offered. A level with one corner of a pair set cannot finish: place the other corner, or UNDO. A level with every point
set still finishes by itself, as before. T1, S1, T4 and the femoral heads are unchanged. What a partial level measures
follows from the points it has: with C7's superior endplate alone, C2–C7 SVA and C6–C7 segmental lordosis read, and
C2–C7 Cobb and C6–C7 disc angulation show `—`.

**C7's centroid** (2026-10-22, N8–N9). C7 stays a body and carries an optional third part, its centroid, like C2's. The
four corner clicks still finish C7 by themselves; the centroid is a fifth step, CENTROID (`Click the centroid of the C7
body.`), placed during the placement by choosing its chip (the bar reads `PLACING C7 · n OF 5`) or later from the
hollow CENTROID chip or the row's Place…. FINISH accepts a centroid alone, as it does for C2. A whole C7 without its
centroid counts as partial, so its row offers Place…, which resumes at the centroid step. On a full-spine film the
C7–S1 SVA (the plumb) reads from the placed centroid, else from the mean of C7's four corners, else shows `—`; the
model's own C7 centroid is never read back as a placed point (N10).

A click within one pixel of any other point of the placement is ignored (R26), so a double-click counts once and no
corner can land on another (a zero-length endplate is a measurement error); a re-placed point may land beside its own
old position. For a femoral head FIT stays disabled until the fit has a radius of at least 0.5 px (R22: a double-click
would otherwise give a zero radius, which the record cannot hold).

| Kind | Clicks |
|---|---|
| C3–C6, L1–L5 | 4: superior-anterior, superior-posterior, inferior-anterior, inferior-posterior (SA → SP → IA → IP; the chips choose another order), or FINISH after one endplate |
| C7 | the same 4, which finish it by themselves, and an optional fifth, the centroid (CENTROID chip, during the placement or later from the hollow chip or Place…) |
| C2 | 3: inferior-anterior corner, inferior-posterior corner, then the centroid of the body (any order by the chips), or FINISH after the pair or the centroid |
| T1, S1 | 2: the anterior then the posterior corner of the superior endplate (either first by the chips) |
| T4 | 1: the centroid |
| Femoral head | 2–4 rim points: two are read as the ends of a diameter, three or four are fitted; **FIT** finishes from 2, the fourth click finishes by itself (`PLACING FEMORAL HEAD 1 · 2 OF 4 RIM POINTS`); the chips are progress only |

UNDO clears the most recently set point and makes its step the current one, so the next click places it again; it is
disabled until a point is set. A re-placed point is cleared by UNDO, not returned to where it was before (R27).
A left+right chord that begins with a left press while placing is a pan, not a click: the press is taken back and the
placement returns to how it was before it, so a press that re-placed a point gives the point its earlier position back
(a press that finished the placement is kept: the level is placed and can be adjusted).
CANCEL (in the edit bar or on the row) abandons the placement; selecting another row
cancels it too. A level placed by hand can be removed with **CLEAR**, which sends it back to Not placed (D13). A
segmented vertebral level has no Place… or reset of its own: drag its handles, uncheck it, or use Discard or RESET TO
PREDICTION for the whole study. An Edited level can also be returned to the model's output one level at a time with
**REVERT** (round 2, E3).

## Handles and the keyboard

Selecting a row gives that level its handles on the stage (only the selected level has handles) and focuses its first
handle; the help line says `L3 selected — drag a handle to adjust it, or pick a point and nudge it with the arrow
keys.`. Since 2026-10-20 the edit bar also lists the selected level's points as chips, whether the model placed the
level or a hand did: `SA SP IA IP` for a body (C7's `SA SP IA IP CENTROID`, C2's `IA IP CENTROID`, an endplate's
`ANT POST`, a centroid, a head's `P1`–`P4`, one per rim point), each dot in the handle's colour and filled, the focused
handle on the accent ground.
Clicking a chip **arms** that point (since 2026-10-21): the bar reads `PLACING L4 · SA`, the help line names the
click (`Click the superior-anterior corner (SA). Escape keeps the point where it is.`), the chip's dot shows hollow,
and the next click on the film places the point there, clamped to the image and committed through `/measure` like a
drag, the level reading Edited. The focus stays on the point, so the arrow keys nudge it afterwards. Escape, the chip
clicked again, Tab or a press on a handle disarms without moving anything; a left+right chord that begins with the
click pans instead and places nothing, and the click waits while the W/L panel is open. Before 2026-10-20 the chips
showed only while a level was being placed, so a level the model found never listed its points. The row is empty with
nothing selected, for an unplaced or unchecked level, and while the W/L panel is open. A corner handle carries its
corner's colour, a centroid the level's colour, a rim point the trace yellow. A handle is 6 px in radius on screen at 1:1; zoomed in
past 1:1 it grows with the square root of the zoom (8.5 px at 2x, 12 at 4x, 17 at 8x) rather than with the film, so a
zoomed-in cervical body is neither dwarfed by its handles nor left with specks beside the magnified outline (gate
feedback G9, D22); on a film zoomed out below 1:1 it shrinks with it to a floor of 3 px, its outline and its focus
ring in step either way (gate feedback G8, D21); the grab radius is 14 px, or the drawn disc when that is wider. An edited level, when selected, shows the model's original
geometry dashed beneath it. Dragging a handle moves that point, clamped to the image; a femoral head's rim point refits
the circle through its rim (a model head's four rim points are synthesised at −45°, 45°, 135° and 225°, the diagonals, until the first edit);
a drag or nudge that would leave the head under 0.5 px is refused and the handle stays where it was (R25).
Every drag release and nudge is committed through the measure queue, so the measurements and `studies.json` follow at
once (D2).

**A partial level** (2026-10-21, N2). The chips of a body or C2 placed with only some of its points list every point,
the missing ones with a hollow dot; focus, Tab and the arrow keys reach the points that exist only. Clicking a hollow
chip, or the row's **Place…**, resumes the placement for that endplate: the bar reads `PLACING C7 · 3 OF 4`, the placed
points are filled in already, and the next clicks on the film complete the level. UNDO reaches only the new clicks;
CANCEL or Escape leaves the level as it was. **Delete** or **Backspace** with a point of a body or C2 focused removes
that point's endplate (C2's and C7's centroid, the centroid alone), committed through `/measure` like a drag. It is
refused for the level's last part (CLEAR the level, or uncheck it) and for T1, S1, T4 and the heads, and does nothing
while a level is being placed, while the W/L panel is open or while the study's run is in flight. The edit bar's help
line box is narrow, so a long help line wraps inside its box instead of the bar taking a second row.

| Key | In edit mode |
|---|---|
| Tab / Shift+Tab | the next / previous handle across every visible, placed level in panel order, selecting its level (inside the edit bar, the W/L panel and the levels panel Tab moves focus as usual) |
| Arrow keys | nudge the focused handle 1 px; Shift: 10 px |
| Escape | one thing at a time: closes the exit prompt (Keep editing), cancels a placement, closes the W/L panel, then leaves edit mode |
| Delete, Backspace | removes the focused point's endplate on a body or C2 (its centroid on C2 and C7); nothing on the last part, on T1, S1, T4 or a head |

Handles and placement clicks pause while the W/L panel is open. The left+right chord and the middle button pan in every
mode; with the Pan toggle pressed, a primary drag pans even over a handle. The right button alone windows the film in
every mode (see Window / level below); it never places a point. Not built: the handoff's suggested row keys
(↑/↓ between rows, Space to toggle visible, P for Place…), deferred to `docs/ROADMAP.md`.

The stage zooms to 800% (gate feedback G1, 2026-10-11), so a film can be inspected past one screen pixel per image
pixel. Up to 1:1 the overlay (handles, outlines, the dashed ghost, the placement guide and the level plates) keeps its
size on screen at every zoom. Past 1:1 it keeps its size in image pixels and magnifies with the film instead of
shrinking under a pixel, so the lines stay crisp and the plates legible (R28); at 800% on a small film the plates are
correspondingly large. The handles are the one exception: the selected level's discs, their outline, the focus ring and
the placement dots grow past 1:1 with the square root of the zoom instead (G9, D22), so they stay in proportion on a
zoomed-in vertebra, and a handle can be grabbed within 14 px of its point, or anywhere on its disc. The same holds for the hip line
and its markers outside edit mode.

### The level plates

In edit mode every visible, placed level but a femoral head carries a small plate with its name (with the overlay
toggle off, only the selected level keeps its plate). Since gate feedback G7 (2026-10-13, D20) the plate sits
**outside its level, on the posterior side**, so it never covers the anatomy being checked (R43). It is anchored where
it always was — a body's posterior-edge midpoint, C2's IP, an endplate's SP, T4's centroid — 14 px (on screen, up to
1:1) beyond that point, away from the level: each level reads its side from its own shape (a body from its posterior
edge against its middle, C2 from IP against its centroid, an endplate from SP against SA), so on a film facing right
the plates sit left of the posterior edges and on a film facing left right of them. Where a level cannot say (its
points within 1 px of each other across, and always for T4's single point) the film's anterior side decides — the
stored one, then the one chosen for the study, then what the placed levels show — and the plate goes the other way,
rightward when nothing says.

Any plate can be **dragged** (R44): press on it and move; the cursor reads grab over a plate and grabbing during the
drag, and the plate follows the pointer at any zoom. A **double-click** on a plate puts it back. A selected level's
handle under a plate is grabbed first (handles win), so a plate dragged onto a handle is moved again from its other
end. Plates do not move while placing (a click places), with the W/L panel open (a drag windows) or with Pan pressed (a
drag pans); a right press on a plate still windows the film. A plate never leaves the film: however far it is
dragged it stays wholly on the film, pushed inward at the edge (R45). Where the plates were dragged is part of the view, like
zoom, pan and the window: it survives DONE and Edit again, resets when another film is opened from the list (or this
one again), and is never saved — not in `studies.json` and not in the label record. Moving a plate changes no level,
no measurement and nothing unsaved.

## Discard, RESET TO PREDICTION, Save edits

- **Discard** puts every level back to the baseline: the saved label record when one exists, otherwise the state at
  entry, and commits it through `/measure`. The comment returns to the saved text with them (round 2). Toast:
  `Discarded 2 changes.`
- **RESET TO PREDICTION** (D14, in the edit bar) returns the whole study to the model's output: the prediction's own
  numbers on the record (no `/measure`) and every level to the model's geometry. The baseline and the record are
  untouched, so the reset itself can be an unsaved change. It leaves the comment alone: the reset is about geometry.
- **Save edits** writes the label record, comment included, and makes the current levels the baseline and the comment's
  text the saved one. Toast: `Saved 2 edits to the label record.` (a changed comment counts as one of the edits;
  `Saved the label record.` for a first save with nothing changed, which is allowed: it confirms the model's output,
  D10). Save is disabled, with `NOTHING TO SAVE`, only when a record already exists and nothing has changed
  since. Since 2026-10-12 **Mark reviewed** writes that same zero-change record for a film that has none, without
  entering edit mode (D19, under "The label record" below); the zero-change Save edits still works.

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
ip}` plus `centroid` for C2, `{sa, sp}` for T1 and S1, `centroid` for T4; a head's `center`, `radius` and `rim`). Since
1.4.0 (2026-10-21, N4) the `corners` of a body and of C2 are nullable by endplate: `ia` and `ip` are null for a C7
placed from its superior endplate, `sa` and `sp` null together for one placed from its inferior; C2's `corners` is
null with a `centroid`, or the reverse; at least one part is present, and every key is written. Since 2026-10-22
(N11) C7's entry also carries `centroid` and `model_centroid` (each a point or null) and lists `centroid` in
`edited_points`; the model's C7 never has a centroid, so a placed one reads Edited with `model_centroid` null. A C7
record saved before that reads with the centroid null. The schema id is
unchanged, amended 2026-10-21 as R39 amended it for `edits`: a record saved before 1.4.0 validates and reads
unchanged, and a 1.3.x build reads a partial level as Not placed. An
edited level also carries the model's original (`model_corners`, `model_centroid`, `model_circle`); a segmented body
level carries the model's mask outline as `contour` (a polygon of at least three points, R10), null for edited and
manual levels and for films with no mask. Coordinates are pixels of the stored image, origin top-left. Window / level
is never recorded (D11).

**Mark reviewed writes it too** (gate feedback G6, 2026-10-12, D19). The record has two writers: Save edits in edit
mode, and **Mark reviewed** on the Analysis panel for a film that has no record yet. Marking a study reviewed (the
panel's button; there is no bulk mark from the list) writes the zero-change record of the stored state, exactly what
Save edits would write right after entering edit mode with nothing changed, so a film accepted as the model segmented
it becomes a human-accepted label without a trip through edit mode: every level the model placed reads `segmented`,
the rest their film-type default (`not_visible`, or `not_placed` for a visible level the model missed), every
`edited_points` is empty and `edits` counts no edited or manual entry. A level corrected earlier (its geometry stored,
the record never saved) reads `edited`, and a level placed by hand `manual`, as Save edits would write them; a film
placed by hand with no model run gets a record naming model `none`. The toast is `Saved the label record.`, and the
study names the file in `labelFile`, so a later Save edits writes the same file.

- **Unmarking writes nothing**, and deletes nothing. A study that **already has a record** is left alone: Mark reviewed
  never rewrites it, and Save edits keeps owning it. A zero-change Save edits still writes a first record too (D10).
- **Unsaved level edits come first** (R40): while the study's editor is open, or holds unsaved changes left by opening
  another study, Mark reviewed writes no record; those edits are the annotator's to save or discard. The mark applies.
- **The mark never waits for the record** (R41): it is set at once and stays whatever happens to the write. If the
  record cannot be written (the stored image is missing, the file name is refused), the toast says `Marked reviewed.
  The label record could not be written:` and the reason, and the study keeps no `labelFile`; unmark and mark again
  (or Save edits) to try again.
- Nothing is written for a demo study, a film with no result (nothing to label), or a film whose segmentation is
  running.
- **Moving on straight away is safe** (R42, 2026-10-12): for a segmented film the record reads only the stored image,
  from the film on the stage, or from its saved segmentation when the click comes before the film has appeared, and
  never decodes the original, so going Back and opening the next film right after the click does not stop the write.
  A film placed by hand has no stored image but its decoded original, which the stage decodes when the film opens: a
  click before that film has appeared waits for the decode, and opening another film before it ends can still fail
  the write (the toast says so; unmark and mark again).

**Edited points and the edits summary** (gate feedback G5, 2026-10-11, D18). So a folder of records can be counted
without comparing corners, every level and both femoral heads carry `edited_points`, a list of the entry's own geometry
keys, so a script can read `corners[name]` (or `centroid`, `center`, `radius`) directly:

| Kind | Keys, in this order |
|---|---|
| C3–C6, L1–L5 | `sa`, `sp`, `ia`, `ip` (in `corners`) |
| C7 | `sa`, `sp`, `ia`, `ip` (in `corners`), `centroid` (2026-10-22, N11) |
| C2 | `ia`, `ip` (in `corners`), `centroid` |
| T1, S1 | `sa`, `sp` (in `corners`) |
| T4 | `centroid` |
| Femoral head | `center`, `radius` |

A `segmented` entry lists nothing; an `edited` one lists the keys whose value differs from the model's original, by the
same test that decides the state (a difference over 10⁻⁶ px), so an entry is `edited` exactly when its list is not
empty (R38); a `manual` one lists every key it holds a point for (two for a partial body), and an `edited` one
includes the keys of an endplate removed or added (2026-10-21, N7); `not_placed` and `not_visible` list nothing (a hidden level's
geometry is not in the record). A femoral head's rim is how its circle was fitted, not a point of it: moving a rim
point that leaves the centre and radius where they were lists nothing, and the head stays segmented. The record also
carries `edits`, after `complete`: how many of the sixteen entries (fourteen levels and two heads together) are in
each state (`segmented`, `edited`, `manual`, `not_placed`, `not_visible`), `points_moved` (the edited entries' lists
added up) and `points_placed` (the manual entries'). Dragging L3's SA corner and nudging it, for example, saves L3 with
`"edited_points": ["sa"]` and `points_moved` 1. Both fields are always written from this version on; records saved
before it lack them, and the schema accepts them either way (R39, same schema id), so a script should treat a missing
`edited_points` as unknown, not as empty.

**The comment** (annotation editor round 2, E1 and E5). The record carries `comment`, after `edits`: the annotator's
text trimmed, or `null` when it is blank (the box caps new text at 2,000 characters; nothing truncates a record read
from disk). The field is optional in the schema, the way `edits` is (R39), under the same schema id, so a record
saved before it validates and reads as no comment; the app writes it on every save. The study keeps a display copy,
`labelComment` (optional-null, no `STORE_VERSION` bump), set in the same save as `labelFile`, so the Analysis panel
and the Find search read it without opening the file; a re-run, a Region change and Unmark reviewed leave it, since
the record stays, and a delete removes both. A re-run keeps the record, so Edit merges the record's C7 centroid onto
the new model's C7 corners; the point is in image coordinates and stays valid, and nothing commits until an edit.
Opening the editor takes the comment from the record, else from `labelComment`. Mark reviewed's zero-change record
carries the study's current comment, usually none.

**The record travels in bundles** (annotation bundles, 2026-10-15, B1–B9). **Export all** on the Find tab copies each
film's record, its `comment` with it, into that film's folder in the bundle, beside the film and its model result;
**Import bundle…** places it in the other library's `labels/` folder under a name that library chooses
(`labelFileName`, so `-2` on a clash) and sets `labelFile` and `labelComment` on the new study. For a film the library
already holds, a record saved later than the local one is written over it, under the local `labelFile`, and an older or
equal one is skipped (B4). The record itself is unchanged, the same schema id; `saved_at` is what the rule reads. See
[annotation bundles](bundles.md) for what a bundle holds, the identifiers warning (B3) and why to keep the bundle folder
where it is (B5).

## Window / level

Window / level works in every mode, on any film on the stage (gate feedback G3 and G4, 2026-10-11). The toolbar's
window / level button is always shown, and disabled only for a demo study and while there is no film on the stage. It
opens a panel with WIDTH and LEVEL sliders, RESET (the file's default window) and DONE; outside edit mode the panel sits
directly under the toolbar and says how to drag, in edit mode it sits under the edit bar, which then reads `WINDOW /
LEVEL` (`· PLACING PAUSED` during a placement). Once the film is decoded the study chip reads the window, `W 256 · L
128`, in both modes, and follows every change.

- **A drag on the film with the panel open** changes the window: left–right the width, up–down the level, four units
  per screen pixel (dragging left narrows the window, dragging up lowers the level, which brightens the film). Outside
  edit mode it takes the press away from construction selection; in edit mode placement clicks and handles wait. With
  Pan on it windows too: the open panel outranks Pan for the left button (R36), and the middle button or the chord pan.
- **A right-button drag** does the same in every mode with the panel closed or open, with Pan on or off, while placing,
  and on the black surround as on the film (D16), once the pointer has moved 3 px from the press (R37): a right press
  alone does nothing. On a film with no window yet that first move decodes its original, and the window follows the
  drag from the first move after that. A left+right chord still pans, whichever button goes first: the left button
  joining a right-button drag turns it into a pan, and one that joins before the pointer moves decodes nothing.
- **A double right-click** (two right presses within 400 ms and 6 px) restores the film's default window (D17), as
  RESET does.

**It is display only**: measurements, the levels and the label record never change, and nothing is saved (D11). The
window belongs to the view, like the zoom and the pan (D15): it resets where they reset, starting again at the film's
default when another film is opened from the list (or this one again) or the open study is closed, and entering and
leaving edit mode keep it. Going back to the list and returning through the sidebar's open-study card finds the window
that was left, as it finds the zoom and the pan (R29); if the film's decoded original was dropped meanwhile (another
study's run took its place in the image cache), it is decoded again so the window is drawn, and the window is
forgotten if the original can no longer be read (R35). A re-run, a Region change or a delete forgets it.

| Input | Every mode |
|---|---|
| Window / level button | opens and closes the panel |
| Left drag on the film, panel open | windows the film, Pan on or off (R36); selects no construction and places nothing |
| Right drag, on the film or the black surround | windows the film once it moves, panel open or closed (D16, R37) |
| Double right-click | the film's default window (D17) |
| Left + right chord | pans; it takes over a right-button drag |
| Escape | outside edit mode: closes the panel first, then clears the construction; in edit mode: the exit prompt, a placement, the panel, then edit mode |

A right-button drag on a film whose original cannot be decoded says why in a toast (`Window / level is unavailable.`
and the reason, R31) and changes nothing; it does not try the decode again, and opening the panel does (R30).

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

The model's own partial output (a body with one endplate, which the cervical segmentation can return) reads Segmented
since 2026-10-21 and draws as its line; before, it read Not placed and drew nothing.

On an Auto film with no model run the region follows the levels placed on it, read again at every change (R20): C
levels alone make it cervical, L1–L5, S1 or a femoral head alone lumbar, both full spine, nothing lumbar. Placing L3
and then C3 on a failed Auto full-spine film therefore measures it as a full spine, and the record's `film.region`
says `full_spine`; such a film always opens in edit mode as Auto (every level visible, unless its label record says
otherwise), whatever region its last commit wrote. A cervical or full-spine reading with no anterior side known is not measured until one is (R7).

A real film whose result no model produced reads **Hand-placed** (round 2, E2; this closes R24), whether its run failed
first or never ran. The first level committed on a film that had failed clears the failure in the measure queue's own
write, so the film never reads Unsegmented in between: the Failed pill, the header's `Last run failed` note and the
FAILED card go, and Mark reviewed is enabled. The pill is Needs review's tint with Unsegmented's hollow dot (the dot
means no model ran). A Hand-placed film sorts after Needs review and before Segmented, counts as TO REVIEW in the
Studies summary, and Mark reviewed turns it Reviewed; Unmark reviewed returns it to Hand-placed. A later failed re-run
reads Failed again, and a successful re-run makes it a model result again (its record stays; the levels then compare
to the new model). A demo study never reads Hand-placed. A projection that measures nothing (a cervical or full-spine
reading with no anterior side, R7) is not committed, so a film stays Failed until one is. Taking every level off again
(Discard after placing, CLEAR on the only placed level, or unchecking it) leaves the film no result at all: nothing is
sent to `/measure`, and the film returns to what the editor found when Edit was clicked: Failed with the failure it held then, or
Unsegmented when it held none, as a film that never ran or a hand-placed film reopened in a later session (the round's final review, I1).

~~A film whose segmentation failed keeps its Failed status after levels are placed on it by hand: it still sorts first
and blocks Mark reviewed until a run succeeds or the owner decides otherwise (R24, on the human gate's checklist).~~
(Superseded 2026-10-15: R24 is closed by E2, the paragraph above.)

## Demo studies

Demo studies have no film, so Edit stays disabled for them and they can neither place nor window anything. They never
write a label record; the save path refuses with `Demo studies are not exported`.

## Verification

`tools/smoke/smoke-levels.mjs` (phases `dom` and `film`; see `tools/smoke/README.md`) covers the panel, placing,
unchecking, Save edits and the record on disk (its `edited_points` and `edits` included), Discard and the exit prompt, femoral rim points, window / level in edit
mode and (section 17) outside it, with the right-button drag and the double right-click, the keyboard and the stash,
and (section 18) the record Mark reviewed writes for a film with none, and (section 19) where the level plates sit,
their drag, the double-click and their reset, and (2026-10-15, round 2) section 12's failed film, which now reads Failed
before its first commit, Hand-placed after, and Failed again once Discard takes the level off, section 20 (REVERT) and
section 21 (the comment, Ctrl+Z on its first keystroke included) and (2026-10-21, 1.4.0) section 22 (a C2 placed from its
centroid and FINISH, a C7 placed from SA and SP with FINISH disabled after one corner and enabled after two, the hollow
chips, the record's null corners validating against the amended schema, Edit again, the resumed placement, Delete and
its refusal, and, for the C7 centroid (2026-10-22, N8), the hollow CENTROID chip and one click placing it with C7 still
partial, Place… S1 turning the film full spine with `GLOBAL_SVA_PX` read from the placed centroid, Save edits writing
`levels.C7.centroid` with `edited_points` listing it, and Edit again reading it back: section 22 holds 20 checks, 15 for
the partial endplates and 5 for the centroid) and (2026-10-22) section 24 (both heads, T1 and T4 placed by hand on the
full-spine film; the study gaining `t1_superior` and `t4_centroid` and finite `T1S` and `T4PA`; T1S equal to 11.31
degrees for the placed line; the panel's T1 SLOPE and T4 PELVIC ANGLE rows reading a number outside edit mode; unchecking
T4 naming `T4PA` in a note, taking the field and the value off the study and the row to a dash; checking it again
returning them; DONE and a reopen keeping both fields; 12 checks), with the T1 toggle check in section 11 now reading
`t1_superior` null on the study after the commit;
the pure modules have unit tests (`test/levels`, `level-projection`, `level-handles`, `level-labels` for the plates,
`window-level`, `label-record`, `contours`, and `interactions` for the double right-click; `canvas` draws the plates; 1.4.0 adds the partial-level groups in
`levels`, `level-projection`, `persistence`, `level-handles`, `canvas`, `label-record` and the wiring, and
`backend/tests/unit` the partial lumbar bodies, and the C7 centroid adds tests to `levels`, `level-projection`,
`persistence`, `level-handles`, `canvas`, `label-record` and the wiring),
`test/level-editor-wiring.test.js` drives the wiring
through the real store and measure queue (R20) and Mark reviewed's record (`writeReviewRecord`, D19), and
`test/film-window.test.js` drives the view's window
(`renderer/film-window.js`) through the real store. The human gate (plan Task 15) is the owner's.
