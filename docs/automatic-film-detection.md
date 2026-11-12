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
input; `backend/learned_region.py`). A box at or above score 0.15
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

## When the detector misses a region

If the detector gives no box for a region, or the crops around its box do not agree, that region is searched for as
1.6.1 did: the upper film with the cervical DETR and anatomical HRNET for the neck, the S1 localizer for the lumbar
spine. Films whose regions read from the detector's boxes never run these searches.

## Marking the crops yourself

**Mark crops** on the Analysis toolbar lets a person frame the crops when the detector's are wrong or missing:

- **S1 ENDPLATE**: click the two superior corners of S1. The lumbar crop is framed from them the way the training
  films were cut around S1 (`framing.reframe`), on lumbar and full-spine films.
- **C2–C7**: click the top of C2, then the bottom of C7. The neck crop is the square on that span. A neck mark runs the
  film as full spine.

The stage shows the crops the last run read (dashed) and the crop each mark will give. **RUN WITH MARKS** saves the
marks with the study and segments it again; changing the Region clears them. Marks only frame crops: the landmark
models, crop agreement and the S1 detector still decide the anatomy. The API takes them as `region_hints`
(`{"s1": [[x, y], [x, y]] | null, "neck": [[x, y], [x, y]] | null}` in original-film pixels, `backend/region_hints.py`);
results record them in `qc.region_marks` and `framing.region_sources`.

## Anterior side comes from the landmark models

No orientation is searched or voted on. Every landmark model (anatomical
cervical HRNET, lumbar HRNET, S1 detector) was trained with horizontal flips that
keep anatomical point identities, so it labels the anterior and posterior corners
itself in either facing direction. The first read, on the film as given, decides
the anterior image side: the side the models put the anterior corners on (the
median anterior-minus-posterior x). On a full-spine film the lumbar chain and S1
decide; if the cervical chain faces the other way the result asks for review.

The models are nonetheless more accurate on left-facing films, the orientation
most of their training films had. A film read as right-facing is therefore
mirrored once, read again with the mirrored boxes, and its landmarks mirrored
back to source coordinates; if neither region agrees in the mirrored read the
first read is kept. A selected anterior side chooses the frame directly, with a
review warning when it disagrees with the landmarks. This reads horizontal
facing, not image rotation, AP/lateral projection or patient posture; the input
must still be an upright lateral radiograph.

The femoral U-Net starts from a crop framed on the accepted S1 endplate (10.7
endplate lengths tall and 6.2 wide, S1 about two-thirds down, the size 1.6.1's
crops had), not from the detector-framed lumbar window, which is larger and
shrinks the heads. As before it grows toward any side the mask reaches, at most
twice.

Results retain `qc.film_detection` (route, boxes and scores) and
`framing.orientation` (`source: landmarks`, the side each region implies, whether
they agree, and the first read's side).

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
