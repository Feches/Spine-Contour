"""FastAPI server for Spine-Contour inference."""

from __future__ import annotations

import base64
import io
import json
import hashlib
import logging

import numpy as np
import onnxruntime as ort
import pydicom
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

try:
    from . import runtime
    from .progress import stream_job
    from .models.models import release_models
    from .calibration import calibration_from_payload, learn_profile, validate_profile
    from .cervical_measurements import cervical_measurements_from_geometry
    from .models import MODEL_CHOICES, VERTEBRA_LABELS, spinopelvic_prediction
    from .utils import (
        spinopelvic_measurements_from_geometry,
        spinopelvic_measurements_from_landmarks,
    )
except ImportError:  # Support `uvicorn server:app` from backend/.
    import runtime
    from progress import stream_job
    from models.models import release_models
    from calibration import calibration_from_payload, learn_profile, validate_profile
    from cervical_measurements import cervical_measurements_from_geometry
    from models import MODEL_CHOICES, VERTEBRA_LABELS, spinopelvic_prediction
    from utils import (
        spinopelvic_measurements_from_geometry,
        spinopelvic_measurements_from_landmarks,
    )


MAX_UPLOAD_BYTES = 50 * 1024 * 1024
CERVICAL_MODEL = "cervical_hrnet"

app = FastAPI(title="Spine-Contour", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


def _dicom_pixel_array(payload: bytes) -> np.ndarray:
    dataset = pydicom.dcmread(io.BytesIO(payload))
    pixels = np.asarray(dataset.pixel_array, dtype=np.float32)
    if pixels.ndim != 2:
        raise ValueError("Only single-frame grayscale DICOM files are supported")
    slope = float(getattr(dataset, "RescaleSlope", 1.0))
    intercept = float(getattr(dataset, "RescaleIntercept", 0.0))
    pixels = pixels * slope + intercept
    if str(getattr(dataset, "PhotometricInterpretation", "")).upper() == "MONOCHROME1":
        pixels = float(pixels.max() + pixels.min()) - pixels
    return pixels


def _decode_grayscale(payload: bytes) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(payload)) as image:
            # Preserve native grayscale precision until the model's percentile
            # rescale. PIL's conversion to L clips 16-bit values above 255.
            if image.mode in ("I", "F") or image.mode.startswith("I;16"):
                return np.array(image)
            return np.asarray(image.convert("L"))
    except (UnidentifiedImageError, OSError):
        try:
            return _dicom_pixel_array(payload)
        except Exception as error:
            raise ValueError("The upload is not a readable image or grayscale DICOM file") from error


def cervical_prediction(pixel_array, anterior_side, model=CERVICAL_MODEL):
    # Keep the cervical runtime lazy so lumbar launches never require its assets.
    if __package__:
        from .models.cervical import cervical_prediction as predict_cervical
    else:
        from models.cervical import cervical_prediction as predict_cervical
    return predict_cervical(pixel_array, anterior_side, model=model)


def _validate_cervical_request(modality, view, laterality, vertebra_model,
                               femoral_model, s1_model, anterior_side):
    normalize = lambda value: (value or "").strip().lower().replace("-", "").replace("_", "")
    normalized_view, normalized_laterality = normalize(view), normalize(laterality)
    if normalized_view and normalized_laterality and normalized_view != normalized_laterality:
        raise ValueError("view and laterality must agree when both are provided")
    if normalize(modality) != "xray" or (normalized_view or normalized_laterality) != "lateral":
        raise ValueError("Cervical models require modality='xray', body_part='cervical', view='lateral'")
    if anterior_side not in ("left", "right"):
        raise ValueError("Cervical models require anterior_side='left' or 'right'; select the anterior image side")
    if vertebra_model not in (None, "", CERVICAL_MODEL):
        raise ValueError(f"Unknown cervical vertebra model; available: {CERVICAL_MODEL}")
    if femoral_model or s1_model:
        raise ValueError("Femoral and S1 models are not available for cervical radiographs")


async def prediction_request(
    file: UploadFile = File(...), modality: str = Form(...), body_part: str = Form(...),
    view: str | None = Form(None), laterality: str | None = Form(None),
    vertebra_model: str | None = Form(None), femoral_model: str | None = Form(None),
    s1_model: str | None = Form(None), calibration: str | None = Form(None),
    processing_mode: str = Form("standard"), cpu_threads: int = Form(2),
    crop_localizer: bool = Form(True),
    toolbar_removal: bool = Form(False),
    anterior_side: str | None = Form(None),
):
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The uploaded file exceeds 50 MB")
    try:
        settings = runtime.parse_options(processing_mode, cpu_threads, crop_localizer, toolbar_removal)
        if body_part.strip().lower() == "cervical":
            _validate_cervical_request(modality, view, laterality, vertebra_model,
                                      femoral_model, s1_model, anterior_side)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"settings": settings, "payload": payload, "modality": modality, "body_part": body_part,
            "view": view, "laterality": laterality, "vertebra_model": vertebra_model,
            "femoral_model": femoral_model, "s1_model": s1_model, "calibration": calibration,
            "anterior_side": anterior_side}


