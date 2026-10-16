"""Exercise the HTTP prediction route on real public radiographs, retaining failures."""
import argparse,base64,collections,hashlib,io,json,random,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))

def main():
 import numpy as np
 from PIL import Image,ImageDraw,ImageOps
 from fastapi.testclient import TestClient
 from backend import server
 p=argparse.ArgumentParser();p.add_argument('--inventory',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--source',action='append');p.add_argument('--limit',type=int,default=0);p.add_argument('--routing',choices=['known','auto','classifier'],default='known');p.add_argument('--shard',type=int,default=0);p.add_argument('--shards',type=int,default=1);a=p.parse_args()
 rows=[r for r in json.loads(a.inventory.read_text()) if r['source']!='Tower-reviewed-cervical' and (not a.source or r['source'] in a.source)]
 random.Random(20261015).shuffle(rows)
 if a.limit:
  counts=collections.Counter();selected=[]
  for r in rows:
   if counts[r['source']]<a.limit:selected.append(r);counts[r['source']]+=1
  rows=selected
 rows=rows[a.shard::a.shards];a.output.mkdir(parents=True,exist_ok=True)
 results=a.output/f'results_{a.shard}.jsonl';done={r['id'] for r in map(json.loads,results.read_text().splitlines())} if results.exists() else set()
 model_versions={p.stem:json.loads(p.read_text()).get('onnx_sha256') for p in (ROOT/'backend/onnx').glob('*.json')}
 source_hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'backend').rglob('*.py')) if 'tests' not in p.parts}
 run_manifest=a.output/'run_manifest.json'
 if run_manifest.exists():
  previous=json.loads(run_manifest.read_text())
  assert previous['models']==model_versions, 'Model files changed; start a separate benchmark directory'
  assert previous.get('source_sha256')==source_hashes, 'App code changed; start a separate benchmark directory'
 else:
  temporary_manifest=a.output/f'run_manifest_{a.shard}.tmp'
  temporary_manifest.write_text(json.dumps({'models':model_versions,'source_sha256':source_hashes,'inventory_sha256':hashlib.sha256(a.inventory.read_bytes()).hexdigest(),'routing':a.routing,'sources':a.source,'limit_per_source':a.limit,'shards':a.shards},indent=2))
  temporary_manifest.replace(run_manifest)
 client=TestClient(server.app,raise_server_exceptions=False)
 def points(value):
  if isinstance(value,dict):
   for v in value.values():yield from points(v)
  elif isinstance(value,list):
   if len(value)==2 and all(isinstance(v,(int,float)) for v in value):yield value
   else:
    for v in value:yield from points(v)
 for index,r in enumerate(rows):
  if r['id'] in done:continue
  started=time.monotonic();record={'id':r['id'],'source':r['source'],'path':r['path'],'source_group':r.get('group'),'routing':a.routing,'landmark_training_exposure':'training' if r['source']=='CSXA' else 'not_established','view_classifier_split':r.get('existing_view_split'),'expected_region':r['region'].removesuffix('_lateral')}
  try:
   path=Path(r['path']);payload=path.read_bytes()
   settings={'modality':'xray','body_part':record['expected_region'] if a.routing=='known' else 'auto','view':'lateral','view_selection':'classifier' if a.routing=='classifier' else 'landmarks'}
   response=client.post('/predict',data=settings,files={'file':(path.name,payload,'application/octet-stream')});record['http_status']=response.status_code
   try:result=response.json()
   except ValueError:result={'error':response.text[:2000]}
   if response.status_code==200:
    geometry=result.get('geometry',{});record['resolved_region']=geometry.get('region') or (record['expected_region'] if a.routing=='known' else None);record['geometry']=geometry;record['qc']=result.get('qc');record['measurements']=result.get('measurements')
    record['landmark_point_count']=len(list(points(geometry.get('vertebrae',{}))))
    record['mask_nonzero_pixels']=int(np.count_nonzero(np.array(Image.open(io.BytesIO(base64.b64decode(result['mask_png']))))))
    record['segmentation_available']=record['mask_nonzero_pixels']>0
    record['vertebral_landmarks_available']=record['landmark_point_count']>0
    record['auxiliary_landmarks_available']=any(geometry.get(k) is not None for k in ('c2_centroid','c7_centroid','s1_superior','hip_midpoint')) or bool(geometry.get('femoral_circles'))
    record['produced_output']=record['vertebral_landmarks_available'] or record['segmentation_available']
    record['output_status']=('vertebral_output' if record['produced_output'] else 'auxiliary_only' if record['auxiliary_landmarks_available'] else 'empty')
    record['vertebral_levels_present']=sorted(geometry.get('vertebrae',{}))
    record['region_correct']=record['resolved_region']==record['expected_region']
    record['visual_review']='pending'
    if record['resolved_region']=='cervical':
     record['endplates_present']=sum(b.get(k) is not None for b in geometry.get('vertebrae',{}).values() for k in ('superior','inferior'))
     record['complete_cervical']=record['endplates_present']==11 and geometry.get('c2_centroid') is not None
    # Keep overlays for the first 12 per shard and every empty or misrouted output.
    if index<12 or not record['produced_output'] or not record['region_correct']:
     image=Image.open(io.BytesIO(base64.b64decode(result['image_png']))).convert('RGB');draw=ImageDraw.Draw(image)
     radius=max(3,round(image.width/300))
     for x,y in points(geometry.get('vertebrae',{})):draw.ellipse((x-radius,y-radius,x+radius,y+radius),outline='lime',width=max(2,radius//2))
     name=f'{r["source"]}_{r["id"][:16]}.jpg';ImageOps.contain(image,(1100,1500)).save(a.output/name);record['overlay']=name
   else:record['error']=result
  except Exception as exc:record['error']=f'{type(exc).__name__}: {exc}'
  record['seconds']=time.monotonic()-started
  with results.open('a') as f:f.write(json.dumps(record)+'\n')
  print(json.dumps({k:record.get(k) for k in ['source','id','http_status','produced_output','region_correct','seconds','error']}),flush=True)
if __name__=='__main__':main()
