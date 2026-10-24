"""Numerical export checks; empty images are tensor contracts, not accuracy data."""
import numpy as np


def check_landmark_coordinates(actual, expected, heatmaps, *, empty_input=False, stride=4):
    """Require coordinate parity except adjacent, near-tied peaks on blank input."""
    actual, expected, heatmaps = map(np.asarray, (actual, expected, heatmaps))
    assert actual.shape == expected.shape
    assert np.isfinite(actual).all() and np.isfinite(expected).all()
    close = np.isclose(actual, expected, rtol=.002, atol=.002).all(axis=-1)
    if close.all():
        return
    if not empty_input:
        np.testing.assert_allclose(actual, expected, rtol=.002, atol=.002)
    # Padding artifacts on an empty film can have virtually equal adjacent
    # maxima. Argmax is discontinuous even when the heatmaps agree numerically.
    peaks = np.partition(heatmaps.reshape(*heatmaps.shape[:2], -1), -2, axis=-1)[..., -2:]
    assert ((peaks[..., 1]-peaks[..., 0])[~close] <= 1e-6).all()
    assert (np.abs(actual-expected)[~close] <= stride+.01).all()
