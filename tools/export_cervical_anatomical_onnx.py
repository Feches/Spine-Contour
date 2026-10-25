"""Export an anatomically labelled cervical checkpoint and verify real-image parity."""
import argparse,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))

def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def main():
 import numpy as np,torch,onnx,onnxruntime as ort
 from PIL import Image
 from backend.models.cervical_anatomical_training import HRNetKeypointModel
 from backend.models.cervical_anatomical import KEYPOINT_NAMES,landmark_input,decode_heatmaps
 p=argparse.ArgumentParser();p.add_argument('--checkpoint',type=Path,required=True);p.add_argument('--image',type=Path,action='append',required=True);p.add_argument('--destination',type=Path,default=ROOT/'backend/onnx');a=p.parse_args()
 torch.set_num_threads(2)
 saved=torch.load(a.checkpoint,map_location='cpu',weights_only=False)
 assert tuple(saved['keypoints'])==KEYPOINT_NAMES
 cfg=saved['config'];assert (cfg.get('input_width',384),cfg.get('input_height',512),cfg.get('heatmap_stride',4))==(384,512,4)
 model=HRNetKeypointModel(cfg.get('model_name','hrnet_w32.ms_in1k'),23,False);model.load_state_dict(saved['model']);model.eval()
 a.destination.mkdir(exist_ok=True,parents=True);out=a.destination/'cervical_anatomical_hrnet.onnx'
 example=landmark_input(np.asarray(Image.open(a.image[0]).convert('L')))[0]
 with torch.inference_mode():torch.onnx.export(model,torch.from_numpy(example),str(out),opset_version=17,input_names=['image'],output_names=['heatmaps'],dynamo=False)
 onnx.checker.check_model(str(out));options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
 session=ort.InferenceSession(str(out),sess_options=options,providers=['CPUExecutionProvider']);checks=[]
 for path in a.image:
  raw=np.asarray(Image.open(path).convert('L'))
  for flip in (False,True):
   x,_=landmark_input(raw[:,::-1].copy() if flip else raw)
   with torch.inference_mode():expected=model(torch.from_numpy(x)).numpy()
   actual=session.run(None,{'image':x})[0]
   np.testing.assert_allclose(actual,expected,rtol=.002,atol=.002)
   e,_=decode_heatmaps(expected);g,_=decode_heatmaps(actual);np.testing.assert_array_equal(e,g)
   checks.append({'image_sha256':digest(path),'mirrored':flip,'max_absolute_heatmap_error':float(np.abs(actual-expected).max()),'decoded_points_equal':True})
 metadata={'kind':'cervical_anatomical_hrnet','precision':'float32','model':'cervical_anatomical_hrnet','onnx_sha256':digest(out),'checkpoint_sha256':digest(a.checkpoint),'checkpoint_epoch':saved['epoch'],'keypoints':KEYPOINT_NAMES,'input_shape':[1,3,512,384],'output_shape':[1,23,128,96],'preprocessing':'grayscale uint8; OpenCV aspect-preserving letterbox; ImageNet normalization','coordinate_transform':'heatmap * 4, subtract padding, divide scale','orientation_semantics':'anatomical channel identity, preserved under mirroring','checks':checks}
 out.with_suffix('.json').write_text(json.dumps(metadata,indent=2));print(json.dumps(metadata,indent=2))
if __name__=='__main__':main()
