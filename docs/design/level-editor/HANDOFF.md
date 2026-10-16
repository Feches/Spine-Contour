# Handoff: vertebral level editor, window / level, label record

**For Claude Code.** Read this file first, then `prototype/Main.dc.html`. The prototype is a working mockup. Its markup is a design-tool format (Design Component: template holes like `{{x}}` plus a `class Component extends DCLogic`), so **port its logic and behaviour, not its markup**. Build the UI with the app's own stylesheet classes and vanilla ES modules, the same way the existing screens are built.

Before writing code, read how edit mode works today and follow its patterns:

- the viewer, its landmark editor and its handle dragging (likely `renderer/components/viewer.js`, `renderer/viewer/canvas.js`)
- the Analysis screen and its right panel (likely `styles/screens/analysis.css` and the measurements panel)
- the checkbox component (likely `renderer/components/checkbox.js`)

Those paths come from the design system's source notes. Confirm them in the repo. Check the **Decisions** section (section 12; it held the open questions until 2026-10-10) before building the parts they affect.

Files in this package:

| File | What it is |
|---|---|
| `HANDOFF.md` | This spec |
| `prototype/Main.dc.html` | Interactive prototype of the Analysis screen in edit mode (behaviour reference) |
| `prototype/Label-record.dc.html` | The label record spec sheet as designed |
| `label-record.schema.json` | JSON Schema (draft 2020-12) for the label record |
| `label-record.example.json` | A valid example record |

---

## 1. Overview

**Problem.** Today, edit mode only lets you adjust levels the model already segmented. If segmentation fails or misses a level, there's no way to add it. There's also no way to say a level isn't on the film (e.g. C2 can't be seen).

**Feature.**

1. **Level editor panel.** It appears **only in edit mode** and replaces the measurements panel in the right panel (`panel-width`, 400px). Leaving edit mode brings the measurements back. It lists every level in five collapsible groups. You can:
   - place levels the model missed by clicking landmarks on the film
   - mark any level not visible
   - adjust levels by dragging handles
2. **Window / level** on the stage. It is display only.
3. **Label record.** Save edits writes one JSON file per film. Its job is retraining the segmentation models later, so it records what the annotator asserted for every level, plus the model's original output wherever it was corrected.

**Out of scope:**

- batch export of label records
- retraining itself
- new measurements from T1 or T4
- remembering window / level between sessions

---

## 2. Level model

### Groups and geometry

| Group | Levels | Geometry stored | Placement |
|---|---|---|---|
| Cervical | C2 | Inferior endplate `ia`, `ip` plus a `centroid` (amended 2026-10-10, D8; schema `$defs/c2`) | 3 clicks: IA, IP, then the centroid |
| Cervical | C3–C7 | 4 corners: `sa`, `sp`, `ia`, `ip` | 4 clicks in order SA → SP → IA → IP |
| Thoracic | T1 | Superior endplate: `sa` (anterior), `sp` (posterior) | 2 clicks: anterior, then posterior |
| Thoracic | T4 | Centroid: one point | 1 click |
| Lumbar | L1–L5 | 4 corners | 4 clicks, SA → SP → IA → IP |
| Sacral | S1 | Superior endplate: `sa`, `sp` | 2 clicks |
| Femoral heads | Head 1, Head 2 | Centre and radius, **fitted** from 2–4 rim points (kept in `rim`) | 2–4 clicks on the rim, then Fit (or automatic on the 4th) |

C1 is deliberately absent: it has no vertebral body. T2, T3 and T5–T12 are deliberately absent. Thoracic only needs the T1 endplate and the T4 centroid.

### States

The state is **derived** from three things: the visibility flag, the current geometry, and the model's output.

| State | Condition | Badge (class · label) | Training use |
|---|---|---|---|
| `segmented` | visible, geometry equals model output | `badge badge-seg` · Segmented | Positive label |
| `edited` | visible, geometry differs from model output | `badge badge-ok` · Edited | Positive label; keeps the model's original as an error pair |
| `manual` | visible, geometry, no model output | `badge badge-ok` · Manual | Positive label; marks a missed level |
| `not_placed` | visible, no geometry | `badge badge-rev` · Not placed | Ignored; film is incomplete |
| `not_visible` | checkbox off | `badge badge-proc` · Not visible | **Negative label** (level is absent) |
| (placing) | placement in progress for this level | `badge badge-rev` · Placing… | — |

`source` records who set the state: `model`, `annotator` or `film_type`.

**Why `not_visible` and `not_placed` must stay separate:** a level the annotator checked and found absent is a negative training label. A level nobody looked at is unlabeled. Mixing the two teaches the model the wrong thing.

### Rules

- **Segmented vertebral levels can't be redone individually.** There is no Reset, re-run or Place… for a level the model segmented. It can only be adjusted by dragging its handles, or unchecked. **Discard** reverts all unsaved edits at once.
- **Manual levels** have **Clear**, which removes the geometry and sends the level back to `not_placed`, so it can be placed again.
- **Edited levels** have **REVERT** (*added 2026-10-15, E3 and E7, round 2; spec section 5*): it returns that one level to the
  model's output (the geometry becomes the model's, `source` goes back to `model`), so the level reads `segmented` again
  and its record entry is indistinguishable from one never touched. It is the one individual undo the first rule above
  did not have: that rule keeps its meaning for Place…, re-run and Reset, and the model's output is still not re-done
  one level at a time. Manual levels have nothing to revert to and keep Clear. An edited femoral head shows Place… and
  REVERT.
