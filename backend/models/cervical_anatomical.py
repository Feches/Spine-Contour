"""Anatomical C2–C7 landmarks from the full radiograph, in either orientation."""
from dataclasses import dataclass
import cv2
import numpy as np
from . import models
from .cervical import _rgb_tensor, landmark_contract
try:
    from .. import runtime
except ImportError:
    import runtime

MODEL_NAME = 'cervical_anatomical_hrnet'
KEYPOINT_NAMES = ('C2_centroid','C2_inferior_anterior','C2_inferior_posterior') + tuple(
    f'C{v}_{end}_{side}' for v in range(3,8) for end in ('superior','inferior') for side in ('anterior','posterior'))

@dataclass(frozen=True)
class Letterbox:
    scale: float
    pad_x: int
    pad_y: int
    def restore(self, points):
        return (np.asarray(points, np.float64)*4-[self.pad_x,self.pad_y])/self.scale


def landmark_input(image):
    h,w=image.shape
    scale=min(384/w,512/h)
    rw,rh=max(1,round(w*scale)),max(1,round(h*scale))
    px,py=(384-rw)//2,(512-rh)//2
    canvas=np.zeros((512,384),np.uint8)
    canvas[py:py+rh,px:px+rw]=cv2.resize(image,(rw,rh),interpolation=cv2.INTER_AREA if scale<1 else cv2.INTER_CUBIC)
    return _rgb_tensor(canvas),Letterbox(scale,px,py)


def decode_heatmaps(heat):
    heat=np.asarray(heat)
    if heat.shape!=(1,23,128,96) or not np.isfinite(heat).all():
        raise ValueError('Invalid anatomical cervical heatmaps')
    flat=heat[0].reshape(23,-1);indices=flat.argmax(1)
    return np.column_stack((indices%96,indices//96)),flat.max(1)


def anatomical_contract(points, image_shape, anterior_side=None):
    # Legacy contract orders C2 as IA, IP, centroid; all later channels match.
    p=np.asarray(points,np.float64)
    contract=landmark_contract(p[[1,2,0]+list(range(3,23))], 'left')
    # Naming is already anatomical. The derived side is only for signed measures.
    h,w=image_shape
    directions=[]
    for body in contract['vertebrae'].values():
        for name in ('superior','inferior'):
            pair=body[name]
            if pair is None:continue
            pair=np.asarray(pair)
            if np.any(pair<0) or np.any(pair[:,0]>=w) or np.any(pair[:,1]>=h):
                body[name]=None
                contract['review_reasons'].append('An endplate falls outside the image; review or place its endpoints.')
            else:directions.append(pair[0,0]-pair[1,0])
        s,i=body['superior'],body['inferior']
        body['quadrilateral']=[s[0],s[1],i[1],i[0]] if s and i else None
    delta=float(np.median(directions)) if directions else 0.
    inferred='right' if delta>0 else 'left' if delta<0 else None
    contract['anterior_side']=anterior_side if anterior_side in ('left','right') else inferred
    if inferred and anterior_side in ('left','right') and anterior_side!=inferred:
        contract['review_reasons'].append('Selected anterior side disagrees with the anatomical landmarks; review orientation before using signed measurements.')
    if not (0<=p[0,0]<w and 0<=p[0,1]<h):
        contract['c2_centroid']=None
        contract['review_reasons'].append('C2 centroid falls outside the image.')
    return contract


def cervical_prediction(pixel_array, anterior_side=None, model=MODEL_NAME):
    if model!=MODEL_NAME:raise ValueError('Unknown anatomical cervical model')
    raw=np.asarray(pixel_array)
    if raw.ndim!=2 or not raw.size or not np.issubdtype(raw.dtype,np.number) or not np.isfinite(raw).all():
        raise ValueError('Expected a finite grayscale radiograph')
    if min(raw.shape)<32 or np.ptp(raw.astype(np.float64))==0:
        raise ValueError('No usable cervical image content; choose a radiograph with visible anatomy')
    image=raw.copy() if raw.dtype==np.uint8 else models._robust_rescale(raw)
    tensor,transform=landmark_input(image)
    heat=models._infer(MODEL_NAME,lambda session:session.run(None,{'image':tensor})[0],'Predicting anatomical C2–C7 landmarks')
    decoded,confidence=decode_heatmaps(heat)
    contract=anatomical_contract(transform.restore(decoded),image.shape,anterior_side)
    return {'image':image,'mask':np.zeros(image.shape,np.uint8),'femoral_mask':np.zeros(image.shape,np.uint8),
            'landmarks':contract,'models':{'vertebrae':MODEL_NAME,'cervical':MODEL_NAME},
            'framing':{'window':[0,0,image.shape[1],image.shape[0]],'detector':None,'reference_landmarks_used':False,'fallback_whole_film':False},
            'warnings':contract['review_reasons'],
            'provenance':{'dataset':'CSXA + clinical cohort','anterior_side_source':'user' if anterior_side in ('left','right') else 'anatomical_landmarks',
                          'landmark_coordinates':'source_image_pixels','segmentation_available':False,
                          'landmark_peak_scores':dict(zip(KEYPOINT_NAMES,map(float,confidence)))}}
