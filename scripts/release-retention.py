#!/usr/bin/env python3
"""Prune timestamped deployment artifacts only. Never follows release symlinks."""
import argparse, fcntl, json, os, re, shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--root', default='/srv/newdrugs')
parser.add_argument('--stage', choices=['dev', 'prod', 'both'], default='both')
parser.add_argument('--keep', type=int, default=3)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
if args.keep < 2:
    parser.error('Keep at least two releases.')
root = Path(args.root).resolve(strict=True)
with (root / '.release-retention.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    for stage in (['dev', 'prod'] if args.stage == 'both' else [args.stage]):
        base = root / stage
        releases = base / 'releases'
        if not releases.is_dir() or releases.is_symlink():
            continue
        candidates = sorted((p for p in releases.iterdir() if re.fullmatch(r'\d{17}', p.name) and p.is_dir() and not p.is_symlink()), reverse=True)
        protected = {p.resolve() for p in candidates[:args.keep]}
        # Current, previous rollback, and an in-flight activation are always protected.
        for name in ['current', 'previous', 'current.next']:
            path = base / name
            if path.is_symlink():
                protected.add(path.resolve())
        remove = [p for p in candidates if p.resolve() not in protected]
        print(json.dumps({'stage': stage, 'apply': args.apply, 'retained': len(candidates)-len(remove), 'remove': [p.name for p in remove]}), flush=True)
        if args.apply:
            for path in remove:
                if path.parent != releases or path.is_symlink():
                    raise RuntimeError('Release changed during retention.')
                shutil.rmtree(path)
    free = shutil.disk_usage(root).free
    print(json.dumps({'freeBytes': free}), flush=True)
    if args.apply and free < 1024**3:
        raise SystemExit('Less than 1 GiB remains. Deployment stopped; inspect disk use.')
