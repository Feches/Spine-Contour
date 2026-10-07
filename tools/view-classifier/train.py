"""Train a whole-film classifier from a frozen, group-separated JSON manifest.

Each record requires cache (224px grayscale letterbox), label, split, cluster,
source. Never tune on test/external/challenge partitions. See model card.
"""
import argparse, json, time, random, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torchvision import models, transforms
from sklearn.metrics import confusion_matrix, classification_report, balanced_accuracy_score
from augmentation import WholeFilmAugmentation
CLASSES = ['cervical_lateral', 'lumbar_lateral', 'full_spine_lateral', 'lumbar_ap', 'other']
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]

class Films(Dataset):

    def __init__(self, rows, train=False):
        self.rows = rows
        self.images = [Image.open(r['cache']).convert('RGB') for r in rows]
        aug = [WholeFilmAugmentation()] if train else []
        self.tf = transforms.Compose(aug + [transforms.ToTensor(), transforms.Normalize(MEAN, STD)])

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        return (self.tf(self.images[i]), CLASSES.index(self.rows[i]['label']))

def evaluate(model, loader, device):
    logits = []
    labels = []
    model.eval()
    with torch.inference_mode():
        for x, y in loader:
            logits.append(model(x.to(device)).cpu())
            labels.append(y)
    return (torch.cat(logits), torch.cat(labels))

def metrics(logits, y, temp, threshold):
    prob = torch.softmax(logits / temp, 1)
    conf, pred = prob.max(1)
    accept = conf >= threshold
    supported = pred < 3

    def score(mask):
        n = int(mask.sum())
        return {'count': n, 'accuracy': float((pred[mask] == y[mask]).float().mean()) if n else None}
    return {'n': len(y), 'accuracy': float((pred == y).float().mean()), 'balanced_accuracy': balanced_accuracy_score(y, pred), 'confusion_matrix': confusion_matrix(y, pred, labels=range(5)).tolist(), 'classification_report': classification_report(y, pred, labels=range(5), target_names=CLASSES, output_dict=True, zero_division=0), 'confident': score(accept), 'automatic_supported_routes': score(accept & supported), 'manual_selection_count': int((~(accept & supported)).sum())}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--manifest', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--epochs', type=int, default=10)
    a = p.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    torch.set_num_threads(4)
    torch.backends.cudnn.benchmark = True
    rows = json.load(open(a.manifest))
    splits = {s: [r for r in rows if r['split'] == s] for s in ['train', 'val', 'test', 'external', 'challenge']}
    for s, rs in splits.items():
        for t, ts in splits.items():
            if s != t:
                assert not {r['cluster'] for r in rs} & {r['cluster'] for r in ts}
    ds = Films(splits['train'], True)
    counts = np.bincount([CLASSES.index(r['label']) for r in splits['train']], minlength=5)
    sampler = WeightedRandomSampler([1 / counts[CLASSES.index(r['label'])] for r in splits['train']], num_samples=len(ds), replacement=True)
    train = DataLoader(ds, batch_size=64, sampler=sampler, num_workers=8, pin_memory=True, persistent_workers=True)
    loaders = {s: DataLoader(Films(rs), batch_size=96, num_workers=2) for s, rs in splits.items() if s != 'train' and rs}
    device = 'cuda'
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    model.classifier[3] = nn.Linear(1024, 5)
    model.to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=0.0003, weight_decay=0.01)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, a.epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)
    best = -1
    history = []
    start = time.time()
    for epoch in range(a.epochs):
        model.train()
        losses = []
        for x, y in train:
            x, y = (x.to(device), y.to(device))
            opt.zero_grad(set_to_none=True)
            loss = criterion(model(x), y)
            loss.backward()
            opt.step()
            losses.append(loss.item())
        sched.step()
        z, y = evaluate(model, loaders['val'], device)
        score = balanced_accuracy_score(y, z.argmax(1))
        record = {'epoch': epoch + 1, 'loss': float(np.mean(losses)), 'val_balanced_accuracy': score, 'elapsed_seconds': time.time() - start}
        history.append(record)
        print(json.dumps(record), flush=True)
        if score > best:
            best = score
            torch.save(model.cpu().state_dict(), out / 'best.pt')
            model.to(device)
    model.load_state_dict(torch.load(out / 'best.pt', weights_only=True))
    z, y = evaluate(model, loaders['val'], device)
    temps = np.linspace(0.5, 3, 51)
    temp = float(min(temps, key=lambda t: nn.functional.cross_entropy(z / t, y).item()))
    probs = torch.softmax(z / temp, 1)
    c, pred = probs.max(1)
    threshold = 0.99
    for t in np.arange(0.7, 0.995, 0.01):
        mask = (c >= t) & (pred < 3)
        if mask.sum() >= 30 and float((pred[mask] == y[mask]).float().mean()) >= 0.98:
            threshold = float(round(t, 2))
            break
    report = {'classes': CLASSES, 'seed': 42, 'epochs': a.epochs, 'architecture': 'mobilenet_v3_small', 'input_size': 224, 'augmentation': 'whole-film-aggressive-v2-no-crop', 'temperature': temp, 'threshold': threshold, 'history': history, 'manifest_sha256': hashlib.sha256(Path(a.manifest).read_bytes()).hexdigest(), 'partitions': {}}
    predictions = []
    for s, loader in loaders.items():
        z, y = evaluate(model, loader, device)
        report['partitions'][s] = metrics(z, y, temp, threshold)
        prob = torch.softmax(z / temp, 1)
        for r, pr in zip(splits[s], prob):
            predictions.append({**r, 'prediction': CLASSES[int(pr.argmax())], 'confidence': float(pr.max()), 'probabilities': pr.tolist()})
    json.dump(report, open(out / 'metrics.json', 'w'), indent=2)
    json.dump(predictions, open(out / 'predictions.json', 'w'), indent=2)
    model.cpu().eval()
    dummy = torch.zeros(1, 3, 224, 224)
    torch.onnx.export(model, dummy, str(out / 'view_classifier.onnx'), input_names=['image'], output_names=['logits'], opset_version=17)
    import onnxruntime as ort
    so = ort.SessionOptions()
    so.intra_op_num_threads = 2
    sess = ort.InferenceSession(str(out / 'view_classifier.onnx'), so, providers=['CPUExecutionProvider'])
    x = next(iter(loaders['test']))[0][:1]
    ref = model(x).detach().numpy()
    actual = sess.run(None, {'image': x.numpy()})[0]
    assert np.max(np.abs(ref - actual)) < 0.0001
    for _ in range(5):
        sess.run(None, {'image': x.numpy()})
    times = []
    for _ in range(30):
        t = time.perf_counter()
        sess.run(None, {'image': x.numpy()})
        times.append((time.perf_counter() - t) * 1000)
    report['onnx_max_absolute_error'] = float(np.max(np.abs(ref - actual)))
    report['cpu_inference_ms_median'] = float(np.median(times))
    report['training_seconds'] = time.time() - start
    json.dump(report, open(out / 'metrics.json', 'w'), indent=2)
    print('DONE', json.dumps({k: v for k, v in report.items() if k not in ['history', 'partitions']}), flush=True)
if __name__ == '__main__':
    main()
