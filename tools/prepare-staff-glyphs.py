"""Extract native staff metrics from the distributed Bravura face, offline.

Run with .tmp/font-subset-env/bin/python. No VexFlow data is used.
"""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen

root = Path(__file__).resolve().parent.parent
font = TTFont(root / 'packages/numbered-notation/src/font-assets/Bravura.woff2')
glyphs, cmap, units = font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm
codes = {
    'gClef': 0xE050, 'fClef': 0xE062, 'brace': 0xE000,
    'noteheadWhole': 0xE0A2, 'noteheadHalf': 0xE0A3, 'noteheadBlack': 0xE0A4,
    'accidentalFlat': 0xE260, 'accidentalNatural': 0xE261, 'accidentalSharp': 0xE262,
    'accidentalDoubleSharp': 0xE263, 'accidentalDoubleFlat': 0xE264,
    'augmentationDot': 0xE1E7, 'repeatDot': 0xE044,
    'articAccentAbove': 0xE4A0, 'articStaccatoAbove': 0xE4A2,
    'articTenutoAbove': 0xE4A4, 'articStaccatissimoAbove': 0xE4A6,
    'articAccentBelow': 0xE4A1, 'articStaccatoBelow': 0xE4A3,
    'articTenutoBelow': 0xE4A5, 'articStaccatissimoBelow': 0xE4A7,
    'fermataAbove': 0xE4C0, 'breathMarkComma': 0xE4CE,
    'ornamentTrill': 0xE566, 'ornamentShortTrill': 0xE56C,
    'segno': 0xE047, 'coda': 0xE048, 'wiggleArpeggiatoUp': 0xEAA9,
}
for duration, code in zip([1, 2, 4, 8, 16, 32, 64, 128], range(0xE4E3, 0xE4EB)):
    codes[f'rest{duration}'] = code
for i, duration in enumerate([8, 16, 32, 64, 128]):
    codes[f'flag{duration}Up'] = 0xE240 + i * 2
    codes[f'flag{duration}Down'] = 0xE241 + i * 2
for i in range(10):
    codes[f'time{i}'] = 0xE080 + i
# Conservative horizontal ink bands, used only to kern key signatures.
# Subdivide Beziers with exact bounds, retaining curve extrema and a small
# band height so the generated advances never cut through the glyph outline.
from fontTools.pens.basePen import BasePen
from fontTools.misc.bezierTools import calcCubicBounds, calcQuadraticBounds, splitCubicAtT, splitQuadraticAtT
from math import floor, ceil

class SignatureBands(BasePen):
    def __init__(self):
        super().__init__(glyphs)
        self.bands = {}

    def bounds(self, box):
        left, bottom, right, top = [v / units for v in box]
        for row in range(floor(bottom / 0.005), ceil(top / 0.005) + 1):
            a, b = self.bands.get(row, (left, right))
            self.bands[row] = (min(a, left), max(b, right))

    def _moveTo(self, point):
        self.start = point

    def _lineTo(self, point):
        old = self._getCurrentPoint()
        self.bounds((min(old[0], point[0]), min(old[1], point[1]), max(old[0], point[0]), max(old[1], point[1])))

    def _curveToOne(self, a, b, c):
        for curve in splitCubicAtT(self._getCurrentPoint(), a, b, c, *[i / 32 for i in range(1, 32)]):
            self.bounds(calcCubicBounds(*curve))

    def _qCurveToOne(self, a, b):
        for curve in splitQuadraticAtT(self._getCurrentPoint(), a, b, *[i / 32 for i in range(1, 32)]):
            self.bounds(calcQuadraticBounds(*curve))

    def _closePath(self):
        self._lineTo(self.start)


def signature_advances(glyph):
    pen = SignatureBands()
    glyph.draw(pen)
    # dy is the next glyph's SVG baseline minus this one's, in eighth-em units.
    # Include vertical as well as horizontal clearance (0.08 staff spaces).
    gap = 0.02
    advances = []
    for dy in range(-8, 9):
        distance = 0
        for row, (_, right) in pen.bands.items():
            low, high = row * 0.005 - gap, (row + 1) * 0.005 + gap
            # Font coordinates point upwards, SVG coordinates downwards.
            first = floor((low + dy / 8) / 0.005)
            last = ceil((high + dy / 8) / 0.005)
            for other in range(first, last + 1):
                if other in pen.bands:
                    distance = max(distance, right + gap - pen.bands[other][0])
        advances.append(ceil(distance * 1000000) / 1000000)
    return advances

result = {}
for name, code in codes.items():
    if code not in cmap:
        raise ValueError(f'Bravura is missing {name} U+{code:04X}')
    glyph = glyphs[cmap[code]]
    pen = BoundsPen(glyphs)
    glyph.draw(pen)
    left, bottom, right, top = pen.bounds
    recording = RecordingPen()
    glyph.draw(recording)
    # Preserve independent contours for avoidance (clefs, flags, etc.).
    boxes, contour = [], RecordingPen()
    for operation, args in recording.value:
        getattr(contour, operation)(*args)
        if operation in ('closePath', 'endPath'):
            bounds = BoundsPen(glyphs)
            contour.replay(bounds)
            if bounds.bounds:
                a, b, c, d = bounds.bounds
                boxes.append([a / units, -d / units, c / units, -b / units])
            contour = RecordingPen()
    result[name] = dict(character=chr(code), left=left / units, right=right / units,
                        top=-top / units, bottom=-bottom / units,
                        advance=font['hmtx'][cmap[code]][0] / units, boxes=boxes)
    if name in ('accidentalSharp', 'accidentalFlat', 'accidentalNatural'):
        result[name]['signatureAdvances'] = signature_advances(glyph)
(root / 'packages/score-renderer/src/staff/staff-glyphs.json').write_text(
    json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Prepared {len(result)} native staff glyphs.')
