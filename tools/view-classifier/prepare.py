"""Source adapters and group/duplicate-separated splits used for the released model.

Only explicitly listed, verified sources are admitted. Model-predicted VinDr
labels, CT/MRI/DRRs, and ambiguous PMC panels are not training targets.
"""
from pathlib import Path
import json, hashlib, collections
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageOps
import numpy as np
import argparse
parser = argparse.ArgumentParser(description='Prepare verified image sources; see model card')
parser.add_argument('--data-root', type=Path, required=True)
parser.add_argument('--pmc-root', type=Path, required=True)
parser.add_argument('--full-spine-cached-manifest', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
ROOT = args.out
ROOT.mkdir(parents=True, exist_ok=True)
ALLOWED_SOURCES = frozenset({'BUU', 'CSXA', 'wrist', 'PMC', 'VinDr-hardware', 'FullSpine236'})
rows = []

def add(p, label, source, group, split=None):
    if source not in ALLOWED_SOURCES:
        raise ValueError('Unsupported image source')
    rows.append(dict(path=str(p), label=label, source=source, group=source + ':' + group, split=split))
for folder in ['BUU-LSPINE_3600', 'BUU-LSPINE_400']:
    for label, sub in [('lumbar_lateral', 'LA'), ('lumbar_ap', 'AP')]:
        for p in sorted((args.data_root / 'spinopelvic' / folder / sub).glob('*.jpg')):
            add(p, label, 'BUU', p.stem.split('-')[0])
for p in sorted((args.data_root / 'cervical_keypoint/datasets-PNG').glob('*.png')):
    add(p, 'cervical_lateral', 'CSXA', p.stem[:4])
for p in sorted((args.data_root / 'cand_wrist-xray-dataset-balanced-data/dataset').rglob('*.png')):
    add(p, 'other', 'wrist', '_'.join(p.stem.split('_')[:2]))
base = args.pmc_root
for r in json.load(open(base / 'clean_panels.json')):
    add(base / r['panel_path'], 'full_spine_lateral', 'PMC', r['pmcid'], None if r['coverage'] == 'broad_spine' else 'challenge')
b = args.data_root / 'spinopelvic/keypoint_v2/vindr_lateral_hardware_reviewed_20260825'
for r in json.load(open(b / 'accepted_manifest.json')):
    add(b / 'accepted_images' / r['filename'], 'lumbar_lateral', 'VinDr-hardware', r['study_id'], 'external')
(ROOT / 'cache_all').mkdir(exist_ok=True)

def prepare(r):
    im = Image.open(r['path']).convert('L')
    a = np.asarray(im)
    r['pixel_sha256'] = hashlib.sha256(a.tobytes() + str(a.shape).encode()).hexdigest()
    a = np.array(im.resize((9, 8)))
    r['dhash'] = int.from_bytes(np.packbits(a[:, 1:] > a[:, :-1]).tobytes(), 'big')
    r['aspect'] = im.width / im.height
    p = ROOT / 'cache_all' / (r['pixel_sha256'] + '.png')
    small = ImageOps.contain(im, (224, 224), Image.Resampling.BILINEAR)
    out = Image.new('L', (224, 224))
    out.paste(small, ((224 - small.width) // 2, (224 - small.height) // 2))
    out.save(p)
    r['cache'] = str(p)
    return r
print('PREPARING', len(rows), flush=True)
with ThreadPoolExecutor(max_workers=16) as pool:
    rows = list(pool.map(prepare, rows))
full_spine_rows = json.load(open(args.full_spine_cached_manifest))
if any(r['source'] != 'FullSpine236' for r in full_spine_rows):
    raise ValueError('Expected the verified full-spine collection')
rows += full_spine_rows
n = len(rows)
parent = list(range(n))

def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i

def union(i, j):
    parent[find(j)] = find(i)
bygroup = {}
bysha = {}
buckets = collections.defaultdict(list)
thumbs = [np.array(Image.open(r['cache']).resize((32, 32)), dtype=np.float32) for r in rows]
near = 0
for i, r in enumerate(rows):
    for key, book in [(r['group'], bygroup), (r['pixel_sha256'], bysha)]:
        if key in book:
            union(i, book[key])
        else:
            book[key] = i
    h = r['dhash']
    candidates = set()
    for k in range(4):
        candidates.update(buckets[k, h >> 16 * k & 65535])
    for j in candidates:
        if (h ^ rows[j]['dhash']).bit_count() <= 3 and abs(np.log(r['aspect'] / rows[j]['aspect'])) < 0.05 and (np.mean(np.abs(thumbs[i] - thumbs[j])) < 5):
            union(i, j)
            near += 1
    for k in range(4):
        buckets[k, h >> 16 * k & 65535].append(i)
clusters = collections.defaultdict(list)
for i in range(n):
    clusters[find(i)].append(i)
for ids in clusters.values():
    fixed = {rows[i]['split'] for i in ids if rows[i]['split']}
    split = 'external' if 'external' in fixed else 'challenge' if 'challenge' in fixed else None
    key = min((rows[i]['group'] for i in ids))
    if split is None:
        v = int(hashlib.sha256(('split42:' + key).encode()).hexdigest()[:8], 16) / 2 ** 32
        split = 'train' if v < 0.7 else 'val' if v < 0.85 else 'test'
    for i in ids:
        rows[i]['split'] = split
        rows[i]['cluster'] = key
seen = set()
dedup = []
for r in rows:
    if r['pixel_sha256'] in seen:
        continue
    seen.add(r['pixel_sha256'])
    dedup.append(r)
json.dump(dedup, open(ROOT / 'manifest_all.json', 'w'), indent=2)
report = {'n': len(dedup), 'raw': len(rows), 'exact_duplicates_removed': len(rows) - len(dedup), 'near_duplicate_edges': near, 'clusters': len(clusters), 'counts': {s: dict(collections.Counter((r['label'] for r in dedup if r['split'] == s))) for s in ['train', 'val', 'test', 'external', 'challenge']}, 'sources': dict(collections.Counter((r['source'] for r in dedup)))}
json.dump(report, open(ROOT / 'data_inventory_all.json', 'w'), indent=2)
print(json.dumps(report), flush=True)
