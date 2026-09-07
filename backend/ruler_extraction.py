#!/usr/bin/env python3
"""Extract printed length labels and capped ruler endpoints from raster images.
No fixed image coordinates. All output coordinates are original-image pixels.
"""
import math
import re

import cv2
import numpy as np
import pytesseract
from scipy.optimize import linear_sum_assignment

MEASUREMENT = re.compile(r'(?<![\d.])(\d+(?:[.,]\d+)?)\s*(mm|cm|μm|um|in)\s*(\*)?', re.I)


def read_labels(image):
    """Whole-frame OCR with contrast variants, original-pixel boxes and consensus."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    variants = [(gray, 1.0, 'original'), (gray, 2.0, 'enlarged')]
    for threshold in (190, 225, 245):
        variants.append((255-cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)[1], 1.0, f'bright_{threshold}'))
    groups_out = []
    for frame, scale, variant in variants:
        enlarged = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        data = pytesseract.image_to_data(enlarged, config='--psm 11', output_type=pytesseract.Output.DICT, timeout=8)
        groups = {}
        for i, word in enumerate(data['text']):
            if word.strip():
                key = tuple(data[k][i] for k in ('block_num', 'par_num', 'line_num'))
                groups.setdefault(key, []).append(i)
        for indices in groups.values():
            text = ' '.join(data['text'][i] for i in indices)
            spans, offset = [], 0
            for i in indices:
                spans.append((offset, offset + len(data['text'][i]), i))
                offset += len(data['text'][i]) + 1
            for match in MEASUREMENT.finditer(text):
                matched = [i for a, b, i in spans if b > match.start() and a < match.end()]
                x = min(data['left'][i] for i in matched) / scale
                y = min(data['top'][i] for i in matched) / scale
                r = max(data['left'][i] + data['width'][i] for i in matched) / scale
                b = max(data['top'][i] + data['height'][i] for i in matched) / scale
                label = dict(value=float(match[1].replace(',', '.')), unit=match[2].lower(),
                             flag=match[3] or None, raw_text=match[0], text_box=[x, y, r-x, b-y],
                             ocr_confidence=min(float(data['conf'][i]) for i in matched)/100,
                             preprocessing=variant)
                def same_region(previous):
                    px, py, pw, ph = previous['text_box']
                    intersection=max(0,min(r,px+pw)-max(x,px))*max(0,min(b,py+ph)-max(y,py))
                    return intersection/max(1,min(pw*ph,(r-x)*(b-y))) > .65
                group = next((g for g in groups_out if same_region(g[0])), None)
                if group is None:
                    groups_out.append([label])
                else:
                    group.append(label)
    labels=[]
    for group in groups_out:
        readings={}
        for candidate in group:
            readings.setdefault((candidate['value'],candidate['unit']),[]).append(candidate)
        ranked=sorted(readings.values(),key=lambda items:(len(items),max(i['ocr_confidence'] for i in items)),reverse=True)
        best=dict(max(ranked[0],key=lambda item:item['ocr_confidence']))
        best['ocr_support']=len(ranked[0])
        best['ocr_alternatives']=[{k:items[0][k] for k in ('value','unit','raw_text')} | {'support':len(items)} for items in ranked[1:]]
        best['ocr_conflict']=len(ranked)>1 and len(ranked[0])<=len(ranked[1])
        labels.append(best)
    return labels


def component_ruler(points):
    """Validate a shaft plus two perpendicular caps in rotation-invariant coordinates."""
    center = points.mean(axis=0)
    _, _, vh = np.linalg.svd(points-center, full_matrices=False)
    axis, normal = vh[0], vh[1]
    t, u = (points-center) @ axis, (points-center) @ normal
    lo, hi = t.min(), t.max()
    length = hi-lo
    width = u.max()-u.min()
    if length < 16 or width < 3 or not 3.2 < length/max(width,1) < 65:
        return None
    # Caps occupy the ends, shaft is narrow and continuous in the middle.
    band = max(1.7, min(5., length*.055))
    left, right = t < lo+band, t > hi-band
    middle = (t > lo+length*.2) & (t < lo+length*.8)
    if min(left.sum(),right.sum(),middle.sum()) < 3:
        return None
    cap_widths = [np.ptp(u[m]) for m in (left,right)]
    shaft_width = max(1., np.percentile(u[middle],95)-np.percentile(u[middle],5))
    if min(cap_widths) < max(3, shaft_width*1.65):
        return None
    if min(cap_widths)/max(cap_widths) < .42:
        return None
    # Both caps must cross the shaft, not merely continue it on one side.
    shaft_u = np.median(u[middle])
    if any(min(shaft_u-u[m].min(),u[m].max()-shaft_u) < min(cap_widths)*.16 for m in (left,right)):
        return None
    bins = np.unique(np.floor(t[middle] + 1e-6).astype(int))
    continuity = min(1.,len(bins)/max(1,length*.6*max(np.abs(axis))))
    if continuity < .83:
        return None
    # Robust total-least-squares shaft refinement on middle pixels.
    shaft_points = points[middle]
    shaft_center = shaft_points.mean(axis=0)
    _, _, svh = np.linalg.svd(shaft_points-shaft_center, full_matrices=False)
    shaft_axis = svh[0]
    if np.dot(shaft_axis,axis) < 0:
        shaft_axis = -shaft_axis
    endpoints = []
    for mask in (left,right):
        # Fit the cap using the pixels outside the shaft to reduce stem bias.
        wings = mask & (np.abs(u-shaft_u) > max(1.,shaft_width*.65))
        cap_points = points[wings] if wings.sum() >= 4 else points[mask]
        cap_center = cap_points.mean(axis=0)
        _, _, cvh = np.linalg.svd(cap_points-cap_center, full_matrices=False)
        cap_axis = cvh[0]
        if abs(np.dot(cap_axis,shaft_axis)) > .4:
            return None
        coeff = np.linalg.solve(np.column_stack([shaft_axis,-cap_axis]),cap_center-shaft_center)
        endpoints.append((shaft_center+coeff[0]*shaft_axis).tolist())
    ratio = min(cap_widths)/shaft_width
    score = .45*continuity + .3*min(1,ratio/4) + .25*min(cap_widths)/max(cap_widths)
    return dict(ruler_type='capped_segment', endpoints=endpoints,
                length_px=float(np.linalg.norm(np.subtract(*endpoints))), geometry_confidence=float(score))


def find_rulers(image, profile=None):
    gray = cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    candidates = []
    # Multiple thresholds and polarities accommodate white, dark, and colored overlays.
    channels = [gray] + list(cv2.split(image)) if np.max(np.ptp(image.astype(np.int16),axis=2)) > 20 else [gray]
    if profile:
        color = np.asarray(profile['foreground_rgb'][::-1], dtype=float)
        delta = np.max(np.abs(image.astype(float) - color), axis=2)
        channels.insert(0, np.where(delta <= profile['tolerance'], 255, 0).astype(np.uint8))
    for channel in channels:
        for threshold in (80,140,190,225,245):
            for polarity in (cv2.THRESH_BINARY,cv2.THRESH_BINARY_INV):
                mask = cv2.threshold(channel,threshold,255,polarity)[1]
                count, components, stats, _ = cv2.connectedComponentsWithStats(mask,8)
                for k in range(1,count):
                    x,y,w,h,area = stats[k]
                    if not 18 <= area <= 12000 or max(w,h) < 16 or min(w,h) < 3:
                        continue
                    if max(w,h) > max(image.shape[:2])*.8:
                        continue
                    yy,xx = np.where(components[y:y+h,x:x+w] == k)
                    ruler = component_ruler(np.column_stack([xx+x,yy+y]).astype(float))
                    if ruler is None:
                        continue
                    ends=np.array(ruler['endpoints'])
                    duplicate=None
                    for prior in candidates:
                        pe=np.array(prior['endpoints'])
                        error=min(np.linalg.norm(ends-pe,axis=1).max(),np.linalg.norm(ends-pe[::-1],axis=1).max())
                        if error < max(4,ruler['length_px']*.06):
                            duplicate=prior
                            break
                    if duplicate is None:
                        candidates.append(ruler)
                    elif ruler['geometry_confidence'] > duplicate['geometry_confidence']:
                        duplicate.update(ruler)
    return candidates


def pair_measurements(labels,rulers):
    if not labels:
        return []
    n,m=len(labels),len(rulers)
    scores=np.zeros((n,m+n)) + .48  # dummy columns permit leaving labels unmatched
    for i,label in enumerate(labels):
        x,y,w,h=label['text_box']
        for j,ruler in enumerate(rulers):
            ends=np.array(ruler['endpoints'])
            sample=ends[0]+np.linspace(0,1,25)[:,None]*(ends[1]-ends[0])
            dx=np.maximum(np.maximum(x-sample[:,0],sample[:,0]-(x+w)),0)
            dy=np.maximum(np.maximum(y-sample[:,1],sample[:,1]-(y+h)),0)
            distance=np.hypot(dx,dy).min()
            proximity=math.exp(-distance/max(4*h,ruler['length_px'],1))
            # A ruler inside the label is probably an OCR glyph, such as I or H.
            inside=np.all((ends[:,0]>=x)&(ends[:,0]<=x+w)&(ends[:,1]>=y)&(ends[:,1]<=y+h))
            scores[i,j]=0 if inside else .65*proximity+.35*ruler['geometry_confidence']
            if distance > max(h*10,ruler['length_px']*3):
                scores[i,j]=0
    rows,cols=linear_sum_assignment(-scores)
    output=[]
    for i,j in zip(rows,cols):
        result=dict(labels[i])
        if j>=m or scores[i,j] <= .48:
            result.update(status='unmatched_label',ruler=None)
        else:
            competing=list(scores[i,:m])
            competing.pop(j)
            competing += [scores[k,j] for k in range(n) if k!=i]
            margin=float(scores[i,j]-max([.48]+competing))
            result.update(ruler=rulers[j],pairing_score=float(scores[i,j]),pairing_margin=margin)
            result['status']='accepted' if margin>.12 and result['ocr_confidence']>=.6 and not result.get('ocr_conflict') else 'ambiguous'
        output.append(result)
    return output


def extract(image, profile=None):
    labels=read_labels(image)
    rulers=find_rulers(image, profile)
    # Ruler-guided OCR recovery uses relative neighborhoods, never fixed locations.
    for ruler in rulers:
        midpoint=np.mean(ruler['endpoints'],axis=0)
        radius=max(90,ruler['length_px']*3)
        if any(np.linalg.norm(np.array(l['text_box'][:2])-midpoint)<radius for l in labels):
            continue
        x0,y0=np.maximum(0,np.floor(midpoint-radius).astype(int))
        x1,y1=np.minimum([image.shape[1],image.shape[0]],np.ceil(midpoint+radius).astype(int))
        for label in read_labels(image[y0:y1,x0:x1]):
            label['text_box'][0]+=int(x0); label['text_box'][1]+=int(y0)
            if not any(np.linalg.norm(np.array(l['text_box'][:2])-np.array(label['text_box'][:2]))<15 for l in labels):
                labels.append(label)
    if profile:
        color = np.asarray(profile['foreground_rgb'][::-1], dtype=float)
        delta = np.max(np.abs(image.astype(float) - color), axis=2)
        foreground = np.where(delta <= profile['tolerance'], 0, 255).astype(np.uint8)
        for label in read_labels(cv2.cvtColor(foreground, cv2.COLOR_GRAY2BGR)):
            if not any(np.linalg.norm(np.array(l['text_box'][:2])-np.array(label['text_box'][:2]))<20 for l in labels):
                labels.append(label)
    measurements=pair_measurements(labels,rulers)
    used=[r['ruler'] for r in measurements if r.get('ruler')]
    return dict(image_size={'width':image.shape[1],'height':image.shape[0]},measurements=measurements,
                unmatched_rulers=[r for r in rulers if r not in used],
                scope='Printed length labels and straight rulers with two end caps; scores are heuristic, not calibrated probabilities.')

