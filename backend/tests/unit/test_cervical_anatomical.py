"""Coordinate-contract regressions, separate from real-radiograph accuracy evaluation."""
import numpy as np
from backend.models.cervical_anatomical import anatomical_contract, landmark_input, decode_heatmaps


def test_named_channels_do_not_swap_when_image_orientation_changes():
    p=np.array([[30,10],[20,20],[40,20]]+[[x,y] for y in range(30,130,10) for x in (20,40)],float)
    left=anatomical_contract(p,(150,100))
    q=p.copy();q[:,0]=99-q[:,0]
    right=anatomical_contract(q,(150,100))
    assert left['anterior_side']=='left' and right['anterior_side']=='right'
    for level in left['vertebrae']:
        for name in ('superior','inferior'):
            a,b=left['vertebrae'][level][name],right['vertebrae'][level][name]
            if a is None:assert b is None;continue
            np.testing.assert_allclose(np.asarray(a)[:,0],99-np.asarray(b)[:,0])
    override=anatomical_contract(q,(150,100),'left')
    assert override['vertebrae']==right['vertebrae']
    assert override['review_reasons']


def test_letterbox_inverse_retains_original_pixel_coordinates():
    image=np.zeros((731,523),np.uint8)
    tensor,t=landmark_input(image)
    assert tensor.shape==(1,3,512,384)
    source=np.array([[30,40],[400,650]],float)
    encoded=(source*t.scale+[t.pad_x,t.pad_y])/4
    np.testing.assert_allclose(t.restore(encoded),source)


def test_decoder_rejects_wrong_export_shape():
    import pytest
    with pytest.raises(ValueError):decode_heatmaps(np.zeros((1,23,96,96)))


def test_blank_input_does_not_generate_landmarks(monkeypatch):
    import pytest
    from backend.models import cervical_anatomical as module
    monkeypatch.setattr(module.models, '_infer', lambda *args: pytest.fail('Blank image must not reach inference'))
    with pytest.raises(ValueError, match='No usable'):
        module.cervical_prediction(np.zeros((128,128),np.uint8))
