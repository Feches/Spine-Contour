# Placing only some of a level's points (partial endplates) — design

**Status:** BUILT 2026-10-22 on claude/partial-endplates-ca5755 (plan Tasks 1–17; unit 1224/1224, smoke-levels dom 182/182,
pytest unit 651 passed 2 skipped), at the owner's gate, not pushed. The owner
ruled N1–N4 on 2026-10-21, all the recommended column ("N1 N2 N3 N4 all recommended"). Branch `claude/partial-endplates-ca5755` (worktree `.claude/worktrees/studies-ui-updates-bb040d`),
cut from `claude/segmentation-points-display-2df267` @ `7e85035` (1.3.1, at the owner's gate, unpushed). Released as
its own version after 1.3.1: **1.4.0**, since the label record's shape changes (as 1.1.0 and 1.2.0 did for the
record).

**Builds on:** the vertebral level editor (handoff `docs/design/level-editor/HANDOFF.md`, plan
`plans/2026-10-10-level-editor.md`, user doc `docs/level-editor.md`), the armed chips of 1.3.1
(`renderer/viewer/level-handles.js` `selectedLevelChips` / `aimedStep`, `renderer/level-editor.js` `aimHandle` /
`placeAimedPoint`) and the label record (`docs/design/level-editor/label-record.schema.json`,
`spinecontour.segmentation-label/1`, amended under R39's precedent). The binding contract is
`plans/2026-08-31-00-architecture-contract.md`.

---

## 1. Problem

The owner, 2026-10-21: "if you can only see the superior endplate of C7 you can place C7 SA, SP but not IA and IP."
On a lateral cervical film the shoulders hide C7's inferior endplate; on a lumbar film L1's superior endplate is often
above the top edge; C2's inferior endplate can be hidden while its body is plain. Today a level is all of its points
or nothing, from the placement flow to the record:

- **The placement** finishes a body only at four clicks (`levels.js` `finishedGeometry`: every step set). There is no
  way to stop at two. CANCEL throws the two away.
- **The level model** cannot hold a body with one endplate: `levelsFromGeometry` reads a cervical body whose HRNet
  output has one endplate null (which `persistence.js` already accepts) as Not placed, so the model's own partial
  output is invisible in the editor and the canvas's `shapeParts` draws nothing for it.
- **The projection** (`level-projection.js`) writes full quadrilaterals only, and `anteriorSideFrom` reads a body's
  superior pair only.
- **The record** requires all four corners (`corners4`), and a Manual body must list four `edited_points`.
- **Lumbar needs the backend:** `POST /measure` (`backend/utils.py` `spinopelvic_measurements_from_geometry`) raises
  on any lumbar body missing `superior`, `inferior` or `quadrilateral`, on a lumbar and on a full-spine film alike
  (`global_sva_measurements_from_geometry` passes the lumbar bodies through it); LL reads each body's superior
  endplate, L1PA the L1 quadrilateral's mean.

The measurements already follow what exists on the cervical side: `cervical_measurements_from_geometry` and the
renderer's `cervicalMeasurements` compute Cobb from the C2 and C7 inferior endplates and SVA from the C2 centroid and
the C7 posterosuperior corner, each only when its inputs are there; the segmental angles and disc heights
(`segmental.js`, `disc-heights.js`) test each endplate on its own. So a C7 with its superior endplate alone should give
SVA and C6–C7 segmental lordosis, and a dash for Cobb and for C6–C7 disc angulation, with no new measurement code.

## 2. The four rulings (the owner's), with the recommendation first

The example in every row is the owner's C7: its superior endplate visible, its inferior hidden by the shoulders.

| # | Decision | Recommended | What the annotator sees, C7 superior only | Alternative | What the annotator sees then |
|---|---|---|---|---|---|
| N1 | **Granularity** | **Per endplate.** A body is SA+SP, IA+IP or both; C2 is its inferior pair, its centroid or both; T1, S1, T4 and the femoral heads stay all-or-nothing. | Chips `SA SP` filled, `IA IP` hollow; the film shows the one line; C2–C7 SVA reads, Cobb and C6–C7 angulation show `—`; the record holds `corners: {sa, sp, ia: null, ip: null}`. | **Per single point.** Any subset of the four corners. | A lone SA is allowed: chips `SA` filled, three hollow; nothing measures until SP joins it; the record holds one corner and three nulls, and the model is taught a corner with no endplate. Cheaper to build (no "part" notion), but every consumer must then handle a half endplate. |
| N2 | **Marking it** | **FINISH while placing, Delete on a focused point, hollow chips to complete later.** Placing C7: after SA and SP the edit bar's **FINISH** is enabled (as FIT is for a head); pressing it stores the superior endplate and records the inferior as not placed on this film. On a placed level, **Delete** (or Backspace) with a point focused removes that point's endplate; clicking a **hollow chip** (or the row's **Place…**) resumes the placement for the missing endplate, two clicks. | `PLACING C7 · 3 OF 4` with FINISH live after the second click; after FINISH the bar lists `SA SP` filled and `IA IP` hollow; the row reads Manual with Place… still offered. | **A checkbox per point** in the panel's rows (four boxes under each body, three under C2); unticked points are skipped by the placement and cleared on a placed level. | Sixty-two boxes in the panel; the placement needs the boxes set first; no FINISH, no Delete. Explicit, but it moves the decision off the film and into the list. |
| N3 | **Films** | **Lumbar in, same release**, with the backend change: `spinopelvic_measurements_from_geometry` accepts a body with one endplate (`quadrilateral` null); LL for that body reads `—` when its superior endplate is missing, L1PA `—` for a partial L1. Cervical and full-spine films need no backend change. | On a cervical film as above; on a lumbar film an L1 with its inferior endplate alone draws the line, LL (`L1–S1`) reads `—`, `L2–S1` onward read, L1PA `—`. | **Cervical bodies only** (C2–C7 on cervical and full-spine films); FINISH stays disabled for L1–L5 with the tooltip `Lumbar bodies need all four corners`, and lumbar goes back to the roadmap. | The same on a cervical film; on a lumbar film nothing changes. Avoids touching `backend/utils.py`, whose lumbar validator is upstream code, at the price of the commonest lumbar case (L1 cut off at the top). |
| N4 | **The record** | **Under the `/1` id with a dated amendment** (R39's precedent): `corners` entries nullable, both corners of an endplate together; `edited_points` lists the keys the annotator placed, moved or removed, never a key the model placed and the annotator left; `model_corners` nullable the same way. | `"C7": {"state": "manual", "edited_points": ["sa", "sp"], "corners": {"sa": [..], "sp": [..], "ia": null, "ip": null}, ...}`; every record saved before 1.4.0 still validates and reads the same. | **A `/2` schema id** with the same shape. | Explicit to a consumer, but every earlier record fails a strict `/2` reader and a folder of records then carries two ids for one shape; the renderer would read both. |

The rest of this document is the design under the recommended column. Where the alternative would change it, the
section says so in one line.

## 3. The level model (`renderer/data/levels.js`)

N5 (planner). **A "part" is what can be present or absent.** A body has two parts, `superior` and `inferior` (steps
SA, SP and IA, IP); C2 has two, `inferior` (IA, IP) and `centroid`; an endplate, a centroid and a head have one. The
geometry shapes become:

```
BodyGeometry   {superior: [SA, SP] | null, inferior: [IA, IP] | null}   at least one pair
C2Geometry     {inferior: [IA, IP] | null, centroid: Pt | null}         at least one
```

T1, S1, T4 and the heads are unchanged. A part is whole or null, never half: a geometry holding one corner of a pair
is not a geometry (`levelsFromGeometry` and `recordLevels` read it as null, as they do a bad record today). Under N1's
alternative (per point) the pairs would hold nulls per slot instead, and every rule below that says "endplate" would
say "point".

- `levelsFromGeometry`: a body with one pair is read (`bodyFrom` takes `superior` or `inferior` a pair, the other
  null); C2 with its inferior pair and no centroid, or its centroid and no inferior pair, is read. So a model result
  that placed one endplate (HRNet can) now reads **Segmented**, drawn as its line, instead of Not placed and invisible.
- `geometryFromPoints(code, points, imageSize)` takes the placement's slot array, nulls included: a part whose slots
  are all set is written, a part whose slots are all empty is null, a part half set makes the whole result null.
- `finishedGeometry` / `canFinishPlacing`: a body or C2 may finish when **no part is half set and at least one part is
  whole**; it still finishes by itself when every slot is set (the fourth click, C2's third). FINISH is the way to
  finish early. A head keeps FIT (`fitFrom` 2); T1, S1 and T4 cannot finish early (one part).
- `resumePlacing(editor, code, step)` (new): a `Placing` for a visible, partially placed body or C2, its set slots
  pre-filled from the level's geometry, `history` empty (UNDO cannot clear a point the level already has), `current`
  the given step or else the first empty slot. The level's own entry keeps its geometry until the placement finishes
  or is cancelled, as a head's does while it is re-placed. Finishing writes the completed geometry with
  `source: 'annotator'`.
- `removePart(editor, code, handle)` (new): the part the focused handle belongs to becomes null. Refused (the editor
  returned unchanged) when it is the level's last whole part (CLEAR or the checkbox are the ways to empty a level),
  for a one-part kind (T1, S1, T4, the heads), while a placement runs for that level, and for a handle the level does
  not have. The focus moves to the level's first remaining handle. `source` becomes `annotator`.
- `selectLevel` focuses the level's first **existing** handle (`levelHandles(...)[0]`), not a fixed first name, so a
  body without its superior pair focuses IA.
- `changedPoints` / `levelState` / `sameGeometry`: unchanged in code, new in meaning. `near(null, point)` is false and
  `near(undefined, undefined)` is true, so a removed endplate lists its two keys as changed (the annotator gave them
  null), a completed one lists the two it added, and a partial level equal to the model's partial output reads
  Segmented. R38 holds: `edited` exactly when the list is not empty. `pointKeys` is unchanged.
- `placementSteps`, `placingLabel`, `placingHelp`, `trainingStatus` (a partial level is placed: it counts as PLACED and
  the label is complete), `summaryText`, `dependencyNote` and the film-type defaults are unchanged.

## 4. Placing, the chips, the keys (`renderer/components/viewer.js`, `renderer/viewer/level-handles.js`, `renderer/level-editor.js`)

N6 (planner). **FINISH.** A fourth edit-bar button beside FIT, UNDO and CANCEL, shown while a body or C2 is being
placed (FIT shows for a head, as now; neither shows for T1, S1 or T4), enabled exactly when `canFinishPlacing` is true
and the placement is not whole (then it has already finished by itself), disabled while this study's run is in flight
and while the W/L panel is open, like the rest. Title `Finish with the points placed; the rest are not on this film`.
Pressing it calls the wiring's existing `fitPlacing(imageSize)`, which serves both buttons (the wiring already imports
the level model's `finishPlacing`, so that name is taken).

- **The chips of a placed level** (`selectedLevelChips`): one per **step** of the kind, not per existing handle, each
  carrying `placed: true|false`. A placed point's chip is as in 1.3.1 (filled dot; a click arms it). A missing point's
  chip has a **hollow dot** (the `is-pending` look of a placement's empty step), title `Place IA: click here, then on
  the film`; a click calls `resumePlacing(code, step)`, so the bar switches to the placement's own chips reading
  `PLACING C7 · 3 OF 4`, the two set points filled, IA current, and the next two film clicks complete the level
  (FINISH, CANCEL and Escape leave it as it was; UNDO clears only the new clicks). The focused handle, Tab order,
  `aimedStep` and the arrow keys read `levelHandles`, which lists existing points only, so a missing point can neither
  be focused nor armed, and never breaks the Tab cycle.
- **The row's Place…** (`components/level-editor.js`): offered for a partially placed body or C2 as it is for a head
  (`canPlace` adds "a body or C2 with a part missing"), stacked above CLEAR or REVERT the way a head's is (R18). It
  resumes the placement at the first missing step.
- **Delete and Backspace** (`handleKeyDown`): with a point of a body or C2 focused (by Tab, a chip click or a handle
  press, armed or not), and nothing being placed, the W/L panel closed and no run in flight, they call
  `removeFocusedPart()` → `removePart`, committed like a drag release (`{ edit: true }`, so it goes through `/measure`).
  Refused cases do nothing, and the keys stay dead for T1, S1, T4 and the heads, as the doc's key table says today.
  The help line gains nothing; the chip's title for a placed point says `… Delete removes its endplate` for a body or
  C2.
- **The help line** while a resumed placement runs is the step's own (`Click the inferior-anterior corner (IA).`).
  After FINISH the help reads as for any selected level.

Under N2's alternative (checkboxes) this section is replaced by a per-point box in each body and C2 row and a
placement that skips unticked steps; FINISH, Delete and the hollow chips are not built.

## 5. The canvas and the plates (`renderer/viewer/canvas.js`, `renderer/viewer/level-labels.js`, `renderer/viewer/interactions.js`)

- `shapeParts`: a body with both pairs is the closed quadrilateral with an area, as now; with one pair it is **that
  endplate as a line** (no area, no fill), as T1 and S1 draw. C2 is its inferior line and/or its centroid dot, each
  when present. The ghost of an edited level draws the model's parts the same way, so a level whose inferior endplate
  was removed shows the model's whole body dashed under its remaining line.
- Outside edit mode (`drawDynamicLayer`): the outline of a cervical or lumbar body is `quadrilateral ?? inferior ??
  superior`, closed only when it is the quadrilateral. The C2 and C7 centroid crosses already skip a null centroid.
  The constructions for Cobb and SVA are drawn only when their measurement is finite, which already implies their
  endplates exist.
- The plate (`labelAnchor`, `labelPlacement`): a body's anchor is the posterior-edge midpoint when both pairs exist,
  else the **posterior corner of the one endplate**, and its side is read from that endplate (SP against SA, or IP
  against IA), as an endplate level's is. C2 without its inferior pair anchors on its centroid with the film's side,
  as T4 does; C2 without its centroid reads its side from the inferior pair's x spread (IP against IA).
- `vertebraAt` (the click outside edit mode, lumbar only): a body without a quadrilateral is hit within the S1 rule's
  radius of its one endplate line.

## 6. The projection and the validators (`renderer/data/level-projection.js`, `renderer/data/persistence.js`)

- `quadrilateral(body)` returns null unless both pairs exist. `cervicalPart` and `lumbarPart` write `superior`,
  `inferior` and `quadrilateral` as they are, nulls included; `c7_centroid` is the mean of C7's quadrilateral and so
  null for a partial C7 (C7–S1 SVA then reads `—`: the plumb needs the whole body); `l1_center` likewise null for a
  partial L1; C2 is written into `vertebrae` only when it has its inferior pair (as `{superior: null, inferior,
  quadrilateral: null}`), and `c2_centroid` is null when it has no centroid, so a C2 placed from its centroid alone
  leaves `vertebrae` without a C2 entry.
- `anteriorSideFrom` reads a level's first existing pair (a body: superior, else inferior; C2: inferior, else skipped),
  so a cervical film placed by hand from a C7 inferior endplate alone still gets its side.
- `projectionIsEmpty`, `projectsLevel`, `regionFollowsLevels` and the stored-side rule are unchanged.
- `persistence.js` `isValidGeometry`: the cervical and full-spine branches already accept a cervical body with one
  endplate null. The lumbar branch (and the full-spine branch's lumbar bodies) accepts `superior`, `inferior` and
  `quadrilateral` each null, with at least one endplate a pair and `quadrilateral` a quadrilateral exactly when both
  are; `l1_center` is required exactly when L1 has its quadrilateral, else null. `measurementsHaveLandmarks` ties
  `LL[<level>-S1]` to that level's superior endplate, not its presence. **No `STORE_VERSION` bump**: the cervical
  shape is already nullable, and a 1.3.x build reading a 1.4.0 library with a partial lumbar body rejects that
  study's geometry with its existing warning and shows the film unsegmented, which is degradation, not corruption.
  Under N3's alternative the lumbar branch is untouched.

## 7. The backend (`backend/utils.py`), under N3's recommendation

`spinopelvic_measurements_from_geometry`: for each lumbar body, `superior` and `inferior` may each be None (a pair
must still be two distinct finite points when present), `quadrilateral` may be None and is required to be (4, 2) only
when both pairs are present; a body with neither pair is still an error. `endplates[level]` is taken only from a
present superior endplate, so `LL["<level>-S1"]` stays None for a body without one; `l1_center` is derived from L1's
quadrilateral only when it has one, else stays None (so L1PA stays None), and an explicit `l1_center` is still
validated. `qc.coverage.available` lists a partial body as it does a whole one. `global_sva_measurements_from_geometry`
passes bodies through and needs no change beyond its existing per-key validation. The model path
(`spinopelvic_measurements`, `vertebral_quadrilaterals`) is untouched. Tests: `backend/tests/unit/test_utils.py` and
`test_partial_measurements.py` gain the partial-body cases (superior only, inferior only, neither, a half pair, L1
without its quadrilateral).

## 8. The record and its schema (`renderer/data/label-record.js`, `docs/design/level-editor/label-record.schema.json`)

N7 (planner). **Nullable corners, by endplate.** For a body, `corners` keeps all four keys and `model_corners` the
same shape; each of `sa`, `sp`, `ia`, `ip` is a point or null, `sa` and `sp` null together, `ia` and `ip` null
together, and at least one pair present. For C2, `corners.ia` and `corners.ip` null together and `centroid` nullable,
at least one of the two present. `edited_points` lists, for `manual`, every key the entry holds a point for (so a
partial manual body lists two); for `edited`, every key whose value differs from the model's, a removed endplate's keys
included (the annotator gave them null) and an added endplate's keys included, by the same test as before (R38
holds); `segmented`, `not_placed` and `not_visible` list nothing. `edits.points_placed` and `points_moved` follow.
`complete` is unchanged (a partial level is placed). `contour` is unchanged (a segmented body's mask outline, whole or
not).

The schema keeps its id, `spinecontour.segmentation-label/1`, with a dated line in its description, as R39 did:
`corners4` and `c2corners` become nullable per key with the pair rules written as `if`/`then`/`else` on the keys and
an `anyOf` for "at least one" (the test checker `test/fixtures/schema-check.js` already supports every keyword
needed); the `manual` rule's `minItems` drops to 1 for a body, C2 and (unchanged) the rest, the exact list being the
prose rule above, pinned by tests rather than by the schema. Every record saved before 1.4.0 validates unchanged and
reads unchanged (a `/1` record with four points is a special case of the new shape). `recordLevels` reads nullable
corners into the editor's shapes; a record holding half a pair reads that level's geometry as null, as a bad record
does today. `label-record.example.json` is unchanged (a lumbar film, whole); a second example beside it,
`label-record.partial.example.json`, is a cervical film with C7's superior endplate alone and C2's centroid alone,
and both examples are validated by `test/label-record.test.js`.

Under N4's alternative the same shape ships under `spinecontour.segmentation-label/2`; `LABEL_SCHEMA` becomes `/2`,
`recordLevels` accepts both ids, and the schema file is copied, not amended.

## 9. Measurements, compatibility, release

- **What reads, what dashes.** With C7's superior endplate alone: C2–C7 SVA reads (C2 centroid to the C7
  posterosuperior corner), C6–C7 segmental lordosis reads (both superior endplates), C2–C7 Cobb, C6–C7 disc
  angulation and C7–S1 SVA read `—`. With C2's centroid alone: SVA reads, Cobb and C2–C3 read `—`. With L1's inferior
  endplate alone: `L1–S1` LL and L1PA read `—`, L1–L2 disc angulation reads, `L2–S1` onward read. None of this is new
  measurement code: each value already tests its own inputs. The Measurements panel renders a null as `—`
  (non-negotiable).
- **Compatibility.** A 1.3.x build reading a 1.4.0 record: a level with null corners reads as Not placed (its
  `geometryOf` needs the pairs), nothing crashes. A 1.4.0 build reading any earlier record: unchanged. `studies.json`:
  a 1.3.x build shows a film with a partial lumbar body as unsegmented with a console warning (section 6). The CSV
  exports and bundles are unchanged. The installer bundles the backend, so the lumbar validator ships with the app.
- **Release 1.4.0**: `package.json`, `renderer/data/version.js`, `CHANGELOG.md`, `docs/releases/1.4.0.md`, the README
  link; `docs/level-editor.md` (the placing table, FINISH, the hollow chips, Delete in the key table, the record
  section), HANDOFF §2, §6, §9 amended and a §12b with N1–N7; ROADMAP §9 marked built.

## 10. Verification

- Unit (`node --test test/*.test.js`): `levels` (reading and writing partial geometry, `geometryFromPoints` with nulls,
  the finish rule for every kind, `resumePlacing`, `removePart` and its refusals, the first existing handle,
  `changedPoints` over removed and added endplates), `level-projection` (nullable corners through both regions,
  `c7_centroid` and `l1_center` null, the side from an inferior pair), `level-handles` (handles of a partial body, the
  chips with hollow entries, `aimedStep` never naming a missing point, the Tab order), `canvas` (the line of a partial
  body, C2's dot alone, the outside-edit outline, the plate anchor), `label-record` (write and read of partial
  entries, `edited_points` for manual, edited-by-removal and edited-by-addition, the amended schema accepting the new
  example and every earlier record, rejecting a half pair), `level-editor-wiring` (FINISH, Delete and a resumed
  placement committed through the real store and the measure queue), `persistence` (the lumbar validator, if N3 is
  in); `pytest backend/tests/unit` for section 7.
- Smoke (`tools/smoke/smoke-levels.mjs`, phase `dom`, a new section 22 on a fresh copy of the hand-placed fixture):
  Place… C2, the CENTROID chip (`PLACING C2 · 3 OF 3`), one film click, FINISH; Place… C7, SA and SP, FINISH enabled
  after the second click, pressed; the row reads Manual, the bar lists `SA SP` filled and `IA IP` hollow; the study's
  region reads cervical, `C2C7_SVA_PX` finite and `C2C7_COBB` null after `/measure` settles; Save edits writes a record
  whose C7 holds `ia: null`, `ip: null` and `edited_points ["sa", "sp"]`, C2 `corners {ia: null, ip: null}` and
  `edited_points ["centroid"]`, validating against the amended schema; Escape and Edit again reload it intact; the
  hollow IA chip resumes the placement at `3 OF 4`, two clicks complete C7 (Cobb still null: C2's inferior is
  missing); Tab to C7's IA and Delete make it partial again, committed; Delete on the last part is refused. Section 12
  and the rest are unchanged.
- The human gate is the owner's, on a real cervical film with C7's inferior hidden.

## 11. Out of scope

A measurement that reads a partial body's one endplate as the other (never), the model training on partial labels (the
record carries what is needed), per-point granularity (N1's alternative), a superior endplate for C2 (D8 stands), and
the roadmap's other level-editor items (§8).

## 12. Addendum, 2026-10-22: a placeable C7 centroid (N8–N11)

The owner, before testing the build above: "I also want to add C7 centroid selection". Today the C7 centroid is never
placed: the projection writes `c7_centroid` as the mean of C7's four corners for a full-spine film, so the C7–S1
plumb (`GLOBAL_SVA`) reads a dash whenever C7 is partial, and the model's own C7 centroid is replaced by that mean on
the first commit. (A second ask the same day, a per-group display filter for the overlay in edit mode, was withdrawn:
the overlay toggle had been off.)

N8 (owner, 2026-10-22, from three options). **C7 gains a third, optional part, its centroid, like C2's.** A fifth chip,
CENTROID, placed by clicking the hollow chip (or the row's Place…) or during the placement by choosing its step; drawn
as a dot; saved in the record; nudged, armed and removed like any other part. When it is not placed and C7 is whole,
the mean of the corners stands in, as today. The alternatives were a required centroid (five clicks for every C7 and a
model C7 reading incomplete) and a centroid-only C7 (losing the endplates Cobb and SVA need).

N9 (planner). **C7 stays a body.** A body may carry an optional centroid part, and only C7 does (`CENTROID_BODIES =
['C7']` in `levels.js`). Every site that switches on `kindOf(code) === 'body'` keeps working; the sites that enumerate
a body's parts, steps, handles or record keys consult the code: `partsOf('C7')` is `superior` [0, 1], `inferior`
[2, 3], `centroid` [4]; `placementSteps('C7')` has five steps, the fifth `CENTROID`, `Click the centroid of the C7
body.`, colour key `level`; `pointKeys('C7')` is `sa sp ia ip centroid`; the handles and chips are `SA SP IA IP
CENTROID` (`stepHandlesFor(code)` replaces the kind-keyed `STEP_HANDLES` lookup); `firstHandle` prefers SA, then IA,
then CENTROID. C7's canonical shape is `{superior, inferior, centroid}` with the centroid null when absent, written by
every writer (`levelsFromGeometry`, `geometryFromPoints`, `removePart`, `recordLevels`, `revertLevel`'s copy); the
other bodies keep two keys. **The placement finishes by itself when both endplates are whole** (the four corners, as
today), the centroid set or not; FINISH is enabled when at least one part is whole and none is half set, so a C7 of
its centroid alone is allowed, as C2's is (the plumb needs nothing else). `placingLabel` reads `PLACING C7 · n OF 5`.
Delete on a focused CENTROID removes it (refused when it is the last part). The chips' Delete suffix for CENTROID is
`; Delete removes it`, as C2's.

N10 (planner). **The centroid lives in the level model and the label record; it is never read back from
`study.geometry`.** The projection writes `c7_centroid` (full-spine films; the cervical projection keeps omitting the
key) as the placed centroid when the part is present, else the mean of the quadrilateral when C7 is whole, else null;
`levelsFromGeometry` reads C7's pairs from the study and leaves the centroid null, so a derived mean never becomes a
"placed" point and never goes stale under a corner drag. `openEditor` merges the saved record's C7 centroid into the
study's C7 when the study gives the corners (the rule `assignHeads` already applies to a head's rim); a C7 the record
holds and the study does not comes whole from the record, as today. The model's C7 therefore always has `centroid:
null`: a C7 whose centroid the annotator placed reads Edited with `edited_points ["centroid"]` and `model_centroid`
null. The persistence validator (`c7_centroid` a nullable point on a full-spine film), the backend and the renderer's
`globalSvaMeasurements` need no change: `GLOBAL_SVA` reads the centroid it is given.

N11 (planner). **The record.** `levels.C7` takes a new `$defs/c7`: the `vertebra` fields plus `centroid` and
`model_centroid` (each a point or null) and `edited_points` from `editedPointsC7` (`sa sp ia ip centroid`); when
placed, at least one part present (a pair, or the centroid); `contour` as a body's; `model_centroid` a point only when
the model had one (never today). Same schema id, a second dated line in the description; every record saved before
this addendum validates unchanged (a C7 without the `centroid` key is read as centroid null).

The canvas draws C7's centroid as a dot in C7's colour (C2's radius, `dot: true`) beside its lines or quadrilateral;
outside edit mode the existing C7 cross already draws `c7_centroid` on a full-spine film. The plate of a C7 with only
its centroid anchors on the centroid with the film's side, as T4's and a centroid-only C2's do. `trainingStatus`,
`dependencyNote` and the panel's rows are unchanged, except that C7's row offers Place… while its centroid is unplaced,
a whole C7 included, since Place… resumes at the centroid step (an optional part never makes the label incomplete).

Verification adds: unit tests for the five-step placement and its four-click finish, the centroid-alone finish, the
parts and handles of C7, the projection's three `c7_centroid` cases, the record's `c7` entry both ways and the schema,
`openEditor`'s merge; smoke section 22 continues on the partial film: the hollow CENTROID chip and one click place it
(C7 still partial), Place… S1 turns the film full spine and `GLOBAL_SVA_PX` reads from the placed centroid, Save edits
writes `levels.C7.centroid` and `edited_points` listing it, Edit again reads it back. Docs: `docs/level-editor.md`'s C7
row and chips, HANDOFF §2's C7 row and §12b N8–N11, the 1.4.0 release notes and CHANGELOG (the same release). Built as
round 2 of the plan (Tasks 11–15).
