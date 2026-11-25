"""Run one verification command with a bounded Node heap and aggregate RSS guard.

Counts Node, browser and font/test processes across worktrees. Stops its own
process tree at 2600 MiB by default (also the maximum via
M3N_MEMORY_LIMIT_MB), leaving headroom below the authorized 3 GB ceiling.
"""
import os
import signal
import subprocess
import sys
import time

env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384',
       'VITEST_MAX_WORKERS': '1'}
limit_mib = int(os.environ.get('M3N_MEMORY_LIMIT_MB', '2600'))
if not 256 <= limit_mib <= 2600:
    sys.exit('M3N_MEMORY_LIMIT_MB must be between 256 and 2600, below the 3 GB ceiling.')
command = sys.argv[1:]
if not command:
    sys.exit('Usage: python3 tools/run-low-memory.py COMMAND [ARGS...]')
# Do not overlap another worktree's build, test or browser job.
def active_job():
    for row in subprocess.check_output(['ps', '-eo', 'pid,comm,args'], text=True).splitlines()[1:]:
        parts = row.split(None, 2)
        if len(parts) != 3:
            continue
        pid, comm, args = parts
        heavy = any(name in comm.lower() for name in ['node', 'vitest', 'esbuild', 'chromium', 'chrome']) or ('python' in comm and any(name in args for name in ['prepare-score-fonts', 'prepare-staff-glyphs', 'subset-builtin-pdf-font']))
        if int(pid) == os.getpid() or not heavy:
            continue
        try:
            cwd = os.readlink(f'/proc/{pid}/cwd')
        except OSError:
            continue
        if '/m3n' in cwd:
            return pid, comm
    return None

deadline = time.monotonic() + 60
reported = False
while (active := active_job()):
    if not reported:
        print(f'Waiting for another project job (PID {active[0]}, {active[1]}).', flush=True)
        reported = True
    if time.monotonic() >= deadline:
        sys.exit('Deferred: project verification is still active; retry when idle.')
    time.sleep(0.5)
job = subprocess.Popen(command, env=env, start_new_session=True)
peak = 0
owned = {job.pid}
def collect_children():
    rows = subprocess.check_output(['ps', '-eo', 'pid,ppid'], text=True).splitlines()[1:]
    pairs = [tuple(map(int, row.split())) for row in rows]
    while True:
        children = {pid for pid, parent in pairs if parent in owned}
        before = len(owned)
        owned.update(children)
        if len(owned) == before:
            break

try:
    while job.poll() is None:
        collect_children()
        total = 0
        for row in subprocess.check_output(['ps', '-eo', 'pid,rss,comm,args'], text=True).splitlines()[1:]:
            parts = row.split(None, 3)
            if len(parts) != 4 or int(parts[0]) == os.getpid():
                continue
            _, rss, comm, args = parts
            if any(name in comm.lower() for name in ['node', 'chrome', 'chromium', 'vitest', 'esbuild']) or ('python' in comm and any(name in args for name in ['font', 'score', 'm3n'])):
                total += int(rss)
        peak = max(peak, total)
        if total >= limit_mib * 1024:
            print(f'Memory guard stopping job: aggregate RSS {total / 1024:.0f} MiB', flush=True)
            print('\n'.join(subprocess.check_output(['ps', '-eo', 'pid,ppid,rss,comm', '--sort=-rss'], text=True).splitlines()[:8]), flush=True)
            raise MemoryError()
        time.sleep(0.1)
except (MemoryError, KeyboardInterrupt):
    collect_children()
    # Detached browser/preview groups must also be stopped. A short grace
    # period limits allocations while allowing ordinary file handles to close.
    for pid in sorted(owned, reverse=True):
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    time.sleep(0.3)
    collect_children()
    for pid in sorted(owned, reverse=True):
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    job.wait()
    sys.exit(99)
print(f'Memory guard: peak aggregate RSS {peak / 1024:.0f} MiB', flush=True)
sys.exit(job.returncode)
