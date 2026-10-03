# Automatic film detection

New image imports and new workspace folders default to **Auto detect**. Existing
studies retain their selected region. Auto checks image anatomy to select cervical,
lumbar or standing/full-spine inference. The saved preference stays Auto while the
result geometry records its resolved region, so subsequent runs still detect the
film. Select a region explicitly to override the choice.

Standing films also default to automatic anterior-side detection. Both horizontal
orientations are checked for consistent lumbar landmark chains and anatomical S1
endpoint order. A uniquely supported orientation is accepted; tied or absent evidence asks
for anterior left/right. A selected side bypasses this comparison. The image and
all results remain in original-image coordinates. This detects horizontal
anterior orientation, not image rotation, AP/lateral projection or patient posture.
The input must still be an upright lateral radiograph.

Cervical-only landmark labels do not establish anatomical anterior direction.
When Auto identifies a cervical film without a selected side, the app asks for
anterior left/right and a rerun. This preserves the sign of cervical SVA. A person
can also override an inconclusive region without changing the source file.

The classifier reuses the existing cervical detector/HRNET and S1/lumbar HRNET
crop searches. Cervical candidates from both image directions are compared in the
source frame, including agreement across the regional endplates. Cervical labels
do not vote on anterior direction. Compatible neck and lumbosacral chains establish a full-spine film;
a single regional chain must occupy sufficient image height before it can be
treated as a regional film. Conflicting or insufficient evidence leaves the choice
to the user. Filenames and image aspect ratio do not determine the region. These
agreement thresholds are conservative software gates, not calibrated confidence
or evidence of clinical accuracy. Review detected anatomy and orientation before
accepting measurements.

Auto processing performs additional crop searches and may take longer than an
explicit region/side. Full-spine prediction reuses the detection searches instead
of repeating them. Existing progress, cancellation and low-memory policies apply.
Results retain `qc.film_detection` and `qc.framing.orientation` provenance.

API callers send `body_part=auto`, `modality=xray`, `view=lateral` and no model
overrides. `/models?body_part=auto` returns empty model choices until a region is
selected. `anterior_side=left|right` is an optional override. Uncertain detection
returns a selection message through the normal error channel; no fabricated
measurement or successful result is saved.

Development checks cover mirrored coordinates, ambiguous/absent evidence,
regional routing, explicit overrides, synchronous/streaming API behavior,
low-memory dispatch, combined measurements, editing, persistence and CSV export.
`node tools/smoke/smoke-global-sva.mjs` exercises the combined desktop workflow
against the real measurement endpoint with clearly marked synthetic geometry.