- **Femoral heads are the exception.** They always show **Place…** while visible, including segmented ones. Placing rim points replaces the circle. If model output exists, the head becomes `edited` and the model circle is kept in `model_circle`.
- **Unchecking keeps geometry in memory** for the session, so re-checking restores it. The saved record omits geometry for `not_visible`.
- **Film-type defaults:**
  - Groups that match the film type start visible (`source: film_type`).
  - All other groups start `not_visible` (`source: film_type`).
  - Any user toggle sets `source: annotator`.
  - The mapping was an open question; decided 2026-10-10 (D5 and D6 in section 12).

---

## 3. Layout

### Analysis screen in edit mode

```
┌ analysis-header ─────────────────────────────────────────────────────────────┐
│ ‹  lateral_lumbar_001   LUMBAR · STANDING LATERAL            EDITING SEGMENTATION │
├──────────────────────────────────────────────────────┬───────────────────────┤
│ stage (viewer-stage, black)                          │ panel (400, card)     │
│  ┌ chip: name │ W 4096 · L 2048 ┐   ┌ toolbar: WL OV ED │ FILL ┐            │ Vertebral levels      │
│  ┌ edit bar (top 64, inset 14) ─────────────────────────────┐             │ 7 PLACED · 1 TO PLACE │
│  │ PLACING L3 · 3 OF 4  help…  [SA][SP][IA][IP] │ UNDO CANCEL│             │ helper copy           │
│  └──────────────────────────────────────────────────────────┘             ├───────────────────────┤
│                     [ W/L panel when open: top 116, right 14, 300 wide ]  │ groups (scrolls)      │
│                     film + overlays + handles                             ├───────────────────────┤
│  SPINECONTOUR · RESEARCH USE ONLY · NOT FOR CLINICAL USE                  │ status · Discard Save │
└──────────────────────────────────────────────────────┴───────────────────────┘
```

### Panel

