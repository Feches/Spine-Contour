"""Fixed-seed whole-film augmentation stress test; never used for model selection."""
import argparse
import json
import random
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw

from augmentation import WholeFilmAugmentation


def tensor(image):
    a = np.asarray(image.convert('RGB'), dtype=np.float32).transpose(2, 0, 1)/255
    a = (a-np.array([.485, .456, .406], np.float32)[:, None, None])/np.array(
        [.229, .224, .225], np.float32)[:, None, None]
    return a[None]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--run', type=Path, required=True)
    args = parser.parse_args()
    random.seed(701)
    np.random.seed(701)
    metrics = json.loads((args.run/'metrics.json').read_text())
    rows = [r for r in json.load(open(args.manifest)) if r['split'] == 'test']
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = 2
    session = ort.InferenceSession(str(args.run/'view_classifier.onnx'), settings,
                                   providers=['CPUExecutionProvider'])
    confusion = np.zeros((5, 5), int)
    accepted = correct_accepted = 0
    examples = []
    for r in rows:
        image = WholeFilmAugmentation()(Image.open(r['cache']))
        z = session.run(None, {'image': tensor(image)})[0][0]/metrics['temperature']
        p = np.exp(z-z.max())
        p /= p.sum()
        predicted = int(p.argmax())
        target = metrics['classes'].index(r['label'])
        confusion[target, predicted] += 1
        if predicted < 3 and p[predicted] >= metrics['threshold']:
            accepted += 1
            correct_accepted += int(predicted == target)
        if predicted != target and len(examples) < 20:
            examples.append((image, r['label'], metrics['classes'][predicted], float(p[predicted])))
    report = {'n': len(rows), 'seed': 701, 'accuracy': float(confusion.trace()/len(rows)),
              'balanced_accuracy': float(np.mean(confusion.diagonal()/confusion.sum(1))),
              'classes': metrics['classes'], 'confusion_matrix': confusion.tolist(),
              'automatic_routes': accepted, 'automatic_correct': correct_accepted,
              'manual_selection': len(rows)-accepted,
              'purpose': 'One fixed strong whole-film augmentation per held-out test image; no tuning'}
    (args.run/'stress_metrics.json').write_text(json.dumps(report, indent=2))
    if examples:
        sheet = Image.new('RGB', (224*5, 270*((len(examples)+4)//5)), (25, 25, 25))
        draw = ImageDraw.Draw(sheet)
        for i, (image, target, predicted, score) in enumerate(examples):
            x, y = (i % 5)*224, (i//5)*270
            sheet.paste(image, (x, y))
            draw.text((x+3, y+224), f'True: {target}\nPred: {predicted} {score:.3f}', fill='white')
        sheet.save(args.run/'stress_errors.jpg')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
