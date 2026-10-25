"""Inference models and the shared vertebral-label convention."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from enum import IntEnum
from functools import lru_cache
from pathlib import Path
import gc
import json
import logging
import os
import sys
import tempfile

import cv2
import numpy as np
import onnxruntime as ort

ort.disable_telemetry_events()
if "CUDAExecutionProvider" in ort.get_available_providers() and hasattr(ort, "preload_dlls"):
    ort.preload_dlls(directory="")

try:
    from .. import processors, runtime, learned_region
except ImportError:
    import processors
    import runtime
    import learned_region

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
FEMORAL_IMAGE_SIZE = 640
FEMORAL_THRESHOLD = 0.35
FEMORAL_MODEL_REVISION = "20260923-conservative-clahe-flip"
WEIGHTS_DIRECTORY = Path(__file__).resolve().parent.parent / "weights"
FEMORAL_WEIGHTS_PATH = WEIGHTS_DIRECTORY / "femoral_unet.pt"
S1_WEIGHTS_PATH = WEIGHTS_DIRECTORY / "s1_keypointrcnn.pt"
HRNET_WEIGHTS_PATH = WEIGHTS_DIRECTORY / "hrnet_landmarks.pt"
SUPPORTED_INPUT = ("xray", "lumbar", "lateral")
LUMBAR_LEVELS = ("L1", "L2", "L3", "L4", "L5")

# Fixed production model choices.
MODEL_CHOICES = {
    "vertebrae": ("hrnet",),
    "femoral": ("unet",),
    "s1": ("keypointrcnn",),
}
DEFAULT_MODELS = {"vertebrae": "hrnet", "femoral": "unet", "s1": "keypointrcnn"}


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
    if array.dtype == np.uint8:
        # Exact order statistics from a 256-bin histogram avoid partitioning
        # every large source crop. Keep NumPy's linear percentile convention.
        counts = np.bincount(array.reshape(-1), minlength=256)
        if counts[1:].sum() >= 100:
            counts[0] = 0
        cumulative = counts.cumsum()
        positions = (cumulative[-1]-1)*np.array([.005, .995])
        lower = np.searchsorted(cumulative, np.floor(positions)+1)
        upper = np.searchsorted(cumulative, np.ceil(positions)+1)
        low, high = lower+(upper-lower)*(positions-np.floor(positions))
    else:
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
MODEL_NAMES = {"s1_batch": "Batched S1 detector", "lumbar_heatmaps": "Lumbar HRNet heatmaps", "cervical_slope_hrnet": "Cervical slope HRNet", "s1": "S1 detector",
               "femoral": "femoral-head model", "hrnet": "HRNet landmark model",
               "cervical_detr": "cervical detector",
               "cervical_anatomical_hrnet": "anatomical cervical landmarks",
               "cervical_hrnet": "cervical HRNET landmarks"}
_resident_key = None
_cache_policy = None


def session_options(policy):
    threads, low_memory, adapter = policy
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = threads
    settings.inter_op_num_threads = 1
    settings.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    settings.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    # Inactive sessions must not spin while another model or OCR is working.
    settings.add_session_config_entry("session.intra_op.allow_spinning", "0")
    settings.enable_cpu_mem_arena = not low_memory
    # DirectML does not support memory patterns (ONNX Runtime would turn them off).
    settings.enable_mem_pattern = not low_memory and adapter is None
    return settings


@lru_cache(maxsize=12)
def _load_model(kind, policy):
    if kind not in MODEL_NAMES:
        raise ValueError(f"unknown model kind: {kind}")
    path = ONNX_DIRECTORY / f"{kind}.onnx"
    if not path.is_file():
        raise FileNotFoundError(f"Missing ONNX model: {path}. Run python tools/export_onnx.py before starting the development app.")
    _, low_memory, adapter = policy
    providers = ["CPUExecutionProvider"]
    if adapter is not None:
        runtime.report("loading", f"Loading {MODEL_NAMES[kind]} on {runtime.processor().name}")
        # DirectML takes Windows' adapter index. Nodes it cannot run stay on the CPU provider.
        if runtime.processor().provider == processors.CUDA:
            from ..gpu_batch import devices
            device = next((d for d in devices() if d["index"] == adapter), None)
            budget = max(256*1024**2, int(device["free"]*.92)) if device else 2*1024**3
            providers.insert(0, (processors.CUDA, {"device_id": str(adapter), "gpu_mem_limit": str(budget),
                             "arena_extend_strategy": "kSameAsRequested", "cudnn_conv_algo_search": "HEURISTIC",
                             "use_tf32": "1"}))
        else:
            providers.insert(0, (processors.DIRECTML, {"device_id": str(adapter), "disable_metacommands": "True"}))
        return InferenceModel(path, policy, providers)
    runtime.report("loading", f"Loading {MODEL_NAMES[kind]}")
    # Apple's CPU implementation is faster than generic ARM kernels for this
    # detector. Static partitions leave dynamic/empty detections to ORT's CPU
    # provider, which supports them. Low memory keeps the explicit thread cap.
    if (kind == "s1" and not low_memory and sys.platform == "darwin"
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


FALLBACK_MESSAGES = {
    "CoreMLExecutionProvider": "Apple acceleration unavailable; using ONNX CPU inference",
    processors.DIRECTML: "The GPU could not run the {model}; using ONNX CPU inference",
}


class InferenceModel:
    """DirectML errors abort the whole request attempt; Core ML retains its
    existing S1-only CPU fallback. ORT's implicit retry is always disabled.
    """
    def __init__(self, path, policy, providers):
        self.path, self.policy = path, policy
        self.batch_limit = None
        self.batch_stats = {"max_batch": 0, "oom_retries": 0}
        first = providers[0]
        self.accelerator = None if len(providers) == 1 else first[0] if isinstance(first, tuple) else first
        try:
            self.session = self._session(providers)
        except Exception as error:
            if self.accelerator is None:
                raise
            self._accelerator_failure(error, creating=True)

    def _session(self, providers):
        # ONNX Runtime's own retry would fall back silently, with only a banner on stdout.
        session = ort.InferenceSession(str(self.path), sess_options=session_options(self.policy),
                                       providers=providers, enable_fallback=0)
        if self.accelerator in (processors.DIRECTML, processors.CUDA) and session.get_providers()[0] != self.accelerator:
            raise RuntimeError(f"{self.accelerator} session unexpectedly registered only CPU providers")
        return session

    def _accelerator_failure(self, error, creating=False):
        runtime.checkpoint()
        logging.getLogger(__name__).exception("%s failed for %s", self.accelerator, self.path.stem)
        if self.accelerator in (processors.DIRECTML, processors.CUDA):
            raise runtime.GpuFailure(self.path.stem, f"{type(error).__name__}: {error}") from error
        if not creating and not isinstance(error, ort.capi.onnxruntime_pybind11_state.Fail):
            raise error
        self._cpu_fallback()

    def _cpu_fallback(self):
        model = MODEL_NAMES.get(self.path.stem, "model")
        runtime.report("loading", FALLBACK_MESSAGES.get(self.accelerator, "Acceleration unavailable; using ONNX CPU inference")
                       .format(model=model))
        self.session = self._session(["CPUExecutionProvider"])

    def get_providers(self):
        return self.session.get_providers()

    def run(self, output_names, inputs):
        try:
            if self.path.stem not in ("lumbar_heatmaps", "cervical_slope_hrnet"):
                return self.session.run(output_names, inputs)
            from ..gpu_batch import run
            def record(size, retries, limit):
                runtime.record_batch(self.path.stem, size, retries)
                self.batch_stats["max_batch"] = max(size, self.batch_stats["max_batch"])
                self.batch_stats["oom_retries"] += retries
                if retries:
                    self.batch_limit = limit
            return run(self.session, output_names, inputs, batch_limit=self.batch_limit, report=record)
        except Exception as error:
            if self.get_providers() == ["CPUExecutionProvider"]:
                raise
            self._accelerator_failure(error)
            return self.session.run(output_names, inputs)


def release_models():
    """Drop session ownership and buffers, including failed/cancelled low-memory runs."""
    global _resident_key, _cache_policy
    _load_model.cache_clear()
    _resident_key = _cache_policy = None
    gc.collect()


# The ONNX graph(s) behind each model id, for `qc.model_versions`. A key is the id alone or (structure, id): the
# U-Net reads vertebrae and femoral heads with two different graphs, so its slot decides.
_GRAPHS_BY_MODEL = {
    ("femoral", "unet"): ("femoral",),
    "keypointrcnn": ("s1",),
    "hrnet": ("hrnet",),
    "lumbar_heatmaps": ("lumbar_heatmaps",),
    "cervical_slope_hrnet": ("cervical_slope_hrnet",),
    "cervical_hrnet": ("cervical_hrnet",),
    "cervical_anatomical_hrnet": ("cervical_anatomical_hrnet",),
    "cervical_detr": ("cervical_detr",),
    "dual_hrnet": ("cervical_hrnet", "hrnet"),
    "seven-measurements-20261023": ("cervical_slope_hrnet", "cervical_anatomical_hrnet",
                                   "lumbar_heatmaps", "s1", "femoral", "cervical_detr", "cervical_hrnet", "hrnet"),
}


def _graph_version(kind):
    """The export's onnx_sha256 from its sidecar, or None. Reads the metadata only; no graph is loaded."""
    try:
        digest = json.loads((ONNX_DIRECTORY / f"{kind}.json").read_text())["onnx_sha256"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return digest if isinstance(digest, str) and digest else None


def model_versions(models: dict[str, str]) -> dict[str, str | None]:
    """For each structure in `models` ({'vertebrae': 'unet', ...}) the onnx_sha256 of the graph(s) that read it.

    A model id that runs two graphs (dual_hrnet) gives their hashes joined by '+', cervical first. An unknown id,
    or a graph whose sidecar is missing or unreadable, gives None: half a version would name no real export.
    """
    versions = {}
    for structure, name in models.items():
        kinds = ()
        if isinstance(name, str):
            kinds = _GRAPHS_BY_MODEL.get((structure, name)) or _GRAPHS_BY_MODEL.get(name) or ()
        digests = [_graph_version(kind) for kind in kinds]
        versions[structure] = "+".join(digests) if digests and all(digests) else None
    return versions


def _infer(kind, operation, message):
    global _resident_key, _cache_policy
    runtime.checkpoint()
    previous_progress = runtime.current_progress()
    options = runtime.options()
    policy = (options.inference_threads, options.low_memory, runtime.processor().adapter)
    key = (kind, policy)
    # Session thread counts and providers are immutable. Never reuse a different
    # mode's or processor's session, or retain duplicate copies after a change.
    cache_policy = (policy, runtime.processor().id)
    if cache_policy != _cache_policy or (options.low_memory and key != _resident_key):
        release_models()
    try:
        model = _load_model(kind, policy)
    except runtime.GpuFailure as error:
        from ..gpu_batch import allocation_failure
        if runtime.processor().provider != processors.CUDA or not allocation_failure(error):
            raise
        release_models()
        runtime.record_batch(kind, 0, 1)
        runtime.report('gpu_memory', 'Releasing inactive models and retrying GPU model loading')
        model = _load_model(kind, policy)
    _resident_key, _cache_policy = key, cache_policy
    if message is not None:
        runtime.report(kind, message)
    elif previous_progress is not None:
        runtime.report(**{key: previous_progress[key] for key in ('stage', 'message', 'completed', 'total')})
    try:
        result = operation(model)
    except runtime.GpuFailure as error:
        from ..gpu_batch import allocation_failure
        if runtime.processor().provider != processors.CUDA or not allocation_failure(error):
            raise
        # Keep this model alive, free other cached sessions, and retry the whole
        # stage once. Nothing from the failed attempt is returned to the caller.
        release_models()
        runtime.record_batch(kind, 0, 1)
        runtime.report('gpu_memory', 'Releasing inactive models and retrying the GPU stage')
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
    if (runtime.processor().provider == processors.CUDA and runtime.processor().kind == "gpu"
            and not runtime.options().low_memory and len(letterboxed) > 1
            and (ONNX_DIRECTORY / 's1_batch.onnx').is_file()):
        def batched(session):
            results = []
            for start in range(0, len(letterboxed), 4):
                group = letterboxed[start:start+4]
                tensors = [_detection_input(image) for image in group]
                tensors += [tensors[-1]] * (4-len(tensors))
                scores, points = session.run(None, {'image': np.concatenate(tensors)})
                results.extend(_s1_from_output({'scores': scores[i:i+1], 'keypoints': points[i:i+1]})
                               for i in range(len(group)))
                runtime.record_batch('s1_batch', len(group), 0)
            return results
        try:
            return _infer('s1_batch', batched, None)
        except runtime.GpuFailure as error:
            from ..gpu_batch import allocation_failure
            if not allocation_failure(error):
                raise
            release_models()
            runtime.record_batch('s1_batch', 0, 1)
            runtime.report('gpu_memory', 'Retrying S1 detection one crop at a time on the GPU')
    return _infer("s1", score, None)


def _femoral_input(pixel_array):
    # CLAHE is applied to native pixels BEFORE padding/resizing, matching training evaluation.
    image = cv2.createCLAHE(clipLimit=2., tileGridSize=(8, 8)).apply(_robust_rescale(pixel_array))
    canvas, _ = _letterbox(image)
    resized = cv2.resize(canvas, (FEMORAL_IMAGE_SIZE, FEMORAL_IMAGE_SIZE), interpolation=cv2.INTER_AREA)
    return _segmentation_input(resized)


def _femoral_probabilities(pixel_array):
    value = _femoral_input(pixel_array)

    def predict(session):
        logits = session.run(None, {"image": value})[0][0, 0]
        probability = 1. / (1. + np.exp(-np.clip(logits, -80., 80.)))
        runtime.checkpoint()
        flipped = session.run(None, {"image": np.ascontiguousarray(value[..., ::-1])})[0][0, 0]
        probability += (1. / (1. + np.exp(-np.clip(flipped, -80., 80.))))[:, ::-1]
        probability *= .5
        return cv2.resize(probability, (MODEL_IMAGE_SIZE, MODEL_IMAGE_SIZE), interpolation=cv2.INTER_LINEAR)

    return _infer("femoral", predict, "Segmenting femoral heads")


def _restore_femoral_mask(probability, transform, shape):
    # Resize probabilities first: thresholding a tiny cap before restoring can erase it.
    inner = transform.inner
    crop = probability[inner.top:inner.top + inner.resized_height,
                       inner.left:inner.left + inner.resized_width]
    left, top, right, bottom = transform.window
    restored = cv2.resize(crop.astype(np.float32), (right - left, bottom - top),
                          interpolation=cv2.INTER_LINEAR)
    mask = np.zeros(shape, dtype=np.uint8)
    mask[top:bottom, left:right] = restored > FEMORAL_THRESHOLD
    return mask
