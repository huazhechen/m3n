"""Generate an offline, experimental shared WOFF2 subset without changing runtime fonts.

Run with .tmp/font-subset-env/bin/python tools/prepare-catalog-web-font.py.
Requires tools/requirements-fonts.txt; uses the same TrueType outlines as per-score fonts.
"""
import hashlib
import json
from pathlib import Path

import brotli
import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

assert fontTools.__version__ == '4.68.0' and brotli.__version__ == '1.2.1'
root = Path(__file__).resolve().parent.parent
source = root / 'packages/numbered-notation/src/font-assets/NotoSansSC-full.ttf'
paths = sorted(path for directory in ['scores', 'works', 'examples']
               for path in (root / 'src' / directory).glob('*.m3n'))
labels = '演唱作词作曲音域：'
text = labels + ''.join(chr(c) for c in range(32, 127))
inputs = {}
for path in paths:
    data = path.read_bytes()
    text += data.decode('utf-8')
    inputs[path.relative_to(root).as_posix()] = hashlib.sha256(data).hexdigest()

font = TTFont(source, recalcTimestamp=False)
available = font.getBestCmap()
codes = sorted({ord(c) for c in text if ord(c) in available})
options = subset.Options()
options.layout_features = []
options.recalc_timestamp = False
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=codes)
subsetter.subset(font)
font['glyf'].padding = 4
font.flavor = 'woff2'
output = root / 'tools/fonts/NotoSansSC-catalog.woff2'
font.save(output)

# Reopen the compressed artifact to verify coverage, rather than just the input.
with TTFont(output) as generated:
    assert set(generated.getBestCmap()) == set(codes), 'Generated font coverage differs'
data = output.read_bytes()
report = {
    'font': 'Noto Sans CJK SC Regular 2.004',
    'license': 'SIL OFL 1.1; public/licenses/noto-sans/LICENSE.txt',
    'scope': ['src/scores/*.m3n', 'src/works/*.m3n', 'src/examples/*.m3n'],
    'scoreCount': len(paths),
    'characters': len(codes),
    'hanCharacters': sum(0x3400 <= c <= 0x9fff or 0x20000 <= c <= 0x323af for c in codes),
    'bytes': len(data),
    'sha256': hashlib.sha256(data).hexdigest(),
    'sourceFontSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'fonttools': fontTools.__version__,
    'brotli': brotli.__version__,
    'inputs': inputs,
}
output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: value for key, value in report.items() if key != 'inputs'}, ensure_ascii=False, indent=2))
