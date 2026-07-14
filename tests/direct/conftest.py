"""Test harness setup for direct-mode GenLayer tests.

Windows workaround: the genlayer-test direct loader injects the message context
by writing it to a temp file, dup()-ing that file descriptor onto stdin (fd 0),
and then immediately calling ``os.unlink()`` on the temp path. On POSIX that
unlink succeeds even while the fd is open; on Windows it raises
``PermissionError: [WinError 32]`` because the file is still in use.

We tolerate that specific cleanup failure so the tests can run on Windows. The
leaked temp file is reclaimed by the OS and does not affect test correctness.
"""

import os

_orig_unlink = os.unlink


def _tolerant_unlink(path, *args, **kwargs):
    try:
        return _orig_unlink(path, *args, **kwargs)
    except PermissionError:
        return None


os.unlink = _tolerant_unlink
