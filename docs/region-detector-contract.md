# Region detector ONNX contract

`backend.region_detector` is a standalone inference adapter for two source-film
proposals: `cervical` and `lumbar`. It is not connected to production inference
until a trained graph and its export sidecar are validated on real films. A box
score selects a proposal; it is not a calibrated anatomical confidence.

The graph must have one float32 NCHW input with batch size one, and one named
output. The sidecar JSON must state every field below. Unknown fields, missing
fields, and class reordering are rejected.

| Field | Meaning |
| --- | --- |
| `schema_version` | `1` |
| `input_name`, `output_name` | Actual ONNX tensor names |
| `input_size` | `[height, width]`, each at least 32 |
| `channels` | `1` or `3`; grayscale is repeated when 3 |
| `pixel_normalization` | `uint8_div_255` only |
| `letterbox_value` | Padding pixel, integer 0–255 |
| `classes` | Exactly `["cervical", "lumbar"]` |
| `output_layout` | `xyxy_score_class_rows` or `cxcywh_class_scores_channels` |
| `box_units` | `input_pixels` or `normalized` |
| `score_threshold`, `nms_iou_threshold` | Finite numbers strictly between 0 and 1 |

The input is a two-dimensional uint8 grayscale image. The adapter resizes it
with aspect ratio preserved, centers it on the declared canvas, divides values
by 255, and sends one batch to ONNX Runtime. Source image dimensions determine
the scale and padding on every call. Output boxes are inverted through that
exact transform into source-film `xyxy` pixel coordinates and clipped to the
film. Coordinates refer to the full input image, not a downscaled search copy.

`xyxy_score_class_rows` means `[N,6]` or `[1,N,6]`, with columns
`x1,y1,x2,y2,score,class_id`. `cxcywh_class_scores_channels` means `[6,N]` or
`[1,6,N]`, with channels `cx,cy,width,height,cervical_score,lumbar_score`.
The latter has **no objectness channel**; its best class score becomes the
proposal score. This layout is suitable only for an export that already uses
those exact semantics. Both layouts may have `N=0`. Box units apply before
letterbox inversion. Invalid coordinates, nonfinite values, scores outside the
declared threshold or above one, unsupported classes, and boxes outside the
film are omitted. NMS runs within each class. No surviving row returns `[]`.

Training/export must bind the sidecar to the graph after checking real tensor
names, shapes, score semantics, coordinate units, preprocessing, and class order.
Do not infer a layout from tensor shape. A graph emitting raw anchor logits,
objectness, or end-to-end NMS output requires its own explicit adapter contract.

The cervical label is the extent of all 23 CSXA points with five percent
padding; `backend.models.cervical.landmark_input` applies its existing square
expansion afterward. A lumbar region must retain L1–S1 and femoral heads.
The current S1-based framing uses 8.7 endplate lengths above and 5.3 below S1,
with crop height/width 1.5; it is useful as a coverage reference, not proof of
coverage on every film. See the setup integration plan for routing call sites.
