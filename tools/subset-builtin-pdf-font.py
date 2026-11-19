"""Offline font generation helper. Requires fonttools==4.68.0."""
import sys
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

source, characters, output = sys.argv[1:]
font = TTFont(source, recalcTimestamp=False)
options = subset.Options()
options.layout_features = []
options.recalc_timestamp = False
subsetter = subset.Subsetter(options=options)
with open(characters, encoding='utf-8') as text:
    subsetter.populate(text=text.read())
subsetter.subset(font)

# Fontkit's CID CFF subset writer cannot reliably preserve multiple font
# dictionaries. Convert the offline subset to quadratic TrueType outlines so
# browser PDF subsetting uses its established TrueType path.
glyph_set = font.getGlyphSet()
glyphs = {}
for name in font.getGlyphOrder():
    pen = TTGlyphPen(glyph_set)
    glyph_set[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
    glyphs[name] = pen.glyph()
builder = FontBuilder(font['head'].unitsPerEm, isTTF=True)
builder.setupGlyphOrder(font.getGlyphOrder())
builder.setupCharacterMap(font.getBestCmap())
builder.setupGlyf(glyphs)
# Fontkit may use short loca offsets for a per-PDF subset; every glyph must
# start on an even boundary, including after arbitrary subset reordering.
builder.font['glyf'].padding = 4
builder.setupHorizontalMetrics(font['hmtx'].metrics)
builder.setupHorizontalHeader(ascent=font['hhea'].ascent, descent=font['hhea'].descent)
builder.setupNameTable({
    'familyName': 'Noto Serif CJK SC', 'styleName': 'Regular',
    'uniqueFontIdentifier': 'M3N Noto Serif CJK SC Regular',
    'fullName': 'Noto Serif CJK SC Regular',
    'psName': 'NotoSerifCJKsc-Regular',
    'licenseDescription': 'SIL Open Font License, Version 1.1',
    'licenseInfoURL': 'https://openfontlicense.org/',
})
builder.setupOS2(sTypoAscender=font['OS/2'].sTypoAscender,
                 sTypoDescender=font['OS/2'].sTypoDescender,
                 usWinAscent=font['OS/2'].usWinAscent,
                 usWinDescent=font['OS/2'].usWinDescent)
builder.setupPost()
builder.font.recalcTimestamp = False
builder.font['head'].created = font['head'].created
builder.font['head'].modified = font['head'].modified
builder.save(output)
