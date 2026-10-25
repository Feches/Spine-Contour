"""Selected S1 decoder for PyTorch export; desktop uses the exported graph."""
import torch
import torchvision.models.detection.roi_heads as heads

LEGACY_INFERENCE = heads.keypointrcnn_inference


def configure_s1_decoder(decoder):
    if decoder == 'local_softmax':
        def local_inference(logits, boxes):
            counts = [b.shape[0] for b in boxes]
            count = logits.shape[0]
            # ONNX reductions over zero detections differ between providers.
            # Decode one dummy ROI, then discard it before splitting results.
            bs = torch.cat([*boxes, logits.new_zeros((1, 4))])
            logits = torch.cat([logits, logits.new_zeros((1, 2, logits.shape[-2], logits.shape[-1]))])
            flat = logits.float().reshape(-1, 2, logits.shape[-2]*logits.shape[-1])
            peak = flat.argmax(-1)
            height, width = logits.shape[-2:]
            offsets = torch.arange(-3, 4, device=logits.device)
            dy, dx = torch.meshgrid(offsets, offsets, indexing='ij')
            x = (peak[..., None] % width + dx.flatten()).clamp(0, width-1)
            y = (peak[..., None] // width + dy.flatten()).clamp(0, height-1)
            weights = flat.gather(2, y*width+x).softmax(-1)
            xy = torch.stack([(weights*x).sum(-1), (weights*y).sum(-1)], -1)
            wh = (bs[:, 2:]-bs[:, :2]).clamp_min(1)
            xy = (xy+.5)/width*wh[:, None]+bs[:, None, :2]
            points = torch.cat([xy, torch.ones_like(xy[:, :, :1])], -1)
            scores = flat.max(-1).values
            return list(points[:count].split(counts)), list(scores[:count].split(counts))
        heads.keypointrcnn_inference = local_inference
    elif decoder == 'legacy_subpixel':
        heads.keypointrcnn_inference = LEGACY_INFERENCE
    else:
        raise ValueError(f'Unsupported selected decoder: {decoder}')
