"""Generate the three shared TTFs offline; ordinary web builds only pack them."""
import argparse
import base64
import hashlib
import json
import re
import time
from pathlib import Path

import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

assert fontTools.__version__ == '4.68.0'
root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', default=str(root / 'tools/fonts/library'))
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
started = time.perf_counter()
assets = root / 'packages/numbered-notation/src/font-assets'
paths = sorted(path for directory in ['scores', 'works', 'examples']
               for path in (root / 'src' / directory).rglob('*.m3n'))
plan_path = root / 'config/scorebook/editorial-plan.json'
plan = json.loads(plan_path.read_text())
source_paths = paths + [plan_path, Path(__file__), assets / 'NotoSansSC-full.ttf',
                        assets / 'Bravura.woff2', root / 'packages/numbered-notation/src/font-data.ts']
inputs = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in sorted(source_paths)}
text = '演唱作词作曲编曲音域：→演奏顺序：目录–' + ''.join(chr(c) for c in range(32, 127))
text += ''.join(path.read_text() for path in paths) + plan['title']
text += ''.join(section['title'] for section in plan['sections'])
text += ''.join(entry['title'] for entry in plan['entries'])
timings = {}
fonts = []

def record(file, weight=400):
    path = output / file
    with TTFont(path, recalcTimestamp=False) as font:
        characters = ''.join(chr(c) for c in sorted(font.getBestCmap()))
    fonts.append(dict(file=file, characters=characters, weight=weight, style='normal',
                      bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest()))

phase = time.perf_counter()
with TTFont(assets / 'NotoSansSC-full.ttf', recalcTimestamp=False) as font:
    codes = sorted({ord(c) for c in text if ord(c) in font.getBestCmap()})
    options = subset.Options()
    options.layout_features = []
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codes)
    subsetter.subset(font)
    font['glyf'].padding = 4
    font.save(output / 'NotoSansSC-library.ttf')
record('NotoSansSC-library.ttf')
with TTFont(output / 'NotoSansSC-library.ttf') as font:
    assert set(font.getBestCmap()) == set(codes)
timings['cjkMs'] = (time.perf_counter() - phase) * 1000

phase = time.perf_counter()
data = (root / 'packages/numbered-notation/src/font-data.ts').read_text()
(output / 'BarlowSemiCondensed-Medium.ttf').write_bytes(base64.b64decode(re.search(r'base64,([A-Za-z0-9+/=]+)', data)[1]))
record('BarlowSemiCondensed-Medium.ttf', weight=500)
timings['latinMs'] = (time.perf_counter() - phase) * 1000

phase = time.perf_counter()
with TTFont(assets / 'Bravura.woff2', recalcTimestamp=False) as font:
    font.flavor = None
    font['glyf'].padding = 2
    font.save(output / 'Bravura.ttf')
record('Bravura.ttf')
timings['musicMs'] = (time.perf_counter() - phase) * 1000

(output / 'manifest.json').write_text(json.dumps(dict(version=1, inputs=inputs, fonts=fonts), ensure_ascii=True, indent=2) + '\n')
print(json.dumps(dict(totalMs=(time.perf_counter() - started) * 1000, stages=timings,
                      scoreCount=len(paths), fonts={f['file']: f['bytes'] for f in fonts}), indent=2))
