#!/usr/bin/env python3
"""Build a portable offline ZIP, excluding hosting identity and generated copies."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent / 'Zehao_Portfolio_Concise_All.zip'
EXCLUDE_DIRS = {'.git', '.openai', 'dist', 'node_modules', '__pycache__', '.sites-runtime', '.codex', '.venv', 'venv', 'playwright-report', 'test-results'}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def included(path):
    relative = path.relative_to(ROOT)
    return (path.is_file() and not any(part in EXCLUDE_DIRS for part in relative.parts)
            and not any(part.startswith('.sites-') for part in relative.parts)
            and path.suffix not in {'.pyc', '.tar', '.gz'}
            and path.name != 'portfolio_manifest.json'
            and not path.name.startswith('.env')
            and path.suffix not in {'.pem', '.key'})

def main():
    files = sorted(p for p in ROOT.rglob('*') if included(p))
    manifest = {
        'name': 'Zehao Portfolio · Three concise projects',
        'version': '3.2-research-first',
        'created_utc': datetime.now(timezone.utc).isoformat(),
        'entry': 'index.html',
        'project_entries': ['ccpp.html', 'farm-carrier.html', 'ros2.html'],
        'run': 'Open index.html directly or run START_PREVIEW.cmd / python preview_server.py',
        'scope': 'Recorded coverage and farm replay; ROS 2 research explanation, kinematic arm reconstruction, source scene and uncut simulation recording.',
        'files': [{'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in files],
    }
    manifest_path = ROOT / 'portfolio_manifest.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with zipfile.ZipFile(OUTPUT, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for p in files + [manifest_path]:
            archive.write(p, 'Zehao_Portfolio_Concise_All/' + p.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None
        for item in manifest['files']:
            content = archive.read('Zehao_Portfolio_Concise_All/' + item['path'])
            assert hashlib.sha256(content).hexdigest() == item['sha256'], item['path']
    print(json.dumps({'archive': str(OUTPUT), 'bytes': OUTPUT.stat().st_size, 'files': len(files) + 1,
                      'sha256': digest(OUTPUT), 'content_hash_verification': 'PASS'}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
