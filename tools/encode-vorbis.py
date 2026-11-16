"""Encode mono float32 stdin as Ogg Vorbis using the system libsndfile."""

import ctypes as c
import ctypes.util
import os
import sys
import tempfile


class Info(c.Structure):
    _fields_ = [('frames', c.c_int64), ('samplerate', c.c_int),
                ('channels', c.c_int), ('format', c.c_int),
                ('sections', c.c_int), ('seekable', c.c_int)]


lib = c.CDLL(ctypes.util.find_library('sndfile') or 'libsndfile.so.1')
lib.sf_open.argtypes = [c.c_char_p, c.c_int, c.POINTER(Info)]
lib.sf_open.restype = c.c_void_p
lib.sf_command.argtypes = [c.c_void_p, c.c_int, c.c_void_p, c.c_int]
lib.sf_write_float.argtypes = [c.c_void_p, c.POINTER(c.c_float), c.c_int64]
lib.sf_write_float.restype = c.c_int64
lib.sf_close.argtypes = [c.c_void_p]
lib.sf_strerror.argtypes = [c.c_void_p]
lib.sf_strerror.restype = c.c_char_p

raw = sys.stdin.buffer.read()
assert len(raw) % 4 == 0
audio = (c.c_float * (len(raw) // 4)).from_buffer_copy(raw)
# SF_FORMAT_OGG | SF_FORMAT_VORBIS, SFM_WRITE; libvorbis quality 0.1 = FFmpeg q1.
info = Info(0, int(sys.argv[1]), 1, 0x200060, 0, 0)
with tempfile.TemporaryDirectory(prefix='m3n-vorbis-') as directory:
    path = os.path.join(directory, 'sample.ogg')
    handle = lib.sf_open(os.fsencode(path), 0x20, c.byref(info))
    if not handle:
        raise RuntimeError(lib.sf_strerror(None).decode())
    try:
        quality = c.c_double(0.1)
        if lib.sf_command(handle, 0x1300, c.byref(quality), c.sizeof(quality)) != 1:
            raise RuntimeError('Could not set Vorbis quality')
        if lib.sf_write_float(handle, audio, len(audio)) != len(audio):
            raise RuntimeError(lib.sf_strerror(handle).decode())
    finally:
        lib.sf_close(handle)
    with open(path, 'rb') as stream:
        sys.stdout.buffer.write(stream.read())
