"""Strong appearance augmentation that always retains the entire input film.

No crop, affine translation, zoom-in, erasing, CutMix, or random resized crop.
Rotation expands the canvas; padding only makes the film smaller.
"""
import io
import random

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def fit_whole(image, size=224):
    image = ImageOps.contain(image, (size, size), Image.Resampling.BILINEAR)
    canvas = Image.new('RGB', (size, size))
    canvas.paste(image, ((size-image.width)//2, (size-image.height)//2))
    return canvas


class WholeFilmAugmentation:
    def __call__(self, image):
        image = image.convert('RGB')
        if random.random() < .5:
            image = ImageOps.mirror(image)
        if random.random() < .8:
            image = image.rotate(random.uniform(-15, 15), resample=Image.Resampling.BILINEAR,
                                 expand=True, fillcolor=0)
        if random.random() < .75:
            # Asymmetric padding changes placement without clipping source pixels.
            image = ImageOps.expand(image, tuple(random.randint(0, 48) for _ in range(4)), fill=0)
        image = fit_whole(image)
        image = ImageEnhance.Contrast(image).enhance(random.uniform(.4, 2.0))
        image = ImageEnhance.Brightness(image).enhance(random.uniform(.5, 1.6))
        gamma = random.uniform(.5, 1.8)
        image = image.point([round(255*(i/255)**gamma) for i in range(256)]*3)
        if random.random() < .35:
            image = image.filter(ImageFilter.GaussianBlur(random.uniform(.2, 1.4)))
        if random.random() < .35:
            a = np.asarray(image, dtype=np.float32)
            noise = np.random.normal(0, random.uniform(1, 10), a.shape[:2])[..., None]
            image = Image.fromarray(np.clip(a+noise, 0, 255).astype(np.uint8))
        if random.random() < .25:
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=random.randint(35, 95))
            buffer.seek(0)
            image = Image.open(buffer).convert('RGB')
        if random.random() < .1:
            image = ImageOps.invert(image)
        return image