| Part | Spec |
|---|---|
| Header block | Padding 14 / 16 / 12. Title "Vertebral levels" in `title-sm` (15px / 650, `ink`). Summary in `mono-section` (`muted`), e.g. `7 PLACED · 1 TO PLACE · 8 NOT VISIBLE`. Helper copy at 12.5px in `body`: "Uncheck a level you can't see on this film. It's saved as not visible, not as missing." Bottom 1px `border`. |
| List | Scrolls (`overflow-y: auto`). Padding 4px 8px 10px. Groups separated by a 1px `border`. |
| Group row | Tri-state checkbox (20px, `radius-check`) plus a disclosure `<button>` (flex 1, min-height 44px, `radius-input`, hover `well`). The button holds the title (14px / 650 `ink`), a range in mono 9.5px `muted` ("C2–C7", "T1 · T4", "L1–L5", "S1 ENDPLATE", "2–4 RIM POINTS"), a spacer, a count in mono 9px `muted` ("4 PLACED · 1 TO PLACE"), and a 12px chevron rotated −90° when closed. |
| Level row | Indented 26px. Contains: checkbox; a select `<button>` (flex 1, min-height 40px) with an 8px swatch in the overlay colour, the name at 14px / 600 and the badge on the right; then a 70px action column. Selected row: `well` background and `accent` name. `not_visible` rows: `muted` name and a hollow swatch with a `border` outline. `not_placed` rows: hollow swatch in the level colour. |
| Row actions | Place… is `btn btn-small` (padding 5×12, 13px). CLEAR and CANCEL are mono 9px text buttons in `accent` with a hover `well`. *Amended 2026-10-15 (E3, spec section 5.3):* REVERT is a third such text button, shown for an Edited level; an edited femoral head stacks Place… above REVERT in the same 70px column (`is-stacked`, ruling R18's layout), and a level being placed shows CANCEL alone. |
| Dependency note | Shown under an unchecked row: 12px in `body`, e.g. "LL and L1–L2 will show —". See section 6. |
| Footer | Top 1px `border`, padding 12 / 16 / 14. Line 1 is the training-label status: a 7px dot (`sage` when complete, `accent` when not), a mono label (`TRAINING LABEL · COMPLETE` / `· INCOMPLETE`) and one sentence. Line 2 is the unsaved count in mono (`2 UNSAVED CHANGES` / `NOTHING TO SAVE`), then **Discard** (`btn btn-small`) and **Save edits** (`btn btn-primary btn-small`). *Amended 2026-10-15 (E1, spec section 3.4):* a comment block sits above line 1: a mono `COMMENT` label (`mono-section`, `muted`), then a three-row `<textarea>` at the panel's full width (2,000 characters, resizable vertically only, capped at 30vh) with the placeholder `Anything the next reader or the trainer should know about this film.`. The exit prompt replaces line 2's row as before and the comment stays above it. |

### Stage chrome

- **Toolbar order:** window / level, overlays, edit (active), divider, FILL slider.
  - *Amended 2026-10-11 (the owner's gate feedback, G3 in the plan; D15):* the window / level tool is shown in every
    mode, not only while editing, disabled for a demo study and while there is no film on the stage; `aria-pressed`
    follows the panel. Its tooltip names the right-button shortcuts (`Window / level — or right-drag on the film;
    double right-click resets`); its accessible name stays `Window / level`.
- **Edit bar** (existing `viewer-editbar`), which holds:
  - the label in `mono-micro` (`stage-accent`)
  - help text at 12px in `stage-body`
  - during placement only: step chips, FIT (femoral only), UNDO and CANCEL as `viewer-tool viewer-tool-text`
- **Step chip:** mono 9px, padding 5×8, `radius-control`, with a 7px dot in the step's handle colour. Its three states:
  - **done:** filled dot, `stage-ink` text
  - **current:** `stage-accent-soft` ground and `stage-accent` text
  - **pending:** outline dot in `stage-line`, `stage-muted` text
  - *Amended 2026-10-11 (the owner's gate feedback, G2 in the plan):* while a body, C2, T1, S1 or T4 is being placed,
    each chip is a button that makes its step the one the next film click sets, in any order; choosing a placed step
    makes the next click re-place it. Only a placed point fills its dot (the prototype's rule; a current, empty step's
    dot is outlined in its colour), so a placed step chosen again shows both the filled dot and the current ground. A
    femoral head's chips stay progress only (its rim points are unordered). Each chip button keeps the look above,
    with a hover ground and a focus ring like the edit bar's other buttons, and is disabled while the study's run is in
    flight.
- **Window / level panel:** a glass bar (`stage-chrome`, 1px `stage-line`, `radius-panel`, 8px blur), absolutely positioned at top 116 and right 14, 300 wide.
  - *Amended 2026-10-11 (G3, D15):* outside edit mode there is no edit bar, so the panel sits directly under the
    toolbar, at top 64 (14 + the 44px toolbar + 6); in edit mode it stays at top 116, under the edit bar. Outside edit
    mode it also carries, above its display-only note, the help line the edit bar would give: "Drag on the film:
    left–right sets width, up–down sets level. With the panel closed, right-drag; double right-click resets."
- **Viewer chip:** the study name, a 1px divider, then the current window in mono 9px `stage-muted`.
  - *Amended 2026-10-11 (G3):* in every mode, whenever the film on the stage has been decoded for window / level.

### Window size

This is a desktop app. Below a 900px window width, the prototype stacks the panel under the stage. Low priority.

---

## 4. Design tokens used

All are in the Spine Contour design system. Use the app's CSS variables, not hex.

| Token | Value (light / dark) | Usage here |
|---|---|---|
| `bg` | #fefdfc / #151312 | Header |
| `card` | #ffffff / #181614 | Panel, checkbox box |
| `well` | #f4eee4 / #282522 | Selected row, hovers |
| `border` | #e5ddd1 / #38342f | Dividers, unchecked checkbox, hollow swatch |
| `ink` | #201814 / #faf7f2 | Titles, level names |
| `body` | #4a4038 / #c9c2b8 | Helper copy, dependency notes |
| `muted` | #8a7e72 / #9a9188 | Mono labels and counts only (never sentences) |
| `accent` | #c1502b / #d45a32 | Checked boxes, selected name, CLEAR / CANCEL, incomplete status |
| `sage` | #6e8577 / #8aa894 | Segmented badge, complete-status dot |
| `stage-*` | fixed | All stage chrome |
| `level-l1`…`level-l5` | rgb | Overlay fill and stroke; see section 5 |
| `femoral` | rgb(98, 210, 111) | Femoral overlay |
| `corner-sa` / `-sp` / `-ia` / `-ip` | #32d4ff / #64e19a / #ffb259 / #fa78d4 | Corner handles and step dots (endplates use `sa` / `sp`) |
| `trace` | #ffe071 | Femoral rim points |
| `opacity-reference` | 0.7 | Dashed model-geometry ghost on an edited level |
| `radius-check` / `radius-input` / `radius-control` / `radius-panel` | 6 / 10 / 8 / 12 | Checkbox / rows / chips / glass panels |
| Type | `title-sm`, `mono-section`, `mono-label`, `mono-micro`, `button-sm` | As noted above |

---

## 5. Stage overlays

- **Fill:** each level in its overlay colour at alpha `116/255 × FILL`, the existing slider. Stroke is the level colour at 0.85, 1.25px. Overlays toggle hides fills and labels, but the selected level stays outlined.
- **Colours:** L1–L5 use `level-l1`…`level-l5`. Every other vertebral level cycles the same five colours, anchored at L1: index = (position − position of L1) mod 5. That gives C2…C7, T1, T4 and S1 a colour. Femoral heads use `femoral`.
- **Selected level:**
  - outline in `stage-accent` at 2px, with handles: 6px radius and a 2px `stage-bg` stroke *Amended 2026-10-15 (gate feedback G8, D21): 6 px at 1:1 and above; below 1:1 the handle, its outline and its focus ring shrink with the film to a floor of 3 px; the grab radius keeps its 14 px floor. Amended 2026-10-16 (gate feedback G9, D22, after a second look): past 1:1 the handle, its outline and its focus ring grow with the square root of the zoom rather than with the film (12 px at 4x, 17 at 8x); the grab radius is 14 px or the drawn disc when wider.*
  - vertebrae: corner handles in `corner-*` colours
  - endplates: `sa` and `sp` handles
  - T4: one handle
  - femoral: rim-point handles in `trace` plus a non-draggable centre dot in `stage-ink`
- **Edited level:** when selected, the model's original geometry is drawn dashed (6 / 5) in `stage-ink` at `opacity-reference`, under the current geometry.
- **Labels on the film:** mono 11px in `canvas-label` on a `canvas-label-plate`, to the right of the posterior edge. The selected level's label is in `stage-accent`. No label on femoral heads. *Amended 2026-10-13 (the owner's gate feedback G7 in the plan; D20, rulings R43 and R44):* the plate sits outside its level on the posterior side, which each level reads from its own geometry (on a film facing right, left of the posterior edge), the film's anterior side deciding only where the level cannot say (T4's centroid); and in edit mode any plate can be dragged, a double-click putting it back. Where the plates were dragged is view state like zoom and pan: reset when another film opens, kept through leaving and entering edit mode, never saved or recorded.
- **Placement in progress:**
  - placed points are drawn with the step colours
  - points are joined by a dashed `stage-accent` line, except for femoral heads
  - femoral heads show a dashed fitted-circle preview and a centre dot once there are 2 or more points
  - the level's existing overlay is hidden while it's being placed

---

## 6. Interactions

| Element | Action | Behaviour |
|---|---|---|
| Group checkbox | Click | If every level is visible, all become `not_visible`; otherwise all become visible. Indeterminate when mixed (set `input.indeterminate`). Sets `source: annotator`. Cancels a placement in progress if that level becomes hidden. |
| Group header | Click | Expand / collapse. On open, groups matching the film type start expanded. |
| Level checkbox | Click | Toggles visible. Sets `source: annotator`. Unchecking the level being placed cancels the placement. |
| Level row | Click | Selects the level and shows its handles on the film. Selecting another level cancels any placement in progress. |
| Place… | Click | Enters placement for that level: the badge becomes Placing… and the edit bar shows the label `PLACING L3 · 1 OF 4`, help text and step chips. Each click on the film adds the next point. Placement **finishes automatically** at 4 corners, 2 endplate points or 1 centroid. Femoral finishes on **FIT** (enabled from 2 points) or automatically at the 4th point. Result: `manual` if there's no model output, otherwise `edited`. *Amended 2026-10-11 (the owner's gate feedback, G2):* for every kind but a femoral head, a click on a step chip chooses which point the next film click sets, in any order, and a placed point chosen again is re-placed; after each click the next empty step is current (wrapping), and the placement finishes when every step is placed. A click within 1 px of any other point of the placement is ignored (R26). Femoral heads are unchanged. |
| UNDO | Click | Removes the last placed point. Disabled at 0 points. *Amended 2026-10-11 (G2):* removes the most recently set point and makes its step the current one; a re-placed point is cleared, not returned to its earlier position (R27). |
| CANCEL | Click | Exits placement with no change. Shown in the edit bar and in the row's action column. |
| CLEAR | Click (manual rows only) | Removes the geometry; the level becomes `not_placed`. |
| REVERT | Click (edited rows only) | *Added 2026-10-15 (E3, E7, spec section 5):* returns the level to the model's geometry and sets `source` back to `model`; the badge reads Segmented, the dashed model ghost goes with it, and the measurements follow through `/measure` like a handle drag. The unsaved count follows the level's baseline (reverting an unsaved edit lowers it; reverting a saved edit raises it). |
| Handle | Drag | Moves that corner or point. A femoral rim point refits the circle live. Disabled while placing or while window / level is open. |
| Save edits | Click | Writes the label record (section 9) and shows the toast "Saved N edits to the label record." Disabled with the visible reason `NOTHING TO SAVE` when there are 0 changes. |
| Discard | Click | Reverts to the last save and cancels any placement. Toast: "Discarded N changes." |
| Comment box | Type | *Added 2026-10-15 (E1, spec section 3.4):* the text is the film's one comment (not per level). It counts as one unsaved change while it differs from the saved text (leading and trailing whitespace ignored), so the footer's count and Save edits follow each keystroke; Discard puts the saved text back; Save edits writes it into the record (section 9). The arrows and Escape stay in the box, and Tab moves focus out of it (ordinary focus movement); none of them ever reaches the stage's handle keys. *Amended 2026-10-15 (the final review, I2):* the box and the footer that holds it are never detached by the panel's rebuilds, so the caret, Ctrl+Z and a composition in progress survive them. |
| Window / level tool | Click | Opens or closes the W/L panel (see below). *Amended 2026-10-11 (G3, D15):* in every mode. |
| Film or its black surround | Right-drag | *Added 2026-10-11 (G4, D16):* windows the film in every mode, panel open or closed, Pan on or off, without opening the panel (see below). A left+right chord still pans. *Amended by the review (R37):* once the pointer has moved 3 px; a right press alone does nothing. |
| Film or its black surround | Double right-click | *Added 2026-10-11 (G4, D17):* the film's default window, as RESET. |

