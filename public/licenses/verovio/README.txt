Verovio 6.2.0 by Laurent Pugin and contributors
https://github.com/rism-digital/verovio
Upstream commit: 43f806031bfff2c64003fc8ddd9910820445f6ab
License: LGPL-3.0-or-later (COPYING.LESSER and COPYING in this directory).

M3N distributes a modified build with unused resources and input formats
excluded. Leipzig and Bravura music fonts, Times text metrics, SVG, MEI,
MIDI and timing support are retained. Gootville, Leland, Petaluma and the
optional Liberation web font are excluded. Font notices are provided here;
font sources and embedded dependency notices are in the source archive.

The exact upstream source is available beside this notice at:
  verovio-6.2.0-source.tar.gz
SHA-256:
  9ec55723381105f14453d5d182d09877d75d6f18c31ef4119164d74132a47eca

The complete M3N modification/build recipe is build-verovio.mjs in this
directory. To rebuild, place it at tools/build-verovio.mjs in a directory
with the source archive at public/licenses/verovio/verovio-6.2.0-source.tar.gz.
Install and activate Emscripten 4.0.20, provide CMake (tested with 3.31.6),
GNU Make, tar and Node.js, then run:
  node tools/build-verovio.mjs
The recipe applies the pinned version header and CMake version-generation
change, compiles the library, filters embedded resources and links the
replacement ES module. No engraving or playback algorithms are patched.
See docs/VEROVIO_BUILD.md in the M3N repository for integration and verification.

These source and notice files are optional downloads and are not loaded
when displaying or playing a score.
