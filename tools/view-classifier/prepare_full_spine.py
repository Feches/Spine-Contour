from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json
from PIL import Image, ImageOps
import numpy as np
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--images', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--cache-prefix', required=True, help='Absolute cache directory on the training host')
args = parser.parse_args()
src = args.images
out = args.out
out.mkdir(parents=True, exist_ok=True)

def prep(p):
    im = Image.open(p).convert('L')
    a = np.asarray(im)
    sha = hashlib.sha256(a.tobytes() + str(a.shape).encode()).hexdigest()
    dh = np.array(im.resize((9, 8)))
    dh = int.from_bytes(np.packbits(dh[:, 1:] > dh[:, :-1]).tobytes(), 'big')
    small = ImageOps.contain(im, (224, 224), Image.Resampling.BILINEAR)
    canvas = Image.new('L', (224, 224))
    canvas.paste(small, ((224 - small.width) // 2, (224 - small.height) // 2))
    canvas.save(out / (p.stem + '.png'))
    return dict(path=str(p), cache=str(Path(args.cache_prefix) / (p.stem + '.png')), pixel_sha256=sha, dhash=dh, aspect=im.width / im.height, source='FullSpine236', group='FullSpine236:' + p.stem, label='full_spine_lateral', split=None)
with ThreadPoolExecutor(max_workers=8) as pool:
    rows = list(pool.map(prep, [p for p in sorted(src.iterdir()) if p.suffix.lower() in ['.jpg', '.jpeg', '.png']]))
(out / 'manifest.json').write_text(json.dumps(rows, indent=2))
print(len(rows), flush=True)
