"""Which processor runs the ONNX models: the CPU, or a GPU the bundled runtime can drive.

The Windows installer bundles ONNX Runtime's DirectML build, which offers a
`DmlExecutionProvider` device for each hardware DirectX 12 GPU (NVIDIA, AMD or
Intel) through the ordinary display driver. macOS and the CPU wheel offer only the
CPU. A per-application GPU preference in Windows or a vendor control panel cannot
move this work: it picks the GPU that draws a program's graphics, while inference
runs in the backend process on the provider its session was created with.

A GPU is identified by its PCI identity, `gpu:<vendor>:<device>` in lowercase hex,
with `:<n>` for the nth identical card. DirectML addresses a GPU by its Windows
adapter index, which follows display wiring and the graphics preference, so the
index is looked up for each request and never saved.
"""
from __future__ import annotations

from dataclasses import dataclass
import re

import onnxruntime as ort

DIRECTML = "DmlExecutionProvider"
_GPU_ID = re.compile(r"gpu:[0-9a-f]{4,8}:[0-9a-f]{4,8}(?::(?:[2-9]|[1-9][0-9]))?")


@dataclass(frozen=True)
class Processor:
    id: str
    kind: str
    name: str
    adapter: int | None = None
    memory_mb: int | None = None

    def public(self):
        return {"id": self.id, "kind": self.kind, "name": self.name, "memory_mb": self.memory_mb}


CPU = Processor("cpu", "cpu", "CPU")


def valid(processor) -> bool:
    return isinstance(processor, str) and (processor == CPU.id or _GPU_ID.fullmatch(processor) is not None)


def _name(hardware, metadata):
    # ONNX Runtime replaces non-ASCII characters (a trademark sign) with spaces.
    name = " ".join(str(metadata.get("Description", "")).split())
    return name or " ".join(f"{hardware.vendor} GPU".split())


def _memory(metadata):
    value = str(metadata.get("DxgiVideoMemory", "")).removesuffix(" MB")
    return int(value) if value.isdigit() else None


def available() -> list[Processor]:
    """The CPU, then each GPU the bundled runtime can use, in Windows adapter order."""
    try:
        devices = ort.get_ep_devices()
    except Exception:  # A runtime without device discovery can still use the CPU.
        devices = []
    gpus = {}
    for device in devices:
        hardware = device.device
        metadata = dict(hardware.metadata)
        adapter = str(metadata.get("DxgiAdapterNumber", ""))
        # DirectML silently uses adapter 0 for a device without an adapter number,
        # which may be a different GPU from the one named, so such devices are not offered.
        if device.ep_name != DIRECTML or hardware.type != ort.OrtHardwareDeviceType.GPU or not adapter.isdigit():
            continue
        gpus.setdefault(int(adapter), (hardware.vendor_id, hardware.device_id, _name(hardware, metadata), _memory(metadata)))
    offered, seen = [CPU], {}
    for adapter, (vendor, device, name, memory) in sorted(gpus.items()):
        identity = f"gpu:{vendor:04x}:{device:04x}"
        seen[identity] = seen.get(identity, 0) + 1
        offered.append(Processor(identity if seen[identity] == 1 else f"{identity}:{seen[identity]}",
                                 "gpu", name, adapter, memory))
    return offered


def resolve(requested: str) -> tuple[Processor, str | None]:
    """The processor a request runs on, and why it is not the one requested (None if it is)."""
    if requested == CPU.id:
        return CPU, None
    for processor in available():
        if processor.id == requested:
            return processor, None
    return CPU, "The selected GPU was not found; running the models on the CPU"
