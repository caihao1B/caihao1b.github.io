# Personal portfolio — working instructions

## Goal and presentation
This is Zehao Dong's Chinese personal portfolio, not an experiment dashboard.
Keep introductions brief and visual. Preserve the existing project evidence.
Use professional technical headings and objective project descriptions. Avoid slogans, rhetorical questions and conversational titles. Use 项目介绍 / 研究与工程项目 / 联系方式 for the main navigation and sections.
Use plain HTML/CSS/JavaScript; there is no npm build step or application backend.

- Keep each project's lead to approximately 60–100 Chinese characters.
- Do not add benchmark tables, CSV tables, large KPI walls or repeated test statistics to public project pages.
- Keep the coverage animation, two turn videos, farm map replay, all scenario data, the complete expandable decision tree and both state machines.
- Show only the main decision branches by default. Technical details and operational logs belong in closed details sections.
- Keep the existing relative file paths compatible with GitHub Pages project sites.
- Do not replace the recorded routes with invented, simplified or visually smoother motion.
- Avoid new frameworks, npm dependencies, trackers, external fonts or CDNs unless the user expressly requests them.

## Facts and boundaries
- Name: 董泽豪 / Zehao Dong. Existing contact details must not be invented or changed without request.
- TU Braunschweig master's: 2020.04–2026.03. Tongji bachelor's: 2013–2018.
- Coverage: offline reference-trajectory replay, not a physical-robot tracking test.
- Farm Carrier: Java rules + finite state machines. The behavior-tree-style view explains implemented branches; it is not BehaviorTree.CPP tick telemetry.
- Feld 13 boundary is source-derived; nearby depot and road are demo additions.
- A completed list of centreline tasks is not a proof of zero missed working area.
- ROS 2 adapter / AnyLogic facade are not evidence of an end-to-end real robot deployment.
- The farm simulation implementation was not modified by the concise website redesign.

## Files
- `index.html`: introduction, project cards, education and contact.
- `ccpp.html`: coverage replay and videos; `assets/replay.js` drives the original recorded trajectory.
- `farm-carrier.html`: map, selected Agent, decision tree / FSM tabs.
- `projects.html`: short overview linking all three projects.
- `ros2.html`: concise ROS 2 page with four tabs; `assets/ros2-concise.js` handles tabs.
- Keep six-axis interaction, seven research modes, six video chapters and source scene selection.
- Preserve source attribution and the recorded failure; the arm is a kinematic reconstruction, not a live controller.
- `assets/portfolio.css`: concise base style; `assets/merged.css`: three-project integration overrides.
- `assets/portfolio.js`: tab switching only.
- `assets/farm.js`: recorded mission playback; `assets/farm-graphs.js`: graph rendering.
- `assets/data/`, `assets/source/`, `assets/downloads/`, `assets/videos/`: evidence assets; do not modify for cosmetic tasks.
- `reports/`: prior validation artifacts plus explicitly named merged-site checks. Old counts do not validate a new edit.

## Workflow
1. Read this file and `README.md`. Confirm the working directory contains `index.html` and `assets/`.
2. Before editing, inspect `git status` when inside a Git repository; preserve pre-existing user edits.
3. Modify only the requested part. Do not rewrite unrelated pages.
4. Preview with `python preview_server.py --no-open` (Windows: `python preview_server.py --no-open`, or `py -3` if available). Read the printed URL; it may select an alternate port.
5. Run `python tools/check_site.py`. Node is optional for `node --check` on edited JavaScript files.
6. For interaction/layout checks, use a real browser. An optional Playwright test is `tools/browser_smoke.py`; use its documented command. If the browser or dependencies are unavailable, report that limitation rather than claiming a pass.
7. Report changed files, checks performed, remaining limitations and preview instructions in Chinese.

## Permission and publishing
Local edits are allowed within this project. These instructions do not grant broader access.
Never read credentials, SSH keys, browser profiles, `.env`, tokens or unrelated folders.
Do not push, publish, force-push, delete a repository, overwrite `.git`, or alter account settings without explicit user instruction for that action.
Do not run `git reset --hard`, `git clean -fd`, or silently discard changes.
`commit` and `push` are separate from saving files. Confirm the actual remote and publishing branch before a user-authorized publication.
Do not upload local login/session files. Never claim the remote site was updated unless a successful push/deployment was verified.
