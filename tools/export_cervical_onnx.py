"""Export the trusted cervical DETR and HRNET checkpoints.

python tools/export_cervical_onnx.py [--kind cervical_detr|cervical_hrnet]
Add --image PATH (repeatable) to retain real-film preprocessing and numerical
parity evidence. With no --kind, each graph is exported in a fresh process.
"""
from pathlib import Path
import argparse
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024*1024), b""):
            value.update(block)
    return value.hexdigest()


def export(kind, destination, hrnet_checkpoint, detr_directory, image_paths=()):
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    import timm
    import transformers
    from PIL import Image
    from backend.models.cervical_training import load_hrnet, CervicalDetector
    from backend.models.cervical import detector_input, landmark_input, detection_from_output

    torch.set_num_threads(2)
    torch.manual_seed(123)
    detector = kind == "cervical_detr"
    model = CervicalDetector(detr_directory) if detector else load_hrnet(hrnet_checkpoint)
    # Smaller tracing canvas bounds conversion memory. Dynamic-axis parity below
    # exercises native detector sizes; tracing must not freeze the sample shape.
    samples = (torch.rand(1, 3, 320, 384), torch.ones(1, 320, 384, dtype=torch.int64)) if detector else (torch.rand(1, 3, 384, 384),)
    names = ["pixel_values", "pixel_mask"] if detector else ["image"]
    outputs = ["logits", "pred_boxes"] if detector else ["heatmaps"]
    destination.mkdir(parents=True, exist_ok=True)
    path = destination / f"{kind}.onnx"
    dynamic = {"pixel_values": {2: "height", 3: "width"},
               "pixel_mask": {1: "height", 2: "width"}} if detector else None
    with torch.inference_mode():
        torch.onnx.export(model.eval(), samples, str(path), dynamo=False,
                          opset_version=17, input_names=names, output_names=outputs,
                          dynamic_axes=dynamic)
    onnx.checker.check_model(str(path))
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = 2
    settings.inter_op_num_threads = 1
    settings.add_session_config_entry("session.intra_op.allow_spinning", "0")
    session = ort.InferenceSession(str(path), sess_options=settings, providers=["CPUExecutionProvider"])
    checks = []

    def compare(label, tensors, check_peaks=False):
        with torch.inference_mode():
            expected = model.reference(*tensors) if detector else model(*tensors)
        expected = expected if isinstance(expected, tuple) else (expected,)
        feeds = {name: tensor.numpy() for name, tensor in zip(names, tensors)}
        actual = session.run(None, feeds)
        errors = []
        for wanted, got in zip(expected, actual):
            np.testing.assert_allclose(wanted.numpy(), got, rtol=2e-3, atol=2e-3)
            errors.append(float(np.max(np.abs(wanted.numpy()-got))))
        if check_peaks:
            np.testing.assert_array_equal(expected[0].numpy().reshape(1, 23, -1).argmax(-1),
                                          actual[0].reshape(1, 23, -1).argmax(-1))
        checks.append({"case": label, "input_shape": list(tensors[0].shape), "max_abs_error": errors,
                       "decoded_peaks_equal": True if check_peaks else None})
        return actual

    compare("tracing_sample", samples)
    # Both orientations and non-multiples of32 catch frozen flatten/position
    # shapes in the DETR export. These are valid native preprocessing dimensions.
    if detector:
        for h, w in ((1067, 800), (800, 1067)):
            compare(f"dynamic_{h}x{w}", (torch.zeros(1, 3, h, w), torch.ones(1, h, w, dtype=torch.int64)))
    else:
        compare("blank_crop", (torch.zeros_like(samples[0]),))

    preprocessing = []
    if image_paths:
        from transformers import DetrImageProcessor
        processor = DetrImageProcessor.from_pretrained(str(detr_directory), local_files_only=True)
        # HRNET image checks use the already exported cervical detector, never GT.
        if not detector:
            detector_session = ort.InferenceSession(str(destination / "cervical_detr.onnx"),
                sess_options=settings, providers=["CPUExecutionProvider"])
        for image_path in image_paths:
            image = np.asarray(Image.open(image_path).convert("L"))
            feeds = detector_input(image)
            reference = processor(images=np.repeat(image[..., None], 3, axis=2), return_tensors="np")
            error = np.abs(feeds["pixel_values"]-reference["pixel_values"])
            # Cross-runtime uint8 rounding can differ by one intensity at ties.
            if float(error.max()) > 1/255/.224+2e-6 or float(error.mean()) > 2e-4:
                raise AssertionError("Cervical detector preprocessing differs from the saved processor")
            preprocessing.append({"image_sha256": digest(image_path), "mean_abs_error": float(error.mean()),
                                  "max_abs_error": float(error.max())})
            if detector:
                converted = compare(image_path.name, tuple(torch.from_numpy(feeds[name]) for name in names))
                with torch.inference_mode():
                    original = model.reference(*(torch.from_numpy(reference[name]) for name in names))
                original_box = detection_from_output(*(value.numpy() for value in original), image.shape)
                converted_box = detection_from_output(*converted, image.shape)
                if (original_box is None) != (converted_box is None):
                    raise AssertionError("Runtime preprocessing changed whether the cervical spine was detected")
                if original_box is not None:
                    box_error = float(np.max(np.abs(original_box["bbox"]-converted_box["bbox"])))
                    if box_error > .25:
                        raise AssertionError("Runtime preprocessing shifted a detected box by more than .25 source pixels")
                    preprocessing[-1]["detector_box_max_error_source_px"] = box_error
            else:
                logits, boxes = detector_session.run(None, feeds)
                found = detection_from_output(logits, boxes, image.shape)
                if found is None:
                    raise AssertionError(f"No cervical detection for parity film {image_path.name}")
                tensor, _ = landmark_input(image, found["bbox"])
                compare(image_path.name, (torch.from_numpy(tensor),), check_peaks=True)

    source_paths = ([detr_directory / name for name in ("model.safetensors", "config.json", "preprocessor_config.json")]
                    if detector else [hrnet_checkpoint])
    metadata = {"kind": kind, "opset": 17, "precision": "float32",
                "input_size": "dynamic_aspect_ratio_short800_long1333" if detector else [384, 384],
                "inputs": {"pixel_values": [1, 3, "height", "width"], "pixel_mask": [1, "height", "width"]} if detector else {"image": [1, 3, 384, 384]},
                "batch": 1, "dataset": "CSXA", "train_images": 3474,
                "validation_images": 992, "test_images": 497,
                "source_checkpoint": "csxa_detr_hrnet/runs/detr/best" if detector else "csxa_detr_hrnet/runs/hrnet/best.pt",
                "checkpoint_files": {item.name: digest(item) for item in source_paths},
                "checkpoint_sha256": digest(source_paths[0]),
                "onnx_sha256": digest(path), "torch": torch.__version__, "timm": timm.__version__,
                "transformers": transformers.__version__, "onnx": onnx.__version__,
                "onnxruntime": ort.__version__, "parity": checks, "real_image_preprocessing": preprocessing}
    path.with_suffix(".json").write_text(json.dumps(metadata, indent=2)+"\n")
    print(f"Exported and validated {kind}: {path}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=["cervical_detr", "cervical_hrnet"])
    parser.add_argument("--output", type=Path, default=ROOT / "backend/onnx")
    parser.add_argument("--hrnet-checkpoint", type=Path, default=ROOT / "backend/weights/cervical_hrnet.pt")
    parser.add_argument("--detr-directory", type=Path, default=ROOT / "backend/weights/cervical_detr")
    parser.add_argument("--image", type=Path, action="append", default=[])
    args = parser.parse_args()
    if args.kind:
        export(args.kind, args.output, args.hrnet_checkpoint, args.detr_directory, args.image)
    else:
        import subprocess
        for kind in ("cervical_detr", "cervical_hrnet"):
            command = [sys.executable, __file__, "--kind", kind, "--output", str(args.output),
                       "--hrnet-checkpoint", str(args.hrnet_checkpoint), "--detr-directory", str(args.detr_directory)]
            for image in args.image:
                command.extend(["--image", str(image)])
            subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
