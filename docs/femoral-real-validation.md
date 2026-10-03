# Femoral crop regression and real-image validation

Standing-film processing chooses its lumbar crop by agreement between vertebral
landmarks. The same crop was passed unchanged to the femoral model. On real
full-spine radiographs it could cut through a head that was fully visible in the
source image. Restoring that mask into a full-image canvas hid the artificial
boundary from the fitter's source-edge check, allowing a truncated fit to receive
high confidence.

The femoral stage now expands the sides reached by its mask by one quarter of the
current crop dimension, clipped to the original image. It runs at most two extra
inference passes. Vertebral landmarks retain their original crop and coordinates.
A mask still reaching the final crop boundary receives confidence at most 0.5 and
an explicit review warning. Empty or rejected masks remain unavailable; the fit
acceptance thresholds and model weights have not changed.

`qc.femoral` records `initial_crop_window`, `crop_window`, `crop_expansions`, and
`touches_crop_edge`. Windows in the API response are in original-image coordinates,
including anterior-right films. The existing `touches_frame_edge` field continues
to describe the physical image boundary.

## Running on real images

`tools/validate_femoral_real.py` calls the complete prediction pipeline, including
real model localization and segmentation. Supply a local JSON list:

```json
[
  {
    "path": "/absolute/path/to/real-radiograph.jpg",
    "region": "full_spine",
    "anterior_side": "right",
    "expect_heads": true
  }
]
```

```sh
.venv/bin/python tools/validate_femoral_real.py /path/to/cases.json \
  --output artifacts/femoral-validation
```

Use `lumbar`, `full_spine`, or `auto` for region. Omit `anterior_side` to test
automatic standing-film orientation. `expect_heads` is optional; without it a
completed prediction is an execution check only, not a head-detection assertion.
The local output includes source hashes, predictions, masks, overlays, and QC.
Keep these files local; they can contain medical images and identifying text.
No source images or predictions are committed with this change.

The focused integration test also uses real images and actual ONNX inference.
Set `SPINE_CONTOUR_REAL_FEMORAL_CASES` to a JSON manifest whose cases contain
`path`, `mirror`, `expect_expansion`, `expect_truncated`, `expect_heads`, and an
optional `window` recorded from real model localization. The window uses canonical
anterior-left coordinates; omission tests the whole source image. This isolates
the femoral stage without repeating the expensive regional searches. Set
`expect_original_rejection` to verify that the old crop fails the geometry gate
before the expanded crop recovers the heads.

```sh
SPINE_CONTOUR_REAL_FEMORAL_CASES=/path/to/regression-cases.json \
  .venv/bin/python -m pytest -q backend/tests/integration/test_femoral_real_images.py
```

Without local real-image fixtures this test is skipped. It never generates a scan
or substitutes model outputs. These checks establish inference and crop behavior;
anatomical accuracy requires independently reviewed reference annotations.
