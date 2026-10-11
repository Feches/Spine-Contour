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
| Row actions | Place… is `btn btn-small` (padding 5×12, 13px). CLEAR and CANCEL are mono 9px text buttons in `accent` with a hover `well`. |
| Dependency note | Shown under an unchecked row: 12px in `body`, e.g. "LL and L1–L2 will show —". See section 6. |
| Footer | Top 1px `border`, padding 12 / 16 / 14. Line 1 is the training-label status: a 7px dot (`sage` when complete, `accent` when not), a mono label (`TRAINING LABEL · COMPLETE` / `· INCOMPLETE`) and one sentence. Line 2 is the unsaved count in mono (`2 UNSAVED CHANGES` / `NOTHING TO SAVE`), then **Discard** (`btn btn-small`) and **Save edits** (`btn btn-primary btn-small`). |

### Stage chrome

- **Toolbar order:** window / level, overlays, edit (active), divider, FILL slider.
- **Edit bar** (existing `viewer-editbar`), which holds:
  - the label in `mono-micro` (`stage-accent`)
  - help text at 12px in `stage-body`
  - during placement only: step chips, FIT (femoral only), UNDO and CANCEL as `viewer-tool viewer-tool-text`
- **Step chip:** mono 9px, padding 5×8, `radius-control`, with a 7px dot in the step's handle colour. Its three states:
  - **done:** filled dot, `stage-ink` text
  - **current:** `stage-accent-soft` ground and `stage-accent` text
  - **pending:** outline dot in `stage-line`, `stage-muted` text
- **Window / level panel:** a glass bar (`stage-chrome`, 1px `stage-line`, `radius-panel`, 8px blur), absolutely positioned at top 116 and right 14, 300 wide.
- **Viewer chip:** the study name, a 1px divider, then the current window in mono 9px `stage-muted`.

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
  - outline in `stage-accent` at 2px, with handles: 6px radius and a 2px `stage-bg` stroke
  - vertebrae: corner handles in `corner-*` colours
  - endplates: `sa` and `sp` handles
  - T4: one handle
  - femoral: rim-point handles in `trace` plus a non-draggable centre dot in `stage-ink`
- **Edited level:** when selected, the model's original geometry is drawn dashed (6 / 5) in `stage-ink` at `opacity-reference`, under the current geometry.
- **Labels on the film:** mono 11px in `canvas-label` on a `canvas-label-plate`, to the right of the posterior edge. The selected level's label is in `stage-accent`. No label on femoral heads.
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
| Place… | Click | Enters placement for that level: the badge becomes Placing… and the edit bar shows the label `PLACING L3 · 1 OF 4`, help text and step chips. Each click on the film adds the next point. Placement **finishes automatically** at 4 corners, 2 endplate points or 1 centroid. Femoral finishes on **FIT** (enabled from 2 points) or automatically at the 4th point. Result: `manual` if there's no model output, otherwise `edited`. |
| UNDO | Click | Removes the last placed point. Disabled at 0 points. |
| CANCEL | Click | Exits placement with no change. Shown in the edit bar and in the row's action column. |
| CLEAR | Click (manual rows only) | Removes the geometry; the level becomes `not_placed`. |
| Handle | Drag | Moves that corner or point. A femoral rim point refits the circle live. Disabled while placing or while window / level is open. |
| Save edits | Click | Writes the label record (section 9) and shows the toast "Saved N edits to the label record." Disabled with the visible reason `NOTHING TO SAVE` when there are 0 changes. |
| Discard | Click | Reverts to the last save and cancels any placement. Toast: "Discarded N changes." |
| Window / level tool | Click | Opens or closes the W/L panel (see below). |

**Unsaved count** is the number of levels whose (visible, geometry) pair differs from the last save. A `source` change alone doesn't count.

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

- **When:** written on **Save edits**.
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
| `levels.<code>.state`, `source` | As in section 2 |
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

- **Segmentation failed entirely:** every level is `not_placed` (in film-type groups) or `not_visible`. The panel works the same, and every level can be placed by hand. This is the main case the feature exists for.
- **Unchecking during placement:** the placement is cancelled.
- **Placement clicks outside the image:** clamp to the image bounds.
- **Two femoral points that are very close:** the radius is tiny. Accept it, since the user can refit.
- **Leaving edit mode with unsaved changes:** decided 2026-10-10 (D7 in section 12): an inline prompt in the panel footer.
- **Motion:** chevron 0.2s; hover 0.15s; toast `riseIn` 0.18s. Nothing else animates. The film and data never animate.

---

## 12. Decisions (2026-10-10)

The open questions this section held were answered by the owner on 2026-10-10, together with the questions the code
forced. They are the Decisions table of `docs/superpowers/plans/2026-10-10-level-editor.md`, which wins over this spec
where the two differ; that plan's Ledger also records the execution rulings R1–R24. Built on branch
`worktree-level-editor`; the user doc is `docs/level-editor.md`.

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
| D11 | Window / level persistence (old question 4) | Not persisted and not recorded: display only, reset when the study is reopened, not in the label record. |
| D12 | T1 and T4 (old question 5) | Both are placeable levels in the Thoracic group and written to the record. No measurement reads them today, so they have no dependency note; T1 slope and T4 angles are out of scope. |
| D13 | Clear (old question 6) | Kept on manual levels. |
| D14 | RESET TO PREDICTION | Kept in the edit bar as the whole-study revert to the model's output, beside Discard. |

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
