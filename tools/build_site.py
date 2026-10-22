#!/usr/bin/env python3
"""Copy the buildless portfolio into dist for static hosting. No dependencies."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'dist'
EXCLUDE = {'dist', '.git', '.openai', 'tools', '__pycache__', 'node_modules'}

def main():
    DESTINATION.mkdir(exist_ok=True)
    for path in ROOT.iterdir():
        if path.name in EXCLUDE or path.name.startswith('.') and path.name != '.nojekyll':
            continue
        if path.suffix in {'.zip', '.tar', '.gz'}:
            continue
        target = DESTINATION / path.name
        if path.is_dir():
            shutil.copytree(path, target, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        else:
            shutil.copy2(path, target)
    files = [p for p in DESTINATION.rglob('*') if p.is_file()]
    print(f'Static site prepared: {len(files)} files, {sum(p.stat().st_size for p in files):,} bytes')

if __name__ == '__main__':
    main()