**Unsaved count** is the number of levels whose (visible, geometry) pair differs from the last save. A `source` change alone doesn't count. *(2026-10-15, E1)* A comment that differs from the saved one adds one.

**Training-label status:** "complete" means no visible level lacks geometry. Otherwise the footer names the missing levels in `accent`, e.g. "T1 superior endplate and L3 are visible but not placed — place them or uncheck them."

**Placement help copy**, shown in the edit bar for each step:

- **Vertebra:**
  - Click the superior-anterior corner (SA).
  - Click the superior-posterior corner (SP).
  - Click the inferior-anterior corner (IA).
  - Click the inferior-posterior corner (IP).
- **Endplate (T1, S1):**
  - Click the anterior corner of the T1 superior endplate.
  - Click the posterior corner of the T1 superior endplate.
- **Centroid (T4):**
  - Click the centroid of T4.
- **Femoral head:**
  - Click a point on the rim of the femoral head.
  - Click a second rim point. Two points are read as the ends of a diameter.
  - Fit now, or click up to 2 more rim points for a better fit.
  - Fit now, or click one more rim point.

**Dependency notes** shown when a level is unchecked. The measurements named must render — (U+2014), never 0 or a guess.

| Level | Note |
|---|---|
| C2 | C2–C7 will show — |
| C7 | C2–C7 and SVA will show — |
| L1 | LL and L1–L2 will show — |
| L2 | L1–L2 and L2–L3 will show — |
| L3 | L2–L3 and L3–L4 will show — |
| L4 | L3–L4 and L4–L5 will show — |
| L5 | L4–L5 and L5–S1 will show — |
| S1 | PI, SS, PT, LL, SVA and L5–S1 will show — |
| Femoral head 1 or 2 | PI and PT will show — |
| C3–C6, T1, T4 | none (no current measurement depends on them) |

