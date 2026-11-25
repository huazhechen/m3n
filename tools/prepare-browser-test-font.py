"""Subset the existing TrueType font for synthetic browser fixture text only."""
import json
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

source, characters_file, output = sys.argv[1:]
font = TTFont(source, recalcTimestamp=False)
options = subset.Options()
options.layout_features = []
options.recalc_timestamp = False
subsetter = subset.Subsetter(options=options)
with open(characters_file, encoding='utf-8') as text:
    subsetter.populate(text=text.read())
subsetter.subset(font)
font.save(output)
print(json.dumps({'characters': ''.join(chr(code) for code in sorted(font.getBestCmap()))}))
