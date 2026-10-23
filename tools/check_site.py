#!/usr/bin/env python3
"""Validate the static portfolio without installing any dependencies."""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ('index.html', 'projects.html', 'ccpp.html', 'farm-carrier.html', 'ros2.html')

class Page(HTMLParser):
    def __init__(self, content: str):
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.references: list[str] = []
        self.scripts: list[str] = []
        self.tables = 0
        self.feed(content)
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if data.get('id'): self.ids.append(data['id'])
        if tag == 'table': self.tables += 1
        for attr in ('href', 'src', 'poster'):
            if data.get(attr): self.references.append(data[attr])
        if tag == 'script' and data.get('src'): self.scripts.append(data['src'])
    def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs)

def validate() -> dict:
    checks = []
    pages: dict[Path, Page] = {}
    def page(path: Path) -> Page:
        if path not in pages: pages[path] = Page(path.read_text(encoding='utf-8'))
        return pages[path]
    def record(name, ok, details):
        checks.append(dict(name=name, passed=bool(ok), details=details))
    for filename in (*PUBLIC, 'START_HERE.html'):
        path = ROOT / filename
        if not path.is_file():
            record(filename + ': exists', False, 'Missing file'); continue
        doc = page(path)
        duplicates = [key for key, n in Counter(doc.ids).items() if n > 1]
        record(filename + ': unique IDs', not duplicates, duplicates)
        failures = []
        for ref in doc.references:
            url = urlsplit(ref)
            if url.scheme or url.netloc: continue
            target = (path.parent / unquote(url.path)).resolve() if url.path else path
            if not target.is_relative_to(ROOT):
                failures.append(ref + ' escapes project root'); continue
            if not target.is_file():
                failures.append(ref + ' missing local file'); continue
            if url.fragment and target.suffix == '.html' and unquote(url.fragment) not in page(target).ids:
                failures.append(ref + ' missing anchor')
        record(filename + ': local references', not failures, failures)
        if filename in PUBLIC: record(filename + ': no tables', doc.tables == 0, {'tableCount': doc.tables})
    for html, script in [('ccpp.html', 'assets/replay.js'), ('farm-carrier.html', 'assets/farm.js'), ('ros2.html', 'assets/ros2.js')]:
        hooks = set(re.findall(r"\$\(['\"]([^'\"]+)['\"]\)", (ROOT/script).read_text(encoding='utf-8')))
        missing = sorted(hooks - set(page(ROOT/html).ids))
        record(html + ': required JavaScript hooks', not missing, {'missing': missing, 'checked': len(hooks)})
    farm = page(ROOT/'farm-carrier.html')
    expected = ['assets/data/farm-replays.js','assets/data/farm-decision-model.js','assets/farm-graphs.js','assets/farm.js']
    actual = [s for s in farm.scripts if s in expected]
    record('Farm scripts load in dependency order', actual == expected, actual)
    ros = page(ROOT/'ros2.html')
    expected_ros = ['assets/data/robot-scene.js', 'assets/data/arm-model.js', 'assets/arm-lab.js', 'assets/ros2.js', 'assets/ros2-concise.js']
    actual_ros = [s for s in ros.scripts if s in expected_ros]
    record('ROS scripts load in dependency order', actual_ros == expected_ros, actual_ros)
    required_ros = {'armLab','arm','research','recording','system','modeCode','modeTitle','modeDescription','modeAction','modeLedger','modeSource','flowCode','flowTitle','flowDescription','flowSource','mapFull','mapWork','sceneCanvas','sceneSelect','sceneDetail','robotVideo','chapterNote'}
    record('ROS interactive mounts and dynamic text targets', required_ros <= set(ros.ids), sorted(required_ros - set(ros.ids)))
    ros_content = (ROOT/'ros2.html').read_text(encoding='utf-8')
    record('ROS demonstration coverage', all(len(re.findall(pattern, ros_content)) == count for pattern, count in [(r'data-ros-tab=',4),(r'data-mode=',7),(r'data-seek=',6),(r'data-flow=',6)]), '4 panels, 7 decision modes, 6 video chapters, 6 task phases')
    record('ROS tabs have matching panels', all(f'aria-controls="{key}"' in ros_content and f'aria-labelledby="tab-{key}"' in ros_content for key in ['arm','research','recording','system']), 'Matching labelled tabs and panels')
    for filename in PUBLIC:
        record(filename + ': ROS project reachable', 'ros2.html' in (ROOT/filename).read_text(encoding='utf-8'), filename)
    for filename in ['.nojekyll','AGENTS.md','README.md','preview_server.py','START_PREVIEW.cmd',
                     'assets/data/cases.js','assets/data/farm-replays.js','assets/data/farm-decision-model.js',
                     'assets/videos/heading_loop.mp4','assets/videos/forward_uturn.mp4',
                     'assets/downloads/farm-carrier-system-v1.0.zip','docs/EDIT_WITH_CODEX_ZH.md',
                     'assets/videos/yzbot-gazebo-recording.mp4','assets/data/arm-model.js','assets/data/robot-scene.js',
                     'assets/arm-lab.js','assets/arm-lab.css','assets/ros2-concise.js','assets/merged.css',
                     'assets/source/yzbot/SOURCE-NOTES.txt','docs/PROJECT03_SOURCE_INDEX_ZH.md']:
        record('Required file: '+filename, (ROOT/filename).is_file(), filename)
    content = (ROOT/'farm-carrier.html').read_text(encoding='utf-8')
    record('Coverage progress uses fraction scale', 'id="coverageMeter" max="1"' in content, 'fraction 0–1; resource meters 0–100')
    return {'version':'concise-all-v3','generatedAt':datetime.now(timezone.utc).isoformat(),
            'scope':'Static local links, anchors, IDs, hooks and required assets; not a browser/runtime verification.',
            'checks':checks, 'passed': all(c['passed'] for c in checks)}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'reports/merged-static-checks.json')
    args = parser.parse_args()
    report = validate()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    for check in report['checks']:
        print(('PASS' if check['passed'] else 'FAIL')+' '+check['name'])
        if not check['passed']: print(check['details'])
    print(f"{sum(c['passed'] for c in report['checks'])}/{len(report['checks'])} checks passed; {args.output}")
    return 0 if report['passed'] else 1
if __name__ == '__main__': sys.exit(main())