Check this mapping against the actual measurement code. It should be derived from what each measurement reads, not hard-coded if that can be avoided.

### Window / level

- **Panel contents:** a `WINDOW / LEVEL` label, **RESET** (back to the file's default window), **DONE**, a WIDTH slider and a LEVEL slider with numeric readouts, and the note "Display only. Measurements and the label record don't change."
- **Slider ranges:**
  - WIDTH: 64 to the image's value range
  - LEVEL: 0 to the image's value range
  - The prototype uses 12-bit (0–4096). Use the real bit depth.
- **Dragging on the film while open:**
  - each horizontal px changes width by 4
  - each vertical px changes level by 4
  - dragging up lowers the level, which brightens the film
  - both are clamped
  - the cursor is `all-scroll`
- **While open,** placement clicks and handle drags are paused. If a placement was in progress, the edit bar reads `WINDOW / LEVEL · PLACING PAUSED`, and the placement resumes after Done.
- **Default window:**
  - use the DICOM VOI tags (Window Center / Window Width) when present
  - otherwise use the full range
  - for 8-bit PNG imports, use 0–255
- **Applying it:** use a linear LUT on the **film layer only**: `display = clamp((value − (L − W/2)) / W, 0, 1)`. Apply it to the raw stored values where the DICOM is converted for display, not as a CSS filter on 8-bit output. Overlays, labels and handles are unaffected.
- **Viewer chip** shows `W <w> · L <l>`.

*Amended 2026-10-11 (the owner's gate feedback, G3 and G4 in the plan; decisions D15–D17, rulings R29–R34; and the
review of G3/G4, rulings R35–R37).*

- **In every mode (D15).** Window / level is no longer an edit-mode tool. The tool, the panel, the chip's readout and
  the windowed film layer work outside edit mode too; outside edit mode the mask overlay is drawn over the windowed film
  as over the stored image. A drag on the film with the panel open windows in both modes, and outside edit mode it takes
  the press from construction selection; with Pan on it takes the left button from Pan too (R36; the middle button and
  the chord still pan). Escape closes the panel first in both modes (outside edit mode, before it clears the
  construction).
- **It belongs to the view (D15).** Like zoom and pan, the window resets where zoom and pan reset (the app's FRESH_VIEW:
  another film opened from the list, this one included, or the open study closed); Back and the sidebar's open-study
  card keep it, as they keep the zoom and the pan (R29); entering and leaving edit mode keep it. A re-run, a Region
  change or a delete forgets it. A kept window is always drawn: if the film's decoded original was dropped while it was
  off screen (another study's run took the image cache), it is decoded again when the film comes back, and forgotten if
  it can no longer be (R35). Still display only: never persisted, never in the label record.
- **The right button (D16).** A right-button drag windows the film in every mode, panel open or closed, Pan on or off,
  while placing, on the film or its black surround, with the same rule as the panel's drag (4 per screen pixel,
  horizontal = width, vertical = level, clamped, the `all-scroll` cursor). It does not open the panel. A right press
  alone does nothing: the drag begins once the pointer has moved 3 px (R37); on a film with no window yet that move
  decodes its original, and the drag follows from the first move after that. A left+right chord outranks it and pans,
  and one formed before the pointer moves decodes nothing. A right drag over a film that cannot be decoded says why in
  a toast, once (R31).
- **The double right-click (D17).** Two right presses within 400 ms and 6 px restore the film's default window; the
  second press starts no drag (R32). The panel's RESET stays.

---

## 7. Femoral head fit

Reference implementation: `fitCircle()` in `prototype/Main.dc.html`.

- **2 points:** treated as the ends of a diameter. Centre = midpoint, radius = half the distance.
- **3–4 points:** algebraic least-squares fit (Kåsa). Solve for D, E, F in x² + y² + Dx + Ey + F = 0. Centre = (−D/2, −E/2), radius = √(cx² + cy² − F). With 3 points this is the exact circumcircle.
- **Degenerate** (collinear points, non-finite or absurd radius): fall back to the farthest pair of points as a diameter.
- **Model output with no rim points:** when the user starts dragging, synthesize 4 rim points at ±45° and ±135° on the model circle. Refit from all four.

---

## 8. Coordinates

Store everything in **image pixels of the stored image, origin top-left**. Convert from display or canvas coordinates using the viewer's existing transform (zoom, pan, letterboxing). The prototype's `toVB()` shows the letterbox math for a fixed viewBox, but the app should reuse its own transform.

---

## 9. Label record

- **When:** written on **Save edits**. *Amended 2026-10-12 (the owner's gate feedback G6 in the plan; D19, rulings R40
  and R41):* also on **Mark reviewed** (the Analysis panel's button, outside edit mode) when the study has no record
  yet: the zero-change record of the stored state, exactly what Save edits writes right after entering edit mode with
  nothing changed (every level the model placed `segmented`, no `edited_points`, `edits` counting no edited or manual
  entry, unless the stored geometry already differs from the prediction). Unmarking writes nothing; a study that
  already has a record is left alone; no write while the study's level edits are open or stashed (R40); the mark is
  set first and stands whatever happens to the write, a failure toasting `Marked reviewed. The label record could not
  be written:` and the reason (R41). A zero-change Save edits still writes a first record (D10). The write reads the
  segmented film's stored image only, never decoding its original, so opening the next film straight after the click
  does not stop it (R42, review round 1 of G6).
- **Where:** one file per film, `<study>.label.json`, beside the study's saved results. ~~Location to confirm.~~
  (Decided 2026-10-10, D3 in section 12: `userData/labels/<stem>.label.json`, `-2`, `-3` on a clash, the name kept on
  the study.)
- **Schema:** `label-record.schema.json`.
- **Example:** `label-record.example.json`.

### Fields

| Field | Content |
|---|---|
| `schema` | `"spinecontour.segmentation-label/1"` |
| `study` | Study name (the film's filename stem). **Never the SP-nnnn record id.** |
| `image.file`, `width_px`, `height_px` | The stored image |
| `image.sha256` | Hash of the pixel data. Ties the record to the exact image with no identifiers. |
| `film.region`, `film.view` | Film type. It sets the default group visibility. |
| `model.name`, `model.version` | The model whose output was reviewed |
| `app_version`, `saved_at` | Provenance |
| `complete` | True when no level or femoral head is `not_placed` |
| `edits` | (Added 2026-10-11, D18; optional in the schema, R39, always written by the app) Seven counts over the fourteen levels and two femoral heads together: `segmented`, `edited`, `manual`, `not_placed`, `not_visible` (entries per state), `points_moved` (the `edited` entries' `edited_points` added up) and `points_placed` (the `manual` entries'). Written after `complete`; computed from the entries, so it always agrees with them. |
| `comment` | (Added 2026-10-15, E1, spec section 3.1; optional and nullable in the schema, as `edits` is optional, so a record written before it validates and reads as no comment; always written by the app) The annotator's free-text note on the film: the text trimmed, or `null` when blank. Written after `edits`. The study record keeps a display copy, `labelComment`, written in the same save (E5). Mark reviewed's zero-change record carries the study's current comment. |
| `levels.<code>.state`, `source` | As in section 2 |
| `levels.<code>.edited_points`, `femoral_heads[].edited_points` | (Added 2026-10-11, D18; optional in the schema, R39, always written by the app) The entry's own geometry keys the annotator gave it, in this order: a body `sa`, `sp`, `ia`, `ip`; C2 `ia`, `ip`, `centroid`; T1 and S1 `sa`, `sp`; T4 `centroid`; a femoral head `center`, `radius` (never its rim). `segmented`, `not_placed`, `not_visible`: `[]`. `edited`: the keys whose value differs from the model's by the test that derives the state (10⁻⁶ px), so `edited` exactly when the list is not empty (R38). `manual`: every key of the kind. |
| `levels.<C3–C7, L1–L5>.corners` | `{sa, sp, ia, ip}`. Absent when `not_visible` or `not_placed`. |
| `levels.C2.corners`, `levels.C2.centroid` | `{ia, ip}` (the inferior endplate) and `[x, y]` (amended 2026-10-10, D8: C2 has no superior endplate in the app's geometry; schema `$defs/c2`). Absent when `not_visible` or `not_placed`. |
| `levels.<T1, S1>.corners` | `{sa, sp}`: superior endplate only |
| `levels.T4.centroid` | `[x, y]` |
| `model_corners`, `model_centroid` | The model's original geometry when `edited`; otherwise null |
| `levels.*.contour` | The model's mask outline for `segmented` body levels (C3–C7, L1–L5) only; null for edited and manual levels; C2, T1, T4, S1 and the femoral heads have no contour field (amended 2026-10-10, R10) |
| `femoral_heads[]` | `id`, `state`, `source`, `center`, `radius`, `rim` (2–4 points, or null for unedited model output), `model_circle` (when edited) |

The design artboard doesn't show `model_centroid` or `model_circle`. The schema adds them for parity with `model_corners`.

### Rules for the record

- **Demo studies** (DEMO pill): never write a label record. Save stays available for the session, but show "Demo studies are not exported" as visible text by the button.
- **Training use:**
  - `segmented`, `edited` and `manual` are positive labels
  - `not_visible` is a negative label
  - `not_placed` is ignored
  - `edited` gives a (model, corrected) pair for measuring model error per level
  - (2026-10-11, D18) `edited_points` says which points of an `edited` pair moved, and `edits` how many entries
    needed correcting across the film, so a folder of records can be counted without comparing corners
  - (2026-10-12, D19) a film accepted without an edit gets its record from Mark reviewed, or from a zero-change Save
    edits; both write the same record, its placed levels `segmented` with no edited points

---

## 10. Accessibility

- **Checkboxes:** real `<input type="checkbox">` elements (the app's checkbox component).
  - Level labels: "<level> visible on film".
  - Group labels: "<Group>: mark every level visible" or "… not visible".
  - Mixed state uses `indeterminate`.
- **Buttons:**
  - Group header: `<button aria-expanded>`.
  - Level select: `<button aria-pressed>`.
  - Icon-only toolbar buttons have `aria-label` and `title` (e.g. "Window / level").
- **Focus:** 2px `accent` outline at 2px offset, −2px inside rows. Never removed.
- **Keyboard:**
  - Escape cancels a placement or closes W/L.
  - The landmark editor's existing Tab-to-cycle-handles and arrow-nudge (Shift = 10px) apply to the new handles.
  - Suggested, not in the prototype: ↑/↓ between level rows, Space to toggle visible, P to Place….
- **Screen readers:** toasts use `role="status"`. State is never colour alone: every badge carries its word.

---

## 11. Edge cases

- **Segmentation failed entirely:** every level is `not_placed` (in film-type groups) or `not_visible`. The panel works the same, and every level can be placed by hand. This is the main case the feature exists for. *Amended 2026-10-15 (E2, E6; R24 closed; spec section 4):* the first level committed on such a film clears its failure in the measure queue's own write, and the film then reads **Hand-placed**, not Failed: it counts as TO REVIEW, sorts after Needs review, and Mark reviewed is enabled and turns it Reviewed. A later failed re-run reads Failed again. *Amended 2026-10-15 (the final review, I1):* taking every level off again (Discard after placing, CLEAR on the only placed level, unchecking it) sends nothing to `/measure` and returns the film to what the editor found at Edit: Failed with the failure it held then, or Unsegmented when it held none (a film that never ran, or a hand-placed film reopened in a later session, whose failure was cleared at its earlier first commit).
- **Unchecking during placement:** the placement is cancelled.
- **Placement clicks outside the image:** clamp to the image bounds.
- **Two femoral points that are very close:** the radius is tiny. Accept it, since the user can refit.
- **Leaving edit mode with unsaved changes:** decided 2026-10-10 (D7 in section 12): an inline prompt in the panel footer.
- **Motion:** chevron 0.2s; hover 0.15s; toast `riseIn` 0.18s. Nothing else animates. The film and data never animate.

---

## 12. Decisions (2026-10-10)

The open questions this section held were answered by the owner on 2026-10-10, together with the questions the code
forced. They are the Decisions table of `docs/superpowers/plans/2026-10-10-level-editor.md`, which wins over this spec
where the two differ; that plan's Ledger also records the execution rulings R1–R45. Built on branch
`worktree-level-editor` and released as v1.1.0 (2026-10-12); the user doc is `docs/level-editor.md`. D15–D17 were
added on 2026-10-11 from the owner's gate feedback (G3, G4), D18 the same day from G5, D19 on 2026-10-12 from G6, and
D20 on 2026-10-13 from G7 (branch `claude/level-plates`).

| # | Question | Decision |
|---|---|---|
| D1 | Window / level pixel source | A new backend endpoint `POST /decode` returns the original file's decoded pixels (16-bit), value range and DICOM window defaults; the renderer applies the LUT on the film layer only. No CSS filter, no LUT on the stored 8-bit PNG. The same decode gives a failed film something to display. |
| D2 | Save semantics | Drags keep auto-committing geometry through `/measure` to studies.json. **Save edits** writes the label record and resets the baseline. **Discard** restores the baseline (the saved record when one exists, else the state at entry). |
| D3 | Label record location (old question 2) | `userData/labels/<stem>.label.json`, stem = the film's filename without its extension; a second film with the same stem gets `-2`, the third `-3`; the chosen name is stored on the study as `labelFile`. |
| D4 | Branch base | A new worktree off `origin/main` (v1.0.17), independent of the held similar-cases branch. |
| D5 | Film type → default visible groups (old question 1) | lumbar → Lumbar, Sacral, Femoral heads; cervical → Cervical plus **T1 only** (T4 starts not visible); full_spine → all five groups; everything else `not_visible` with `source: film_type`. |
| D6 | A film with region Auto and no result | Every one of the sixteen levels starts visible (not placed) until the annotator unchecks it. |
| D7 | Leaving edit mode with unsaved changes (old question 3) | An inline prompt in the panel footer: `Discard 2 unsaved changes? Saved edits are kept.` with **Save edits**, **Discard**, **Keep editing**; it covers DONE, the Edit button, Escape and Back. Sidebar navigation keeps the unsaved level state in memory for the session. |
| D8 | C2 | An **inferior endplate (IA, IP) plus a centroid**, in the panel, the handles and the record: three clicks to place. The schema gained a `c2` definition (sections 2 and 9 amended). |
| D9 | Overlay colours | The shipped `LEVEL_RGB` is kept (C2 purple, C3–C7 = L1–L5's colours) and extended with T1, T4 and S1; the L1-anchored cycle of the prototype is not adopted. |
| D10 | Save with zero changes | The first save is allowed: Save is disabled with `NOTHING TO SAVE` only when a record already exists and nothing has changed since. |
| D11 | Window / level persistence (old question 4) | Not persisted and not recorded: display only, reset when the study is reopened, not in the label record. (Its reset on entering edit mode is superseded by D15.) |
| D12 | T1 and T4 (old question 5) | Both are placeable levels in the Thoracic group and written to the record. No measurement reads them today, so they have no dependency note; T1 slope and T4 angles are out of scope. |
| D13 | Clear (old question 6) | Kept on manual levels. |
| D14 | RESET TO PREDICTION | Kept in the edit bar as the whole-study revert to the model's output, beside Discard. |
| D15 | Window / level outside edit mode (2026-10-11, gate feedback G3) | Available outside edit mode too. The window belongs to the view, like zoom and pan: it resets where zoom and pan reset (FRESH_VIEW: another film opened from the list, or the open study closed); Back and the sidebar's return keep it, as they keep zoom and pan; entering and leaving edit mode keeps it. Still never persisted, never in the record. (Wording amended 2026-10-11 by the review of G3/G4 to follow the behaviour; R29.) |
| D16 | A right-button drag (2026-10-11, gate feedback G4) | Windows the film in every mode, without opening the panel: horizontal = width, vertical = level, four units per screen pixel. The chip shows the live W and L. |
| D17 | A double right-click (2026-10-11, gate feedback G4) | Resets the window to the film's default; the panel's RESET stays. |
| D18 | Which points an edit moved (2026-10-11, gate feedback G5) | Every level and femoral head in the record lists `edited_points` (its own geometry keys: what moved when `edited`, every key when `manual`, none otherwise; `edited` exactly when the list is not empty, R38), and the record carries a top-level `edits` summary (entries per state, `points_moved`, `points_placed`). Both additive: the schema keeps its id and accepts records saved before them (R39). Section 9 amended. |
| D19 | Accepting a film without editing it (2026-10-12, gate feedback G6) | **Mark reviewed** also writes the film's label record when the study has none yet: the zero-change record of the stored state, what Save edits writes right after entering edit mode with nothing changed. Unmarking writes nothing; a study with a record is left alone (Save edits keeps owning it); not while the study's level edits are open or stashed (R40); the mark never waits for or depends on the write (R41). A zero-change Save edits still works (D10). Section 9 amended. |
| D20 | Where the level plates sit, and moving them (2026-10-13, gate feedback G7) | Each level's label plate sits outside its level on the posterior side, read from the level's own geometry and, only where it cannot say, from the film's anterior side (R43); any plate can be dragged in edit mode and a double-click puts it back (R44). The offsets are view state, like zoom, pan and the window: reset when another film opens, kept through leaving and entering edit mode, never persisted, never in the label record. Section 5's labels amended. |

## 12a. Decisions (2026-10-15)

Made with the owner on 2026-10-15 for the second annotation round; the spec of record is
`docs/superpowers/specs/2026-10-15-annotation-editor-round-2-design.md` ("the round-2 spec"), whose decisions
E1–E7 are listed here one line each. Built on branch `worktree-annotation-round-2` (worktree
`.claude/worktrees/annotation-round-2`, off `origin/main` @ `06c8cdd`, v1.1.1); plan
`docs/superpowers/plans/2026-10-15-annotation-editor-round-2.md` (rulings P1–P10).

| # | Decision |
|---|---|
| E1 | **One comment per film, in the record, shown outside edit mode too** (owner). A free-text comment typed in the panel and written into the label record as `comment`; the Analysis panel shows it read-only. Not per level. Sections 3, 6 and 9 amended. |
| E2 | **A status of its own, Hand-placed, for any annotator result** (owner). A real study whose result no model produced reads `Hand-placed`, whether its run failed first or never ran; the first hand-placed commit clears the failure; it sorts after Needs review, counts as TO REVIEW, and Mark reviewed turns it Reviewed. Section 11 amended. |
| E3 | **REVERT next to the level** (owner). A per-level control in the row's action column that returns an Edited level to the model's geometry. Sections 2, 3 and 6 amended. |
| E4 | **Two specs, the editor first** (owner). The round-2 spec, then the bundle spec (`2026-10-15-annotation-bundle-export-import-design.md`), which carries the comment across libraries. |
| E5 | **The comment lives twice** (planner). The record's `comment` is the training copy; the study's `labelComment` is the display copy, written by the same save, the record first. |
| E6 | **The failure is cleared in the measure queue's own write** (planner), not by a second `setState`: the commit carries `clearFailure` and the write that puts the measurements on the record nulls `processingError` and `processingErrorAt` in the same patch. |
| E7 | **REVERT sets `source` back to `model`** (planner), so a reverted level's record entry is indistinguishable from one never touched. |

**R24 is closed** (the open ruling of the level editor plan's Task 15 and ROADMAP section 8: should a hand-placed film that
had failed keep reading Failed?): the owner's answer is E2, a status of its own, with the failure cleared by the first
hand-placed commit (E6).

---

## 13. Acceptance criteria

- [ ] The panel appears only in edit mode, replaces Measurements, and Measurements return on exit.
- [ ] All five groups are shown: C2–C7, T1 and T4, L1–L5, S1, and femoral heads 1–2. Each has a tri-state group checkbox and expand / collapse.
- [ ] Every level shows the correct derived state badge, and the summary and group counts update live.
- [ ] A level the model missed can be placed with the right number of clicks. UNDO and CANCEL work.
- [ ] Segmented vertebral levels have no Place, Reset or re-run action. Handles and the checkbox still work.
- [ ] Femoral heads: Place… is always available while visible. 2–4 rim points give a fitted circle, with FIT from 2 points. Dragging a rim point refits.
- [ ] An edited level shows the model's original geometry dashed when selected.
- [ ] Unchecking a level makes its dependent measurements render — and shows the dependency note.
- [ ] Window / level works by sliders and by drag, and Reset returns to the file default. Only the film changes, and edits are paused while it's open.
- [ ] Save edits writes a record that validates against `label-record.schema.json`, in image-pixel coordinates. Demo studies never write one.
- [ ] Unsaved count, Discard and the training-label status behave as in section 6.
- [ ] Keyboard and focus behaviour is as in section 10. It works in both light and dark themes, and the stage stays dark in both.
