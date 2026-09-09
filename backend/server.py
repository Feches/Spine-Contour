"""FastAPI server for Spine-Contour inference."""

from __future__ import annotations

import base64
import io
import json
import hashlib
import logging

import numpy as np
import torch
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
    from models import MODEL_CHOICES, VERTEBRA_LABELS, spinopelvic_prediction
    from utils import (
        spinopelvic_measurements_from_geometry,
        spinopelvic_measurements_from_landmarks,
    )


MAX_UPLOAD_BYTES = 50 * 1024 * 1024

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


async def prediction_request(
    file: UploadFile = File(...), modality: str = Form(...), body_part: str = Form(...),
    view: str | None = Form(None), laterality: str | None = Form(None),
    vertebra_model: str | None = Form(None), femoral_model: str | None = Form(None),
    s1_model: str | None = Form(None), calibration: str | None = Form(None),
    processing_mode: str = Form("standard"), cpu_threads: int = Form(2),
):
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The uploaded file exceeds 50 MB")
    try:
        settings = runtime.parse_options(processing_mode, cpu_threads)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"settings": settings, "payload": payload, "modality": modality, "body_part": body_part,
            "view": view, "laterality": laterality, "vertebra_model": vertebra_model,
            "femoral_model": femoral_model, "s1_model": s1_model, "calibration": calibration}


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


@app.post("/predict", summary="Segment and measure a lateral lumbar radiograph")
async def predict(request=Depends(prediction_request)):
    return await run_in_threadpool(run_prediction, request)


@app.post("/predict-stream", summary="Process an image with live progress and heartbeats")
async def predict_stream(request=Depends(prediction_request)):
    return StreamingResponse(stream_job(lambda report, cancel: run_prediction(request, report, cancel)),
                             media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


def _analyze(payload, modality, body_part, view, laterality,
             vertebra_model, femoral_model, s1_model, calibration):
    try:
        runtime.report("decoding", "Reading the original image")
        pixel_array = _decode_grayscale(payload)
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
    # `qc` stays opaque to the renderer, which reads only `qc.femoral.confidence`;
    # the model choice and the crop ride along so a stored result says what
    # produced it.
    qc = {**analysis.get("qc", {}), "models": prediction["models"], "framing": prediction["framing"],
          "processing": {"mode": runtime.options().mode,
                         "cpu_threads": torch.get_num_threads(),
                         "search_batch": runtime.options().search_batch}}
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
    runtime.report("complete", "Measurements ready")
    return {**encoded, **analysis, "qc": qc, "labels": VERTEBRA_LABELS, "calibration": image_calibration}


@app.post("/measure", summary="Recalculate measurements from corrected landmarks")
async def measure(geometry: dict[str, object]) -> dict[str, object]:
    """Return measurements after interactive landmark correction."""

    try:
        return await run_in_threadpool(
            spinopelvic_measurements_from_geometry,
            geometry.get("vertebrae"),
            geometry.get("s1_superior"),
            geometry.get("femoral_circles"),
        )
    except (AttributeError, TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/models", summary="Which model can read which structure")
def models() -> dict[str, list[str]]:
    return {structure: list(names) for structure, names in MODEL_CHOICES.items()}


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


async def calibration_request(file: UploadFile = File(...), profile: str | None = Form(None),
                              include_preview: bool = Form(True), preview_only: bool = Form(False),
                              processing_mode: str = Form("standard"), cpu_threads: int = Form(2)):
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        raise HTTPException(status_code=400, detail="The selected file is empty")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The selected file exceeds 50 MB")
    try:
        profile = validate_profile(json.loads(profile)) if profile else None
        policy = runtime.parse_options(processing_mode, cpu_threads)
    except Exception as error:
        raise HTTPException(status_code=422, detail="Invalid calibration settings") from error
    return {"payload": payload, "profile": profile, "include_preview": include_preview,
            "preview_only": preview_only, "policy": policy}


def run_calibration(request, reporter=None, cancelled=None):
    with runtime.session(request['policy'], reporter, cancelled):
        if request['policy'].low_memory:
            release_models()
        try:
            runtime.report("calibration", "Checking image calibration")
            result = calibration_from_payload(request['payload'], request['profile'],
                                              request['include_preview'], request['preview_only'])
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