def run_prediction(request, reporter=None, cancelled=None):
    request = dict(request)
    settings = request.pop("settings")
    with runtime.session(settings, reporter, cancelled):
        if settings.low_memory:
            release_models()
        try:
            return _analyze(**request)
        finally:
            if settings.low_memory:
                release_models()


@app.post("/predict", summary="Find landmarks and measure a lateral lumbar or cervical radiograph")
async def predict(request=Depends(prediction_request)):
    return await run_in_threadpool(run_prediction, request)


@app.post("/predict-stream", summary="Process an image with live progress and heartbeats")
async def predict_stream(request=Depends(prediction_request)):
    return StreamingResponse(stream_job(lambda report, cancel: run_prediction(request, report, cancel)),
                             media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


def _analyze(payload, modality, body_part, view, laterality,
             vertebra_model, femoral_model, s1_model, calibration, anterior_side=None):
    is_cervical = body_part.strip().lower() == "cervical"
    try:
        runtime.report("decoding", "Reading the original image")
        pixel_array = _decode_grayscale(payload)
        if is_cervical:
            _validate_cervical_request(modality, view, laterality, vertebra_model,
                                      femoral_model, s1_model, anterior_side)
            prediction = cervical_prediction(pixel_array, anterior_side, model=vertebra_model or CERVICAL_MODEL)
        else:
            prediction = spinopelvic_prediction(
                pixel_array,
                modality,
                body_part,
                view,
                laterality,
                {"vertebrae": vertebra_model, "femoral": femoral_model, "s1": s1_model},
            )
        if runtime.options().low_memory:
            release_models()
        if not is_cervical:
            runtime.report("measuring", "Fitting femoral heads and calculating available measurements")
            analysis = spinopelvic_measurements_from_landmarks(
                prediction["landmarks"]["vertebrae"],
                prediction["landmarks"]["S1"]["superior"],
                prediction["femoral_mask"],
                prediction["mask"],
            )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    runtime.report("encoding", "Preparing the image and segmentation overlays")
    encoded = {}
    for name in ("image", "mask", "femoral_mask"):
        output = io.BytesIO()
        Image.fromarray(prediction[name]).save(output, format="PNG", optimize=True)
        encoded[f"{name}_png"] = base64.b64encode(output.getvalue()).decode("ascii")
    # Every run, including the serial batch, reads the ORIGINAL image's ruler. The
    # inference crop can exclude it. Calibration failure must not lose segmentation.
    try:
        try:
            cached = json.loads(calibration) if calibration else None
        except (ValueError, TypeError):
            cached = None
        runtime.report("calibration", "Checking image calibration")
        image_calibration = calibration_from_payload(
            payload, include_preview=False, cached=cached,
        )
        image_calibration.pop('image_png', None)
    except runtime.Cancelled:
        raise
    except Exception:
        logging.getLogger(__name__).exception('Optional image calibration failed')
        image_calibration = {
            'version': 1, 'source_sha256': hashlib.sha256(payload).hexdigest(),
            'width': int(pixel_array.shape[1]), 'height': int(pixel_array.shape[0]),
            'coordinate_space': 'original_image', 'status': 'unavailable',
            'spacing': None, 'candidates': [], 'selected_index': None,
            'message': 'Automatic calibration unavailable. Review the reference in Image calibration.',
        }
    if is_cervical:
        runtime.report("measuring", "Calculating C2–C7 Cobb angle and sagittal vertical axis")
        spacing = image_calibration.get("spacing")
        # Calibration has already checked the digest/dimensions of the untouched
        # upload, and the cervical model restores every point to that same frame.
        geometry = {**prediction["landmarks"], "region": "cervical", "anterior_side": anterior_side,
                    "source_sha256": image_calibration["source_sha256"],
                    "image_width": int(pixel_array.shape[1]), "image_height": int(pixel_array.shape[0]),
                    "coordinate_space": "original_image",
                    "pixel_spacing": [spacing["row_mm"], spacing["column_mm"]] if spacing else None,
                    "spacing_source": spacing.get("source") if spacing else None}
        try:
            analysis = cervical_measurements_from_geometry(geometry)
        except (AttributeError, TypeError, ValueError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
    # Store model, crop, scale and resource provenance alongside the measurements.
    qc = {**prediction.get("qc", {}), **analysis.get("qc", {}),
          "models": prediction["models"], "framing": prediction["framing"],
          "processing": {"mode": runtime.options().mode,
                         "cpu_threads": runtime.options().inference_threads,
                         "runtime": "onnxruntime", "runtime_version": ort.__version__,
                         "providers": runtime.providers(),
                         "crop_localizer": True if is_cervical else runtime.options().crop_localizer,
                         "toolbar_removal": False if is_cervical else runtime.options().toolbar_removal,
                         "search_batch": runtime.options().search_batch}}
    if is_cervical:
        # The cervical landmark model always needs its trained detector crop, and
        # returns the original image. Retain user preferences separately from
        # the processing actually applied by this model.
        qc["processing"]["requested_crop_localizer"] = runtime.options().crop_localizer
        qc["processing"]["requested_toolbar_removal"] = runtime.options().toolbar_removal
    for field in ("provenance", "warnings"):
        if field in prediction:
            qc[field] = prediction[field]
    runtime.report("complete", "Measurements ready")
    return {**encoded, **analysis, "qc": qc, "labels": {} if is_cervical else VERTEBRA_LABELS,
            "calibration": image_calibration}


@app.post("/measure", summary="Recalculate measurements from corrected landmarks")
async def measure(geometry: dict[str, object]) -> dict[str, object]:
    """Return measurements after interactive landmark correction."""

    try:
        if geometry.get("region") == "cervical":
            return await run_in_threadpool(cervical_measurements_from_geometry, geometry)
        if geometry.get("region") not in (None, "lumbar"):
            raise ValueError("Unknown geometry region; available: lumbar, cervical")
        return await run_in_threadpool(
            spinopelvic_measurements_from_geometry,
            geometry.get("vertebrae"),
            geometry.get("s1_superior"),
            geometry.get("femoral_circles"),
            allow_empty=True,
        )
    except (AttributeError, TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/models", summary="Which model can read which structure")
def models(body_part: str = "lumbar") -> dict[str, list[str]]:
    if body_part.strip().lower() == "cervical":
        return {"vertebrae": [CERVICAL_MODEL], "femoral": [], "s1": []}
    if body_part.strip().lower() != "lumbar":
        raise HTTPException(status_code=422, detail="Unknown body part; available: lumbar, cervical")
    return {structure: list(names) for structure, names in MODEL_CHOICES.items()}


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


async def calibration_request(file: UploadFile = File(...), profile: str | None = Form(None),
                              calibration: str | None = Form(None),
                              include_preview: bool = Form(True), preview_only: bool = Form(False),
                              processing_mode: str = Form("standard"), cpu_threads: int = Form(2)):
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The selected file is empty")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The selected file exceeds 50 MB")
    try:
        profile = validate_profile(json.loads(profile)) if profile else None
        cached = json.loads(calibration) if calibration else None
        policy = runtime.parse_options(processing_mode, cpu_threads)
    except Exception as error:
        raise HTTPException(status_code=422, detail="Invalid calibration settings") from error
    return {"payload": payload, "profile": profile, "include_preview": include_preview,
            "preview_only": preview_only, "policy": policy, "cached": cached}


def run_calibration(request, reporter=None, cancelled=None):
    with runtime.session(request['policy'], reporter, cancelled):
        if request['policy'].low_memory:
            release_models()
        try:
            runtime.report("calibration", "Checking image calibration")
            result = calibration_from_payload(request['payload'], request['profile'],
                                              request['include_preview'], request['preview_only'], cached=request['cached'])
            runtime.checkpoint()
            return result
        except runtime.Cancelled:
            raise
        except Exception as error:
            raise HTTPException(status_code=422, detail="Could not read the image for calibration") from error
        finally:
            if request['policy'].low_memory:
                release_models()


@app.post("/calibrate", summary="Read image scale from an original radiograph")
async def calibrate(request=Depends(calibration_request)):
    return await run_in_threadpool(run_calibration, request)


@app.post("/calibrate-stream", summary="Read image scale with progress and heartbeats")
async def calibrate_stream(request=Depends(calibration_request)):
    return StreamingResponse(stream_job(lambda report, cancel: run_calibration(request, report, cancel)),
                             media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@app.post("/calibration-profile", summary="Learn annotation color from a corrected reference")
async def calibration_profile(file: UploadFile = File(...), endpoints: str = Form(...)):
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload or len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Select an image smaller than 50 MB")
    try:
        return await run_in_threadpool(learn_profile, payload, json.loads(endpoints))
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
