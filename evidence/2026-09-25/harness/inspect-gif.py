"""Decode every actual GIF frame. This is evidence, not an OCR or user test."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('--name', default='actual.gif')
args = parser.parse_args()
folder = args.directory
gif = folder / args.name
report = {'file': gif.name, 'decoded': False, 'desktop_capture': False,
          'ocr_checked': False, 'independent_user_test': False}
try:
    with Image.open(gif) as image:
        if image.format != 'GIF':
            raise ValueError('not GIF')
        report['size'] = list(image.size)
        report['frames'] = image.n_frames
        report['duration_ms'] = []
        report['pixel_hashes'] = []
        for index in range(image.n_frames):
            image.seek(index)
            image.load()
            report['duration_ms'].append(image.info.get('duration', 0))
            report['pixel_hashes'].append(hashlib.sha256(image.convert('RGBA').tobytes()).hexdigest())
        report['last_frame_nonuniform'] = len(image.convert('RGB').getcolors(image.width * image.height)) > 1
        image.convert('RGBA').save(folder / (gif.stem + '-last.png'))
        report['decoded'] = True
except Exception as error:
    report['error_type'] = type(error).__name__
path = folder / (gif.stem + '-decode.json')
path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
if not report['decoded'] or not report.get('last_frame_nonuniform'):
    raise SystemExit(1)
