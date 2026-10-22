# Zehao Dong · Robotics portfolio

This version extends the supplied static portfolio with **Farm Carrier**, the completed Java simulation of a carrier and three agricultural robot Agents. It preserves the personal profile, CCPP demonstrations, motion videos, and separately scoped ROS 2 project overview. The uploaded original ZIP is unchanged; **Zehao_Portfolio_FarmCarrier.zip** is a separate updated output.

## Open the portfolio

Read **START_HERE.html** for the complete Chinese Windows guide. After extracting the whole ZIP, you can open **farm-carrier.html directly as a local file**: the replay data and decision models load from local classic JavaScript files, without a fetch request or backend. Keep the `assets/` directory beside the HTML pages.

**START_PREVIEW.cmd remains the recommended way to preview the complete portfolio.** It starts the supplied Python 3 standard-library preview server on `127.0.0.1` and opens your browser, providing consistent HTTP paths for page navigation and downloads. The displayed website does not require Java, ROS, Node.js, npm, external fonts, a map service, or an API key. Direct local-file viewing does not need Python either.

- `index.html`: profile and three project summaries.
- `ccpp.html`: original grid and trajectory demonstrations, unchanged except navigation.
- `farm-carrier.html`: synchronized map, scheduling explanation tree, Agent state machines, resource telemetry, and event replay.
- `projects.html`: project relationships and the separately scoped ROS 2 execution project.
- `docs/FARM_CARRIER_PRESENTATION_ZH.md`: presentation narrative, an interview demonstration route, and implementation boundaries.
- `docs/WEBSITE_VALIDATION_ZH.md`: validation scope for this new website, distinct from the original simulator tests.

## Farm Carrier demonstration

The new page plays **actual snapshots and events exported from `farm.sim.MissionEngine`**. It provides normal, low-battery, harvest, blocked-route, and robot-fault scenarios. Pause, scrub, select an Agent, inspect decision nodes, and compare scenarios to explain why the system transports, deploys, works, services, resumes, and recovers robots.

The runtime implementation is **explicit rules, greedy strip assignment, and finite state machines**. The website's behavior tree is an explanatory mapping of those rules. It does not claim to run BehaviorTree.CPP, a reinforcement-learning policy, an LLM Agent, or a ROS navigation stack in the browser. Highlighted nodes describe the recorded state and relevant logic; they are not fabricated BT tick statuses.

The Feld 13 boundary is derived from the project map. The near-field depot, road, and default ground-robot resource parameters are demonstration inputs. Coverage means completed planned strip-centerline length; it is not a swept-tool area guarantee. Robot motion uses a planar point model. The three single-capacity resources constrain entry, loading, and service; they do not prove collision avoidance throughout the field.

Fault and route-block scenarios stop the simulation clock in `WAITING_RECOVERY`. Recorded recovery commands are explicitly identified as scripted operator actions. Their replay display time must not be interpreted as measured repair downtime.

### Re-run the simulation

`assets/downloads/farm-carrier-system-v1.0.zip` contains the complete original deliverable: Java source and JAR, maps, standalone interactive simulator, configuration, test evidence, and integration examples. Extract it separately and follow its `README_ZH.md`. A Java runtime is needed to run the simulation; opening this portfolio's recorded demonstration does not need it.

The source package's `reports/benchmark.json`, `docs/VALIDATION_REPORT.md`, and `docs/MAP_PROVENANCE.md` document the numerical results and model limits. Website export data and verification records are under `assets/data/` and `reports/`. The website's exporter is under `tools/`; use its instructions when regenerating recordings. Source changes do not automatically update exported playback assets.

## CCPP data and model scope

`assets/data/cases.js` is exported from validated CCPP v2.1 results. Playback evaluates saved geometric primitives and time profiles; it does not re-plan inside the browser. These are research reference trajectories, not closed-loop control or calibrated full vehicle dynamics. The ten demonstrations use `loops_only`: no chassis pivot and no reverse driving. Curvature-discontinuous joins stop before steering changes. Actual area coverage is reported separately from discrete task completion.

See `assets/data/comparison.csv`, per-case `*_visits.csv`, and evidence hashes. The separate CCPP project provides `tools/build_comparison_suite.py` and `tools/export_comparison_site.py` for regeneration.

## Website verification

Run `python tools/validate_portfolio.py` to check the source HTML links, anchors, control associations, and preservation of the original CCPP assets. Generated folders such as `dist/` are excluded. Data and decision-model validation are recorded separately. This update does **not** claim a completed real-browser visual or responsive-layout acceptance test: the hosted preview timed out. The original simulator’s browser test results are historical evidence for that simulator, not a passing result for this new page. See `docs/WEBSITE_VALIDATION_ZH.md` for the exact scope and report paths.

## Share and publish

Keep `index.html`, the other HTML pages, and the complete `assets/` directory together. The site is buildless and can be served as static files. The included Windows guide retains the user's GitHub Pages publication workflow. This deliverable does not write to the user's GitHub account. If an online preview is supplied with the delivery, use its actual access settings when sharing it.

## Privacy and maintenance

The original name, education, dates, e-mail, and GitHub handle are preserved. No portrait, personal achievement, employer application, real-robot validation, visitor analytics, or third-party testimonial has been invented. The ZD monogram is a text mark. Future personal contribution claims should remain consistent with work the owner can explain and substantiate.
