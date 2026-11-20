"""Extract/subset Noto Sans CJK SC 2.004 with fonttools 4.67.0.
Usage: python tools/prepare-export-font.py /path/to/NotoSansCJK-Regular.ttc
See public/licenses/noto-sans/README.txt for source hashes and license.
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset
font = TTFont(sys.argv[1], fontNumber=2)
options = subset.Options()
options.layout_features = []
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=[code for code in font.getBestCmap() if code < 0x10000 or code >= 0x20000])
subsetter.subset(font)
# FontTools sets timestamps when saving; the distributed artifact's hash is recorded separately.
output = Path('tools/fonts/NotoSansCJKsc-Regular.otf')
output.parent.mkdir(parents=True, exist_ok=True)
font.save(output)
