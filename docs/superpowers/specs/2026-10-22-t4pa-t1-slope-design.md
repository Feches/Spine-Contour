# T4 centroid kept and drawn, T4 pelvic angle, T1 slope — design

**Status:** BUILT 2026-10-22 (plan Tasks 1–5; unit 1250/1250, `smoke-levels` dom 195/195 with section 24's 13 checks,
`smoke-seeding` 36/36, `smoke-parameters` 58/58, backend unit 657 passed 2 skipped; at the owner's gate, not pushed).
APPROVED 2026-10-22 (the owner: option C of three). Builds on the partial-endplates branch
`claude/partial-endplates-ca5755` ahead of the 1.4.0 gate (the owner did not say when; the planner's assumption, stated).
Fact sheet: `.superpowers/sdd/2026-10-22-t4pa-t1-slope/fact-sheet.md` (line numbers at `5ec39d7`).

## 1. The ask and the ruling

The level editor has placed a T1 superior endplate (two points) and a T4 centroid (one point) since 1.1.0, but both live
only in the level model and the label record: the study's geometry never holds them, no measurement reads them, nothing
draws them outside edit mode. The owner, testing 1.4.0: "can you also include T4 centroid when it is added?" Three
options were shown (A keep and draw; B plus the T4 pelvic angle; C plus the T1 slope); the owner chose **C**: "I want
T1 slope otherwise no point in annotating T1."

Decisions the owner made: **O1** the T4 centroid is kept with the film and drawn outside edit mode; **O2** a **T4
pelvic angle** (T4PA) reads from it, the same construction as L1PA; **O3** a **T1 slope** (T1S) reads from the T1
endplate. Everything below is the planner's, each a one-line reversal.

## 2. Definitions (planner, P1–P3)

- **P1 T4PA** is L1PA's construction with the T4 centroid in place of the L1 centre: the angle at the hip axis (the
  mean of the two femoral circle centres) between the line to the T4 centroid and the line to the S1 superior endplate
  midpoint, in degrees, **unsigned, 0–180**, exactly as the backend computes L1PA (`backend/utils.py:387-393`:
  `degrees(atan2(|cross|, dot))`). Null unless the T4 centroid, both circles and the S1 pair are present and both
  vectors have length.
- **P2 T1S** is the acute angle between the T1 superior endplate line and the image horizontal, in degrees,
  **unsigned, 0–90**, exactly as the backend computes SS (`utils.py:375-377`: `min(|deg(atan2(dy, dx))|, 180 − |…|)`).
  The horizontal is the acquisition image's, as for SS and the global SVA (no rotation to anatomy). Null unless the
  T1 pair is present with two distinct finite points (identical points read null). Cost if the owner wants a sign:
  one line in the backend and the renderer's label.
- **P3 Where they apply.** T4PA is a lumbar-family measurement: lumbar and full-spine films. T1S is a cervical-family
  measurement: cervical and full-spine films. T1 and T4 can be placed on any film (the editor allows it today); on a
  film outside its family the point is kept and drawn but feeds no row (the dependency note says so). The measurement
  keys are **`T4PA`** and **`T1S`**.

## 3. The study geometry (planner, P4–P6)

- **P4** `study.geometry` gains two optional fields on EVERY region: `t1_superior` (`[[x, y], [x, y]]`, anterior then
  posterior, or null) and `t4_centroid` (`[x, y]` or null). The projection writes them whenever the level is visible
  and placed, else null; `projectsLevel('T1' | 'T4')` is true on every region (so a T1 or T4 drag commits, the heal
  compares them, `changedLevels` counts them); `projectionRegion` and `anteriorSideFrom` are unchanged (T1 already
  supplies the side). A projection holding only T1 or T4 is NOT empty: it measures (T1S) or keeps the point.
- **P5** `levelsFromGeometry` reads them back (`T1 → {superior}`, `T4 → {centroid}`), so an editor opened on the
  study shows them, `staleStudyLevels` heals a record/study split on them, and the record keeps its role for the
  model-vs-annotator provenance only (the record's `levels.T1` / `levels.T4` entries are unchanged, schema unchanged).
- **P6** The persistence validator accepts the two fields absent, null or well formed on every region (an older
  study has neither key; the cervical branch's strict nulls for the lumbar fields are not extended to them); a lumbar
  geometry counts them as content (not "empty"); `measurementsHaveLandmarks` ties `T1S` to `t1_superior` and `T4PA` to
  `t4_centroid` + `hip_midpoint` + `s1_superior`. `STORE_VERSION` stays 1 (optional fields, the 1.3.x precedent).
  Bundles and sidecars carry the fields as part of the geometry object (no validator strips unknown keys). A 1.3.x build
  ignores the two keys (its validator never checks unknown keys; its projection drops them on the next commit).

## 4. The backend (planner, P7–P9)

- **P7** A new pure module `backend/thoracic_measurements.py`: `t1_slope_degrees(t1_superior) -> float | None`,
  `t4_pelvic_angle_degrees(t4_centroid, hip_midpoint, s1_superior) -> float | None`, and
  `thoracic_measurements(request_geometry, measured_geometry) -> {"measurements": {"T1S", "T4PA"}, "geometry":
  {"t1_superior", "t4_centroid"}}`, which validates the two request fields (absent or None → None; else finite numbers
  of the right shape; a malformed value raises ValueError → 422; two identical T1 points give a null T1S, never an
  error, so a degenerate pair cannot fail the whole measure) and reads `hip_midpoint`
  and `s1_superior` from the REGION RESULT's geometry (so the hip axis is the one the lumbar path computed). No
  bounds check on either point: they are clamped clicks, and the 2026-10-22 femoral-centre lesson applies.
- **P8** The `/measure` handler applies it after the region dispatch on all three paths: the two measurement keys and
  the two geometry fields are merged into the result, so the lumbar path's rebuilt geometry ECHOES the fields it
  used to drop. `/predict` and `/predict-stream` add the two keys as None and the two fields as None (no model places
  T1 or T4), so every response carries every key ("the backend returns every key, with null"). The region functions
  themselves are unchanged; their exact-equality tests stay; the server-level tests gain the keys.
- **P9** The renderer's measure queue sends a lumbar film `t1_superior` and `t4_centroid` beside the three fields it
  sends today, so a drag of L3 cannot drop a placed T1 from the study (a regression a presence-only test must pin).

## 5. Display (planner, P10–P14)

- **P10 Rows.** The Measurements panel's sagittal section gains **T4 PELVIC ANGLE** after L1 PELVIC ANGLE (lumbar and
  full-spine layouts); the cervical alignment section gains **T1 SLOPE** after C2–C7 SVA (cervical and full-spine
  layouts). A row reads the backend's stored value (`study.measurements.T4PA` / `.T1S`), `—` when absent or when the
  film predates the keys. Clicking a row selects `'T4PA'` / `'T1S'`.
- **P11 `selectedLevel`** gains `'T4PA'` and `'T1S'` (contract amendment). The T4PA construction is L1PA's: two solid
  segments from the hip axis to the T4 centroid and to the S1 midpoint, the label `T4PA 12.3°` at the hip–T4 midpoint.
  The T1S construction is SS's: the solid T1 line plus a dashed horizontal reference through its midpoint, the label
  `T1 slope 25.0°` beyond the anterior corner. T1S needs no S1, so its branches sit ABOVE the canvas's `if (!s1) return null`
  gate. Both switches handle the two values explicitly (the contract's rule).
- **P12 Outside edit mode** the stage draws `t1_superior` as a line in T1's colour and `t4_centroid` as a centroid
  cross in T4's colour (the C2/C7 cross) on every region, labelled while its measurement is selected, as C7's is.
- **P13 Parameters grid.** A core column **T4PA** after L1PA (every layout; null on a cervical film like the other
  sagittal keys) and a cervical-group column **T1 SLOPE** (shown when any visible study is cervical or full spine),
  both sortable, `—` when absent.
- **P14 Dependency notes.** `MEASUREMENT_INPUTS` gains `T4PA` (regions lumbar, full_spine; codes T4, S1, FH1, FH2) and
  `T1S` (regions cervical, full_spine; codes T1), so unchecking T1 or T4 names what goes to `—`, where today it says
  nothing (D12 superseded).

## 6. Exports (planner, P15–P16)

- **P15** The single CSV: `ANGULAR_COLUMNS` gains **`T4PA`** right after `L1PA` (the LL L2-S1… columns shift by one;
  nothing indexes them by number except tests and the smoke literals, which move); the cervical group gains
  **`T1 slope (deg)`** after `C2-C7 SVA (px)`. Absent is the empty cell, as for every measurement. The paired export
  follows the column lists (a delta per column).
- **P16** The smoke literals (`smoke-seeding.mjs` EXPORT_HEADER, `smoke-parameters.mjs` PAIRED_MEASURES, PAIRED_ROW's
  trailing-empty count, the grid's cell index for L1PA, which stays 5) move with the columns.

## 7. Out of scope

A T1–T4 or T4–L1 kyphosis (needs more thoracic points); a signed T1 slope; a cervical-film T4PA or a lumbar-film T1S;
model detection of T1 or T4; the record schema (unchanged); the mask overlay (T1/T4 have no mask).

## 8. Verification

Unit: the backend module (values against hand-computed angles, T4PA equal to L1PA when `t4_centroid` equals
`l1_center`, the mirror invariance, every null case, malformed → ValueError), the server (echo on all three paths,
nulls on predict); the level model and projection (read-back, projects, not empty, stale, dependency notes), the
validator, the measure queue (the lumbar request carries both fields), the panel rows, the canvas (labels and the gate
order), the grid columns and values, the CSV and paired columns. Smoke: `smoke-levels.mjs` section 24 on a full-spine
synthetic film (place T1 and T4; the study gains both fields; the two rows read finite; the dependency note; DONE and
reopen keep them; the T1 toggle check at line ~1680 flips to "projected"); `smoke-seeding.mjs` and
`smoke-parameters.mjs` with their moved literals. Docs: the contract (a 2026-10-22 amendment: measurements, geometry,
`selectedLevel`), `docs/level-editor.md`, HANDOFF (§2, the dependency table, D12), the 1.4.0 release note and CHANGELOG.
