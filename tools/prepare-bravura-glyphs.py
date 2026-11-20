"""Extract Bravura outlines from the pinned offline Verovio source archive."""
import json
import tarfile
import xml.etree.ElementTree as ET
from pathlib import Path
from fontTools.pens.basePen import BasePen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

root = Path(__file__).resolve().parent.parent
class PathPen(BasePen):
    def __init__(self):
        super().__init__(None)
        self.commands = []
    def emit(self, op, *points):
        self.commands.append(op + ' '.join(str(round(v, 6)) for p in points for v in p))
    def _moveTo(self, p): self.emit('M', p)
    def _lineTo(self, p): self.emit('L', p)
    def _curveToOne(self, a, b, c): self.emit('C', a, b, c)
    def _closePath(self): self.emit('Z')
    def _endPath(self): pass

with tarfile.open(root / 'public/licenses/verovio/verovio-6.2.0-source.tar.gz') as archive:
    files = {m.name.split('/data/', 1)[1]: m for m in archive.getmembers() if '/data/' in m.name and m.isfile()}
    metadata = ET.fromstring(archive.extractfile(files['Bravura.xml']).read())
    names = {g.get('c'): g.get('n') for g in metadata}
    native = {}
    staff = {}
    for file, member in files.items():
        if not file.startswith('Bravura/') or not file.endswith('.xml'): continue
        data = archive.extractfile(member).read().decode()
        code = Path(file).stem
        staff[code] = data
        name = names.get(code)
        if not name: continue
        pen = PathPen()
        for path in ET.fromstring(data).iter('path'):
            parse_path(path.get('d'), TransformPen(pen, (1, 0, 0, -1, 0, 0)))
        native[name] = ''.join(pen.commands)

selected = ['coda', 'segno', 'fermataAbove', 'breathMarkComma', 'articAccentAbove', 'articTenutoAbove', 'articStaccatissimoAbove',
            'ornamentTrill', 'ornamentShortTrill', 'accidentalFlat', 'accidentalNatural', 'accidentalSharp',
            'dynamicPiano', 'dynamicForte', 'dynamicMP', 'dynamicMF', 'dynamicPP', 'dynamicPPP', 'dynamicFF', 'dynamicFFF', 'dynamicSforzato',
            'metNoteWhole', 'metNoteHalfUp', 'metNoteQuarterUp', 'metNote8thUp', 'metNote16thUp', 'metNote32ndUp', 'metNote64thUp', 'wiggleArpeggiatoUp']
(root / 'packages/numbered-notation/src/bravura-glyphs.json').write_text(json.dumps({k: native[k] for k in selected}, separators=(',', ':')) + '\n')
(root / 'packages/score-renderer/src/staff/smufl-glyphs.json').write_text(json.dumps(staff, indent=2) + '\n')
