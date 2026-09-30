# Research region detector opt-in

The learned region localizer is experimental and disabled by default. The
frozen full-spine challenge did not establish cervical utility: cervical AP50
and AP50:95 were both 0 on three eligible panels. Lumbar AP50 was 0.531 and
AP50:95 was 0.176 on six eligible panels. These panels have reviewed positive
regions only, so specificity is unknown. The much higher validation score on
cropped CSXA/BUU sources does not measure full-spine performance.

To exercise the frozen pilot on a research machine, set both paths before
starting the backend:

```sh
export SPINE_REGION_DETECTOR_ONNX=/absolute/path/region_detector.onnx
export SPINE_REGION_DETECTOR_METADATA=/absolute/path/region_detector.json
```

Send `learned_region_localizer=true` in the prediction form body. The normal
app sends no such field, so existing behavior is unchanged. The model runs on
ONNX Runtime CPU, within the request worker, and records its provider. A
missing proposal falls through to the existing sliding localizer; a proposed
crop still needs the established regional landmark and consensus checks. If
those checks yield insufficient evidence on a full-spine image, the standard
search runs. In local lumbar prediction, a learned crop lacking S1 triggers
the standard search, followed by the existing visible-film fallback.

The detector's boxes are crop proposals in source-image pixels. They are not
vertebral annotations or evidence that a landmark identity is correct.
