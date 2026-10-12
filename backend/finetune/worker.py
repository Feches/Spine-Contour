"""Subprocess entry point for local training. JSON-lines progress on stdout."""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import random
import time

from .data import TARGETS, sha256


def devices():
    import torch
    import timm, segmentation_models_pytorch, onnxruntime, pydicom, scipy  # verify the optional runtime
    result = [{'id': 'cpu', 'name': 'CPU'}]
    if torch.cuda.is_available():
        kind = 'rocm' if torch.version.hip else 'cuda'
        result.extend({'id': f'{kind}:{i}', 'name': f'{kind.upper()} · {torch.cuda.get_device_name(i)}'}
                      for i in range(torch.cuda.device_count()))
    return result


def select_device(requested):
    if requested not in {d['id'] for d in devices()}:
        raise ValueError('Selected training processor is unavailable in this Python environment')
    return 'cuda:' + requested.split(':')[1] if requested.startswith(('cuda:', 'rocm:')) else 'cpu'


def validate_config(config):
    if config.get('target') not in TARGETS:
        raise ValueError('Choose a supported training target')
    for key, low, high in [('epochs', 1, 200), ('batchSize', 1, 16), ('threads', 1, 16)]:
        value = config.get(key)
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f'{key} must be an integer between {low} and {high}')
    rate = config.get('learningRate')
    if type(rate) not in (int, float) or not math.isfinite(rate) or not 1e-7 <= rate <= 1e-3:
        raise ValueError('Learning rate must be between 0.0000001 and 0.001')
    if not Path(config.get('checkpoint', '')).is_file():
        raise ValueError('Select an existing starting PyTorch checkpoint')


def passes_gate(baseline, candidate):
    """Lower error is better. No tolerated regression, overall or per labelled slot."""
    return (math.isfinite(candidate['error']) and candidate['error'] <= baseline['error']
            and all(math.isfinite(v) and v <= baseline['per_label'][k]
                    for k, v in candidate['per_label'].items())
            and candidate['per_label'].keys() == baseline['per_label'].keys())


