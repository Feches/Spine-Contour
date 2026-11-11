# Automatic film detection

New image imports and new workspace folders default to **Auto detect**. Existing
studies retain their selected region. Auto checks image anatomy to select cervical,
lumbar or standing/full-spine inference. The saved preference stays Auto while the
result geometry records its resolved region, so subsequent runs still detect the
film. Select a region explicitly to override the choice.

**Correcting a wrong detection** (2026-10-20, issue #68). On the Analysis screen the region bar's Region select
overrides Auto detect for the open film: choosing Cervical on a film the run labelled lumbar clears that result,
lists the cervical parameters in the Measurements panel and offers Run segmentation in the UNSEGMENTED strip along the
bottom of the stage (since 2026-10-21 the strip serves every region; before, a cervical, full-spine or Auto detect
film had the button on the region bar and a lumbar film in the strip); the Orientation select does the same for the
anterior side. The two selects are locked only during the film's own turn (its run in flight, or next up
in the running batch), in edit mode and for a demo study, each with a tooltip that says so. A run or batch over other
films leaves them live, so a library's wrong detections can be corrected while its batch runs; Run segmentation
itself still waits for the batch or the current run to finish, and its tooltip says which. Before 1.3.1 any run or
batch anywhere disabled both selects with no tooltip.

To annotate such a film by hand instead of running it again, set its Region first, then press Edit segmentation: the
film opens on its original with that region's levels visible (C2–C7 and T1 for cervical), the levels you place are
measured as that region's, and Save edits makes the film Hand-placed. Entering edit mode without changing the Region
keeps the run's region: the model's wrong levels are there to uncheck, and cervical levels placed on a film the run
called lumbar are saved in the label record but measure nothing, since a lumbar film measures L1–S1 and the heads.

## How Auto routes a film (detector, then models)

Auto runs the bundled region detector once on the original film
(`backend/onnx/crop_detector.onnx`, a two-class YOLO26-s, 1024 px letterboxed
input; `backend/learned_region.py`). A box at or above score 0.25
(`learned_region.PRESENT_SCORE`) counts as that region being on the film:

| Boxes found | Route |
|---|---|
| cervical and lumbar | standing / full spine |
| cervical only | cervical |
| lumbar only | lumbar |
| neither | the app asks for a region; nothing is saved |

The detector score is a routing gate, not calibrated confidence. There is no
separate view classifier and no landmark-based region search.

**Full spine** (`backend/models/full_spine.py`) reuses the same boxes. The
anatomical cervical HRNET reads four square crops around the cervical box (1.3×
its longer side, small shifts), and the lumbar HRNET reads the seven shifted and
scaled crops around the lumbar box framed with the BUU-LSPINE margins (0.45 box
heights each side, 0.256 above, 0.498 below; each crop then extended 15% upward).
Crop agreement (`select_consensus`) gates each region as before, and the S1
detector must corroborate the lumbar HRNET's S1.

**Cervical** and **lumbar** films use their existing regional pipelines unchanged:
the anatomical cervical HRNET on the whole film, and the lumbar framing search
(when Crop localizer is On).

## Anterior side comes from the landmark models

The film is never mirrored and no orientation is searched or voted on. Every
landmark model (anatomical cervical HRNET, lumbar HRNET, S1 detector) was trained
with horizontal flips that keep anatomical point identities, so it labels the
anterior and posterior corners itself in either facing direction. The anterior
image side is the side the models put the anterior corners on (the median
anterior-minus-posterior x). On a full-spine film the lumbar chain and S1 decide
the side; if the cervical chain faces the other way the result asks for review.
A selected anterior side only relabels the result for signed measurements, with
a review warning when it disagrees with the landmarks. This reads horizontal
facing, not image rotation, AP/lateral projection or patient posture; the input
must still be an upright lateral radiograph.

Results retain `qc.film_detection` (route, boxes and scores) and
`qc.framing.orientation` (`source: landmarks`, the side each region implies, and
whether they agree).

API callers send `body_part=auto`, `modality=xray`, `view=lateral` and no model
overrides. `anterior_side=left|right` is an optional override. A film with no
detected region returns a selection message through the normal error channel;
no fabricated measurement or successful result is saved.

Before this change (through 1.6.1) Auto ran mirrored crop searches in both
horizontal orientations and accepted a side only when exactly one orientation had
a lumbar chain. Because the models label anatomy the same way in either
orientation, both usually passed or both failed, and those films stopped with
"Automatic standing-film orientation is uncertain". The experimental whole-film
view classifier (Settings → Automatic view selection) is removed with it.
