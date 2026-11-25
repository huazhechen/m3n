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
(root / 'packages/score-renderer/src/staff/staff-glyphs.json').write_text(
    json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Prepared {len(result)} native staff glyphs.')
