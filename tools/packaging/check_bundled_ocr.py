"""Run against the packaged backend; catches missing executable, DLLs or language data."""
import io
import cv2
import httpx
import numpy as np
from PIL import Image

image = np.zeros((240, 400, 3), np.uint8)
cv2.line(image, (100, 50), (100, 130), (255, 255, 255), 1)
for y in (50, 130):
    cv2.line(image, (94, y), (106, y), (255, 255, 255), 1)
cv2.putText(image, '25.4 mm', (40, 170), cv2.FONT_HERSHEY_SIMPLEX, .85, (255, 255, 255), 2)
stream = io.BytesIO(); Image.fromarray(image).save(stream, format='PNG')
response = httpx.post('http://127.0.0.1:8765/calibrate', files={'file': ('test.png', stream.getvalue(), 'image/png')}, timeout=90)
response.raise_for_status()
body = response.json()
assert body['status'] == 'detected', body['message']
assert body['candidates'][body['selected_index']]['value_mm'] == 25.4
print('Bundled OCR extracted 25.4 mm successfully.')