def run(config, output, emit):
    import numpy as np
    import cv2
    from PIL import Image
    import torch
    from torch import nn
    from torch.utils.data import DataLoader, Dataset
    from .data import snapshot
    validate_config(config)
    torch.set_num_threads(config['threads'])
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    device = select_device(config['device'])
    target = config['target']
    if target == 'cervical_landmarks':
        from ..models.cervical import LANDMARK_NAMES
        label_names = list(LANDMARK_NAMES)
    elif target == 'lumbar_landmarks':
        from ..models.hrnet import LANDMARKS
        label_names = [' '.join(p) for p in LANDMARKS]
    else:
        label_names = [f'L{i}' for i in range(1, 6)]
    emit(stage='preparing', message='Loading training runtime and starting checkpoint')
    checkpoint_path = Path(config['checkpoint'])
    checkpoint_hash = sha256(checkpoint_path)
    checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
    if target == 'cervical_landmarks':
        from ..models.cervical_training import CervicalHRNet
        args = checkpoint.get('args', {})
        if args.get('input_size', 384) != 384 or args.get('heatmap_size', 96) != 96:
            raise ValueError('Expected a 384-pixel cervical HRNet checkpoint')
        model = CervicalHRNet()
        model.load_state_dict(checkpoint['state_dict'], strict=True)
    elif target == 'lumbar_landmarks':
        from ..models.hrnet import build_hrnet_model, LANDMARKS
        if tuple(tuple(x) for x in checkpoint.get('landmarks', ())) != LANDMARKS:
            raise ValueError('Lumbar checkpoint landmark ordering does not match the app')
        if checkpoint.get('size', 768) != 768 or checkpoint.get('stride', 4) != 4:
            raise ValueError('Expected a 768-pixel, stride-four lumbar HRNet checkpoint')
        model = build_hrnet_model(checkpoint)
    else:
        from ..models.training import build_unet
        if checkpoint.get('size', 768) != 768:
            raise ValueError('Expected a 768-pixel lumbar U-Net checkpoint')
        model = build_unet(checkpoint, 6)
        model.load_state_dict(checkpoint['model'], strict=True)
    model.to(device)
    records = snapshot(config['studies'], target, output, emit)
    class Data(Dataset):
        def __init__(self, split):
            self.rows = [r for r in records if r['split'] == split]
        def __len__(self):
            return len(self.rows)
        def __getitem__(self, index):
            row = self.rows[index]
            with np.load(output / row['cache'], allow_pickle=False) as data:
                item = {k: torch.from_numpy(data[k].copy()) for k in data.files}
            item['subject'] = row['subjectId']
            return item
    loaders = {split: DataLoader(Data(split), batch_size=config['batchSize'] if split == 'train' else 1,
                                  shuffle=split == 'train', num_workers=0)
               for split in ('train', 'validation', 'test')}
    optimizer = torch.optim.AdamW(model.parameters(), lr=config['learningRate'], weight_decay=1e-4)
    def loss_for(pred, item):
        if target == 'lumbar_segmentation':
            return nn.functional.cross_entropy(pred, item['mask'].long().to(device))
        points = item['points'].to(device) / 4
        valid = item['valid'].to(device)
        h, w = pred.shape[-2:]
        yy, xx = torch.meshgrid(torch.arange(h, device=device), torch.arange(w, device=device), indexing='ij')
        expected = torch.exp(-((xx-points[..., 0, None, None])**2 + (yy-points[..., 1, None, None])**2)/(2*(float(checkpoint.get('sigma', 2.0)) if target == 'lumbar_landmarks' else 1.5)**2))
        return (((pred-expected)**2).mean((-2, -1)) * valid).sum() / valid.sum().clamp_min(1)
    previews = output / 'evaluation'
    previews.mkdir()
    def evaluate(split, stage):
        model.eval()
        subjects = {}
        with torch.inference_mode():
            for i, item in enumerate(loaders[split]):
                emit(stage=stage, completed=i, total=len(loaders[split]), message=f'Evaluating {split}')
                prediction = model(item['image'].to(device)).cpu()
                if target == 'lumbar_segmentation':
                    labels = prediction.argmax(1)[0]
                    truth = item['mask'][0]
                    errors = []
                    for label in range(1, 6):
                        a, b = labels == label, truth == label
                        errors.append(float(1 - 2 * (a & b).sum() / (a.sum() + b.sum()).clamp_min(1)))
                    valid = np.ones(5, bool)
                    errors = np.array(errors)
                else:
                    if target == 'lumbar_landmarks':
                        from ..models.hrnet import decode_heatmaps
                        points = decode_heatmaps(prediction, 4)[0]
                    else:
                        from ..models.cervical import decode_heatmaps
                        points = torch.tensor(decode_heatmaps(prediction.numpy()) * 4)
                    errors = ((points - item['points'][0]) * item['scale'][0]).norm(dim=1).numpy()
                    valid = item['valid'][0].numpy()
                canvas = cv2.cvtColor(item['display'][0].numpy(), cv2.COLOR_GRAY2RGB)
                if target == 'lumbar_segmentation':
                    foreground = labels.numpy() > 0
                    canvas[foreground] = (.65*canvas[foreground] + .35*np.array([0,220,200])).astype(np.uint8)
                    for label in range(1, 6):
                        contours, _ = cv2.findContours((truth.numpy() == label).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        cv2.drawContours(canvas, contours, -1, (255,100,30), 1)
                else:
                    for j in np.flatnonzero(valid):
                        actual = tuple(np.rint(item['points'][0, j].numpy()).astype(int))
                        predicted = tuple(np.rint(points[j].numpy()).astype(int))
                        cv2.line(canvas, actual, predicted, (255,255,255), 1)
                        cv2.circle(canvas, actual, 3, (255,100,30), -1)
                        cv2.circle(canvas, predicted, 3, (0,220,200), 1)
                Image.fromarray(canvas).save(previews / f'{stage}-{split}-{i:05d}.png')
                bucket = subjects.setdefault(item['subject'][0], {})
                for slot in np.flatnonzero(valid):
                    bucket.setdefault(label_names[slot], []).append(float(errors[slot]))
        # Average within each subject before across subjects; repeated films cannot dominate.
        labels = sorted({k for sub in subjects.values() for k in sub})
        per_label = {k: float(np.mean([np.mean(sub[k]) for sub in subjects.values() if k in sub])) for k in labels}
        return {'error': float(np.mean([np.mean([np.mean(v) for v in sub.values()]) for sub in subjects.values()])),
                'per_label': per_label, 'subjects': len(subjects)}
    baseline_val = evaluate('validation', 'baseline')
    baseline_test = evaluate('test', 'baseline')
    history, best, selected = [], baseline_val['error'], None
    metadata = {'target': target, 'device': config['device'], 'torch': str(torch.__version__),
                'starting_checkpoint_sha256': checkpoint_hash, 'seed': 42,
                'label_names': label_names,
                'label_source': 'reviewed_corner_polygons' if target == 'lumbar_segmentation' else 'reviewed_landmarks',
                'metric': '1 − body Dice against corner polygons' if target == 'lumbar_segmentation' else 'landmark distance in source pixels',
                'split_counts': {s: len(loaders[s].dataset) for s in loaders},
                'config': {k: v for k, v in config.items() if k not in ('studies', 'checkpoint')},
                'baseline_validation': baseline_val, 'baseline_test': baseline_test}
    (output / 'baseline.json').write_text(json.dumps(metadata, indent=2))
    training_start = time.monotonic()
    total_steps = config['epochs'] * len(loaders['train'])
    for epoch in range(config['epochs']):
        model.train()
        # Single-image batches must not shift pretrained normalization statistics.
        for module in model.modules():
            if isinstance(module, nn.modules.batchnorm._BatchNorm):
                module.eval()
        losses = []
        for step, item in enumerate(loaders['train']):
            optimizer.zero_grad(set_to_none=True)
            prediction = model(item['image'].to(device))
            loss = loss_for(prediction, item)
            if not torch.isfinite(loss):
                raise ValueError('Training produced a non-finite loss; candidate was not accepted')
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5, error_if_nonfinite=True)
            optimizer.step()
            losses.append(float(loss.detach()))
            completed = epoch * len(loaders['train']) + step + 1
            emit(stage='training', epoch=epoch+1, epochs=config['epochs'], completed=completed, total=total_steps,
                 loss=losses[-1], remaining_seconds=(time.monotonic()-training_start)/completed*(total_steps-completed),
                 message=f'Epoch {epoch+1} of {config["epochs"]}')
        result = evaluate('validation', 'validation')
        row = {'epoch': epoch+1, 'loss': float(np.mean(losses)), 'validation': result}
        history.append(row)
        if math.isfinite(result['error']) and result['error'] < best:
            best, selected = result['error'], epoch+1
            # Preserve architecture metadata only, never stale optimizer or prior accuracy claims.
            saved = {k: checkpoint[k] for k in ('encoder', 'backbone', 'size', 'stride', 'sigma', 'landmarks', 'args') if k in checkpoint}
            saved['state_dict' if target == 'cervical_landmarks' else 'model'] = {k: v.detach().cpu() for k, v in model.state_dict().items()}
            saved['fine_tuning'] = {**metadata, 'epoch': selected, 'validation': result}
            torch.save(saved, output / 'candidate.tmp')
            os.replace(output / 'candidate.tmp', output / 'candidate.pt')
        (output / 'history.json').write_text(json.dumps(history, indent=2))
    if selected is not None:
        saved = torch.load(output / 'candidate.pt', map_location='cpu', weights_only=True)
        model.load_state_dict(saved['state_dict' if target == 'cervical_landmarks' else 'model'])
        candidate_test = evaluate('test', 'testing')
        accepted = passes_gate(baseline_test, candidate_test)
    else:
        candidate_test, accepted = None, False
    result = {**metadata, 'history': history, 'selected_epoch': selected, 'candidate_test': candidate_test,
              'gate_passed': accepted, 'candidate': 'candidate.pt' if selected else None,
              'scope': 'Fixed saved image-only crops; no full-pipeline or external-cohort validation. No automatic activation.',
              'message': ('Candidate passed this held-out cohort; review before deployment.' if accepted else
                          'Candidate failed the held-out regression gate.' if selected else
                          'No validation improvement; the starting model is retained.')}
    (output / 'result.json').write_text(json.dumps(result, indent=2, allow_nan=False))
    emit(stage='completed', result=result, message=result['message'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--devices', action='store_true')
    parser.add_argument('--config')
    parser.add_argument('--output')
    args = parser.parse_args()
    start = time.monotonic()
    def emit(**event):
        print(json.dumps({**event, 'elapsed_seconds': time.monotonic()-start}, allow_nan=False), flush=True)
    try:
        if args.devices:
            emit(stage='devices', devices=devices())
        else:
            run(json.loads(Path(args.config).read_text()), Path(args.output), emit)
    except Exception as error:
        emit(stage='failed', message=str(error) or type(error).__name__)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
