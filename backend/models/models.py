"""Inference models and the shared vertebral-label convention."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from enum import IntEnum
from functools import lru_cache
from pathlib import Path
import gc
import json
import os
import sys
import tempfile

import cv2
import numpy as np
import onnxruntime as ort

ort.disable_telemetry_events()

try:
    from .. import runtime
except ImportError:
    import runtime

# The training checkpoint's fixed landmark slot order; no Torch import at runtime.
HRNET_LANDMARKS = tuple((level, corner) for level in ("L1", "L2", "L3", "L4", "L5")
                        for corner in ("SA", "SP", "IA", "IP")) + (("S1", "SA"), ("S1", "SP"))

class VertebraLabel(IntEnum):
    BACKGROUND = 0
    C1 = 1
    C2 = 2
    C3 = 3
    C4 = 4
    C5 = 5
    C6 = 6
    C7 = 7
    T1 = 8
    T2 = 9
    T3 = 10
    T4 = 11
    T5 = 12
    T6 = 13
    T7 = 14
    T8 = 15
    T9 = 16
    T10 = 17
    T11 = 18
    T12 = 19
    L1 = 20
    L2 = 21
    L3 = 22
    L4 = 23
    L5 = 24
    S1 = 25
    S2 = 26
    S3 = 27
    S4 = 28
    S5 = 29
    T13 = 30
    L6 = 31


VERTEBRA_LABELS = {label.name: int(label) for label in VertebraLabel}
MODEL_IMAGE_SIZE = 768
MODEL_THRESHOLD = 0.5
WEIGHTS_DIRECTORY = Path(__file__).resolve().parent.parent / "weights"
VERTEBRA_WEIGHTS_PATH = WEIGHTS_DIRECTORY / "vertebra_unet.pt"
FEMORAL_WEIGHTS_PATH = WEIGHTS_DIRECTORY / "femoral_unet.pt"
S1_WEIGHTS_PATH = WEIGHTS_DIRECTORY / "s1_keypointrcnn.pt"
HRNET_WEIGHTS_PATH = WEIGHTS_DIRECTORY / "hrnet_landmarks.pt"
SUPPORTED_INPUT = ("xray", "lumbar", "lateral")
LUMBAR_LEVELS = ("L1", "L2", "L3", "L4", "L5")

# Which model reads which structure. The vertebral corners have two sources --
# the U-Net's masks, or HRNet's regressed landmarks -- and the caller picks; the
# femoral heads and the S1 endplate each have one. Every response records the
# choice under `qc.models`, so a stored measurement says what produced it.
MODEL_CHOICES = {
    "vertebrae": ("unet", "hrnet"),
    "femoral": ("unet",),
    "s1": ("keypointrcnn",),
}
DEFAULT_MODELS = {"vertebrae": "unet", "femoral": "unet", "s1": "keypointrcnn"}


def resolve_models(models: dict[str, str] | None) -> dict[str, str]:
    """Fill defaults and reject anything that is not an offered model."""

    chosen = dict(DEFAULT_MODELS)
    for structure, name in (models or {}).items():
        if structure not in MODEL_CHOICES:
            raise ValueError(f"Unknown model slot '{structure}'; expected one of "
                             f"{', '.join(MODEL_CHOICES)}")
        if name is None or name == "":
            continue
        if name not in MODEL_CHOICES[structure]:
            raise ValueError(f"Unknown {structure} model '{name}'; available: "
                             f"{', '.join(MODEL_CHOICES[structure])}")
        chosen[structure] = name
    return chosen


@dataclass(frozen=True)
class LetterboxTransform:
    original_height: int
    original_width: int
    scale: float
    resized_height: int
    resized_width: int
    top: int
    left: int


def _validate_supported_input(
    modality: str, body_part: str, view: str | None, laterality: str | None
) -> None:
    normalize = lambda value: (value or "").strip().lower().replace("-", "").replace("_", "")
    normalized_view, normalized_laterality = normalize(view), normalize(laterality)
    if normalized_view and normalized_laterality and normalized_view != normalized_laterality:
        raise ValueError("view and laterality must agree when both are provided")
    if (normalize(modality), normalize(body_part), normalized_view or normalized_laterality) != SUPPORTED_INPUT:
        raise ValueError(
            "Unsupported model selection. The only available combination is "
            "modality='xray', body_part='lumbar', view='lateral'."
        )


def _robust_rescale(pixel_array: np.ndarray) -> np.ndarray:
    array = np.asarray(pixel_array)
    if array.ndim != 2 or not np.issubdtype(array.dtype, np.number) or array.size == 0:
        raise ValueError("pixel_array must be a non-empty two-dimensional numeric grayscale array")
    image = array.astype(np.float32, copy=True)
    finite = np.isfinite(image)
    if not finite.any():
        return np.zeros(image.shape, dtype=np.uint8)
    image[~finite] = float(np.median(image[finite]))
    foreground = image[image > 0]
    values = foreground if foreground.size >= 100 else image.reshape(-1)
    low, high = np.percentile(values, (0.5, 99.5))
    if high <= low + 1:
        return np.clip(image, 0, 255).astype(np.uint8)
    return np.clip((image - low) * (255.0 / (high - low)), 0, 255).astype(np.uint8)


def _letterbox(image: np.ndarray) -> tuple[np.ndarray, LetterboxTransform]:
    height, width = image.shape
    scale = min(MODEL_IMAGE_SIZE / height, MODEL_IMAGE_SIZE / width)
    resized_height = max(1, int(round(height * scale)))
    resized_width = max(1, int(round(width * scale)))
    resized = cv2.resize(image, (resized_width, resized_height), interpolation=cv2.INTER_AREA)
    top = (MODEL_IMAGE_SIZE - resized_height) // 2
    left = (MODEL_IMAGE_SIZE - resized_width) // 2
    output = np.zeros((MODEL_IMAGE_SIZE, MODEL_IMAGE_SIZE), dtype=np.uint8)
    output[top : top + resized_height, left : left + resized_width] = resized
    return output, LetterboxTransform(
        height, width, scale, resized_height, resized_width, top, left
    )


ONNX_DIRECTORY = Path(__file__).resolve().parent.parent / "onnx"
MODEL_NAMES = {"s1": "S1 detector", "vertebra": "vertebra model",
               "femoral": "femoral-head model", "hrnet": "HRNet landmark model"}
_resident_key = None
_cache_policy = None


def session_options(policy):
    threads, low_memory = policy
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = threads
    settings.inter_op_num_threads = 1
    settings.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    settings.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    # Inactive sessions must not spin while another model or OCR is working.
    settings.add_session_config_entry("session.intra_op.allow_spinning", "0")
    settings.enable_cpu_mem_arena = not low_memory
    settings.enable_mem_pattern = not low_memory
    return settings


@lru_cache(maxsize=4)
def _load_model(kind, policy):
    if kind not in MODEL_NAMES:
        raise ValueError(f"unknown model kind: {kind}")
    path = ONNX_DIRECTORY / f"{kind}.onnx"
    if not path.is_file():
        raise FileNotFoundError(f"Missing ONNX model: {path}. Run python tools/export_onnx.py before starting the development app.")
    runtime.report("loading", f"Loading {MODEL_NAMES[kind]}")
    providers = ["CPUExecutionProvider"]
    # Apple's CPU implementation is faster than generic ARM kernels for this
    # detector. Static partitions leave dynamic/empty detections to ORT's CPU
    # provider, which supports them. Low memory keeps the explicit thread cap.
    if (kind == "s1" and not policy[1] and sys.platform == "darwin"
            and os.environ.get("SPINE_CONTOUR_ORT_CPU_ONLY") != "1"
            and "CoreMLExecutionProvider" in ort.get_available_providers()):
        metadata = json.loads(path.with_suffix('.json').read_text())
        cache = Path(os.environ.get("SPINE_CONTOUR_MODEL_CACHE", str(Path(tempfile.gettempdir()) / 'spine-contour-onnx-cache')))
        # Never reuse a compiled graph after weights/export/runtime changes.
        cache = cache / ort.__version__ / metadata['onnx_sha256'] / 'cpu-static-nn'
        providers.insert(0, ("CoreMLExecutionProvider", {
            "ModelFormat": "NeuralNetwork", "MLComputeUnits": "CPUOnly",
            "RequireStaticInputShapes": "1", "EnableOnSubgraphs": "0",
            "ModelCacheDirectory": str(cache),
        }))
    return InferenceModel(path, policy, providers)


class InferenceModel:
    """Retain CPU fallback if an Apple compiler/partition cannot handle a film."""
    def __init__(self, path, policy, providers):
        self.path, self.policy = path, policy
        try:
            self.session = ort.InferenceSession(str(path), sess_options=session_options(policy), providers=providers)
        except Exception:
            if len(providers) == 1:
                raise
            self._cpu_fallback()

    def _cpu_fallback(self):
        runtime.report("loading", "Apple acceleration unavailable; using ONNX CPU inference")
        self.session = ort.InferenceSession(str(self.path), sess_options=session_options(self.policy),
                                           providers=["CPUExecutionProvider"])

    def get_providers(self):
        return self.session.get_providers()

    def run(self, output_names, inputs):
        try:
            return self.session.run(output_names, inputs)
        except ort.capi.onnxruntime_pybind11_state.Fail:
            if "CoreMLExecutionProvider" not in self.get_providers():
                raise
            runtime.checkpoint()
            self._cpu_fallback()
            return self.session.run(output_names, inputs)


def release_models():
    """Drop session ownership and buffers, including failed/cancelled low-memory runs."""
    global _resident_key, _cache_policy
    _load_model.cache_clear()
    _resident_key = _cache_policy = None
    gc.collect()


def _infer(kind, operation, message):
    global _resident_key, _cache_policy
    runtime.checkpoint()
    previous_progress = runtime.current_progress()
    options = runtime.options()
    policy = (options.inference_threads, options.low_memory)
    key = (kind, policy)
    # Session thread counts are immutable. Never reuse a different mode's session
    # or retain duplicate copies after changing CPU settings.
    if policy != _cache_policy or (options.low_memory and key != _resident_key):
        release_models()
    model = _load_model(kind, policy)
    _resident_key, _cache_policy = key, policy
    if message is not None:
        runtime.report(kind, message)
    elif previous_progress is not None:
        runtime.report(**{key: previous_progress[key] for key in ('stage', 'message', 'completed', 'total')})
    result = operation(model)
    runtime.record_providers(kind, model.get_providers())
    runtime.checkpoint()
    return result


def _segmentation_input(image):
    value = image[None, None].astype(np.float32) / np.float32(255.)
    return (value - np.float32(.449)) / np.float32(.226)


def _detection_input(image):
    value = image.astype(np.float32) / np.float32(255.)
    return np.repeat(value[None, None], 3, axis=1)


def _label_lumbar_components(binary_mask: np.ndarray) -> np.ndarray:
    """Label the five largest components L1 through L5 for compatibility."""

    binary = np.asarray(binary_mask, dtype=bool)
    remaining, components = binary.copy(), []
    height, width = binary.shape
    for start_y, start_x in np.argwhere(remaining):
        if not remaining[start_y, start_x]:
            continue
        queue, pixels = deque([(int(start_y), int(start_x))]), []
        remaining[start_y, start_x] = False
        while queue:
            y, x = queue.pop()
            pixels.append((y, x))
            for neighbor_y, neighbor_x in (
                (y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)
            ):
                if (
                    0 <= neighbor_y < height
                    and 0 <= neighbor_x < width
                    and remaining[neighbor_y, neighbor_x]
                ):
                    remaining[neighbor_y, neighbor_x] = False
                    queue.append((neighbor_y, neighbor_x))
        if len(pixels) >= max(16, round(binary.size * 0.0002)):
            components.append(np.asarray(pixels, dtype=np.int32))
    components = sorted(
        sorted(components, key=len, reverse=True)[:5], key=lambda item: item[:, 0].mean()
    )
    labeled = np.zeros(binary.shape, dtype=np.uint8)
    for label, component in zip(
        range(int(VertebraLabel.L1), int(VertebraLabel.L5) + 1), components
    ):
        labeled[component[:, 0], component[:, 1]] = label
    return labeled


def _restore_mask(array: np.ndarray, transform: LetterboxTransform) -> np.ndarray:
    crop = array[
        transform.top : transform.top + transform.resized_height,
        transform.left : transform.left + transform.resized_width,
    ]
    return cv2.resize(
        crop.astype(np.uint8),
        (transform.original_width, transform.original_height),
        interpolation=cv2.INTER_NEAREST,
    )


def _restore_points(points: np.ndarray, transform: LetterboxTransform) -> np.ndarray:
    restored = np.asarray(points, dtype=np.float64).copy()
    restored[:, 0] = (restored[:, 0] - transform.left) / transform.scale
    restored[:, 1] = (restored[:, 1] - transform.top) / transform.scale
    restored[:, 0] = np.clip(restored[:, 0], 0, transform.original_width - 1)
    restored[:, 1] = np.clip(restored[:, 1], 0, transform.original_height - 1)
    return restored


def _s1_from_output(output: dict[str, np.ndarray]) -> tuple[float, np.ndarray | None]:
    if not len(output["keypoints"]):
        return 0.0, None
    best = int(output["scores"].argmax())
    points = output["keypoints"][best, :, :2].astype(np.float64)
    confidence = float(output["scores"][best])
    if (not np.isfinite(confidence) or points.shape != (2, 2) or not np.isfinite(points).all()
            or np.linalg.norm(points[1] - points[0]) <= 0):
        return 0.0, None
    return confidence, points


def _detect(session, image):
    scores, keypoints = session.run(None, {"image": _detection_input(image)})
    return _s1_from_output({"scores": scores, "keypoints": keypoints})


def _score_s1(letterboxed):
    """Fixed single-frame graph: bounded memory and cancellation between crops."""
    def score(session):
        results = []
        for image in letterboxed:
            runtime.checkpoint()
            results.append(_detect(session, image))
        return results
    return _infer("s1", score, None)


def _read_frame(letterboxed, choice):
    value = _segmentation_input(letterboxed)
    s1_confidence, s1_points = _infer("s1", lambda session: _detect(session, letterboxed),
                                    "Detecting the S1 endplate")
    # Compare logits at the sigmoid .5 decision boundary without another array.
    femoral = _infer("femoral",
        lambda session: (session.run(None, {"image": value})[0][0, 0] >= 0).astype(np.uint8),
        "Segmenting femoral heads")
    # Retain U-Net presence evidence even when HRNet supplies the corners.
    vertebra_labels = _infer("vertebra",
        lambda session: session.run(None, {"image": value})[0][0].argmax(0).astype(np.uint8),
        "Segmenting visible vertebrae")
    hrnet_points = None
    if choice["vertebrae"] == "hrnet":
        hrnet_points = _infer("hrnet",
            lambda session: session.run(None, {"image": value})[0][0].astype(np.float64),
            "Locating vertebral corners with HRNet")
    return {"vertebra_labels": vertebra_labels, "hrnet_points": hrnet_points,
            "femoral": femoral, "s1": s1_points, "s1_confidence": s1_confidence}


def _clip_to_film(points: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    clipped = np.asarray(points, dtype=np.float64).copy()
    clipped[:, 0] = np.clip(clipped[:, 0], 0, shape[1] - 1)
    clipped[:, 1] = np.clip(clipped[:, 1], 0, shape[0] - 1)
    return clipped


def spinopelvic_prediction(
    pixel_array: np.ndarray,
    modality: str = "xray",
    body_part: str = "lumbar",
    view: str | None = "lateral",
    laterality: str | None = None,
    models: dict[str, str] | None = None,
) -> dict[str, object]:
    """Locate the lumbosacral region, frame it, and run the chosen models.

    The film is searched for the lumbar spine first and the models run on a
    crop framed the way their training data was, so a full-spine radiograph
    measures like a lumbar one. See `framing.py` for the search and why it is
    needed. Returns the film, the label maps, every landmark in full-film
    pixels, and a record of the crop and the models that produced them.
    """

    try:
        from .. import framing, landmarks, toolbar
    except ImportError:  # Support running modules directly from backend/.
        import framing, landmarks, toolbar

    _validate_supported_input(modality, body_part, view, laterality)
    choice = resolve_models(models)
    raw = np.asarray(pixel_array)
    if raw.ndim != 2 or not np.issubdtype(raw.dtype, np.number) or raw.size == 0:
        raise ValueError("pixel_array must be a non-empty two-dimensional numeric grayscale array")
    toolbar_info = {"enabled": False, "status": "disabled", "removed_bottom_px": 0,
                    "source_size": [int(raw.shape[1]), int(raw.shape[0])],
                    "window": [0, 0, int(raw.shape[1]), int(raw.shape[0])]}
    if runtime.options().toolbar_removal:
        runtime.report("toolbar", "Checking for a bottom PACS toolbar")
        raw, toolbar_info = toolbar.remove_bottom_toolbar(raw)
        runtime.report("toolbar", f"Removed a {toolbar_info['removed_bottom_px']}-pixel bottom toolbar"
                       if toolbar_info['status'] == 'removed' else "No supported bottom toolbar detected; keeping the image")
    if raw.dtype != np.uint8:
        raw = raw.astype(np.float32)
    runtime.report("preparing", "Preparing the radiograph for inference")
    image = _robust_rescale(raw)

    localizer = runtime.options().crop_localizer
    if localizer:
        located = framing.locate(raw, _score_s1)
    else:
        runtime.report("framing", "Crop localizer off; processing the supplied lumbar image")
        located = {"window": framing.fallback_window(raw), "searched": False,
                   "whole_film_won": True, "whole_film_cost": None,
                   "confidence": None, "cost": None, "candidates": 0}
    fallback = located is None
    if fallback:
        runtime.report("framing", "S1 not found in the search; checking the visible film")
        # Upper-lumbar and cropped films need not contain a sacrum at all.
        located = {"window": framing.fallback_window(raw), "searched": True,
                   "whole_film_won": True, "whole_film_cost": None,
                   "confidence": None, "cost": None, "candidates": 0}
    window = located["window"]
    canvas, transform = framing.prepare_crop(raw, window)
    frame = _read_frame(canvas, choice)
    if _source_s1(frame, transform) is None and not located.get("whole_film_won"):
        runtime.report("framing", "Checking the visible film after an incomplete crop")
        # A search crop without its anchor must not hide other visible levels.
        window = framing.fallback_window(raw)
        canvas, transform = framing.prepare_crop(raw, window)
        frame = _read_frame(canvas, choice)
        fallback = True

    # After a search, one reframe from the full-resolution detection, accepted
    # only if it agrees with the search; an unanchored re-detection is how a
    # crop drifts. A film taken whole is left whole: it is already the frame the
    # models expect, and re-cropping it would only change their input.
    reframed = False
    s1_source = _source_s1(frame, transform)
    proposed = (framing.reframe(s1_source, raw.shape)
                if s1_source is not None and not fallback and not located.get("whole_film_won") else None)
    if proposed is not None and proposed != window and framing.accept_reframe(window, proposed):
        runtime.report("framing", "Refining the selected spine region")
        canvas, transform = framing.prepare_crop(raw, proposed)
        candidate = _read_frame(canvas, choice)
        if _source_s1(candidate, transform) is not None:
            window, frame, reframed = proposed, candidate, True
        else:
            canvas, transform = framing.prepare_crop(raw, window)

    runtime.report("landmarks", "Extracting available vertebral endplates")
    model_values = {level: index for index, level in enumerate(LUMBAR_LEVELS, start=1)}
    s1_source = _source_s1(frame, transform)
    # Without S1, U-Net can recover endplates but cannot establish anterior.
    # Keep a stable image-coordinate ordering, marked explicitly as unconfirmed.
    anterior = frame["s1"][0] - frame["s1"][1] if s1_source is not None else np.array([-1., 0.])
    # Letterbox padding is not anatomy and must not supply presence evidence.
    inner = transform.inner
    labels = np.zeros_like(frame["vertebra_labels"])
    region = np.s_[inner.top:inner.top + inner.resized_height, inner.left:inner.left + inner.resized_width]
    labels[region] = frame["vertebra_labels"][region]
    present = landmarks.corners_from_label_map(labels, model_values, anterior)
    if choice["vertebrae"] == "unet":
        corners = present
        label_map = labels
    else:
        corners = {}
        for slot, (level, corner) in enumerate(HRNET_LANDMARKS):
            if level in present:
                corners.setdefault(level, {})[corner] = frame["hrnet_points"][slot]
        # Invalid/off-film regressions cannot become border-clipped fake bodies.
        corners = {level: quad for level, quad in corners.items()
                   if _usable_quad(quad, transform, raw.shape)}
        label_map = landmarks.label_map_from_corners(corners, model_values, canvas.shape)
    common_labels = np.where(label_map > 0, label_map + int(VertebraLabel.L1) - 1, 0).astype(np.uint8)

    corners_source = {
        level: {name: _clip_to_film(transform.restore_points(point), raw.shape)[0]
                for name, point in quad.items()}
        for level, quad in corners.items()
    }
    contract = landmarks.to_contract(corners_source)
    if choice["vertebrae"] == "unet" and s1_source is None:
        for body in contract.values():
            body["anterior_confirmed"] = False
    return {
        "image": image,
        "mask": transform.restore_mask(common_labels, raw.shape),
        "femoral_mask": transform.restore_mask(frame["femoral"], raw.shape),
        "landmarks": {
            "S1": {"superior": None if s1_source is None else s1_source.tolist()},
            "vertebrae": contract,
        },
        "models": choice,
        "framing": {
            "crop_localizer": localizer,
            "toolbar_removal": toolbar_info,
            "window": [int(v) for v in window],
            "reframed": reframed,
            "fallback_whole_film": fallback,
            "trimmed_black_margins": (fallback or not localizer) and window != (0, 0, raw.shape[1], raw.shape[0]),
            "searched": located["searched"],
            "whole_film_won": bool(located.get("whole_film_won")),
            "whole_film_agrees": bool(located.get("whole_film_agrees")),
            "whole_film_cost": located["whole_film_cost"],
            "search_confidence": located["confidence"],
            "search_cost": located["cost"],
            "candidates": located["candidates"],
            "s1_confidence": round(float(frame["s1_confidence"]), 4),
        },
    }


def _source_s1(frame: dict, transform) -> np.ndarray | None:
    if frame["s1"] is None:
        return None
    points = np.asarray(frame["s1"], dtype=np.float64)
    if points.shape != (2, 2) or not np.isfinite(points).all():
        return None
    points = transform.restore_points(points)
    left, top, right, bottom = transform.window
    if (np.linalg.norm(points[1] - points[0]) <= 0 or (points[:, 0] < left).any()
            or (points[:, 0] >= right).any() or (points[:, 1] < top).any()
            or (points[:, 1] >= bottom).any()):
        return None
    return points


def _usable_quad(quad: dict, transform, shape: tuple[int, int]) -> bool:
    if set(quad) != {"SA", "SP", "IA", "IP"}:
        return False
    points = transform.restore_points(np.stack([quad[k] for k in ("SA", "SP", "IP", "IA")]))
    return bool(np.isfinite(points).all() and (points >= 0).all()
                and (points[:, 0] < shape[1]).all() and (points[:, 1] < shape[0]).all()
                and cv2.isContourConvex(points.astype(np.float32))
                and cv2.contourArea(points.astype(np.float32)) * transform.scale ** 2 >= 200)


def vertebral_body_segmentation(
    pixel_array: np.ndarray,
    modality: str = "xray",
    body_part: str = "lumbar",
    view: str | None = "lateral",
    laterality: str | None = None,
) -> np.ndarray:
    """Return the common-label L1-L5 mask from the authoritative U-Net."""

    return spinopelvic_prediction(pixel_array, modality, body_part, view, laterality)["mask"]
