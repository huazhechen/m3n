Noto Serif CJK SC Regular, Version 2.003.
Copyright 2017-2024 Adobe (http://www.adobe.com/).
License: SIL Open Font License 1.1, see LICENSE.txt.
Source: https://github.com/notofonts/noto-cjk/tree/Serif2.003
Input: NotoSerifCJK-Regular.ttc, font index 2 (Simplified Chinese).
Input SHA-256: 5d9c31a059600193c9d7968a998bde886ccdc77e934006ad243b41794c496a7d
Full font for local publishing tools: tools/fonts/NotoSerifCJKsc-Regular.otf (not shipped by the web app)
Output SHA-256: a73dcac875b61fb04e222e2c0596f2e14e8c8aefa50a815c6cceb8c565659f3e

Extraction uses fonttools 4.67.0, removes shaping features and retains mapped BMP
and supplementary CJK codepoints. Rebuild with tools/prepare-export-font.py.
The website ships only a generated subset, src/assets/builtin-pdf-text.ttf,
for PDF exports. The preset covers the built-in corpus and scorebook text.
It is fetched on PDF export. Complete character coverage uses a further
per-document embedded subset; incomplete coverage or download/parse failure
falls back for the whole document to non-embedded system font declarations.
It is never installed as a browser font. Online display, preview and PNG
continue to use system text fonts; local/shared-score PDFs use the same coverage check and fallback.
Regenerate with node tools/prepare-builtin-pdf-font.mjs (fonttools 4.68.0).
The subset's SHA-256, size and character count are recorded beside it in
src/assets/builtin-pdf-text.json. The SIL OFL license applies to the subset.
