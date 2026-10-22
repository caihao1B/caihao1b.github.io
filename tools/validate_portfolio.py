#!/usr/bin/env python3
"""Check the static portfolio and the original CCPP artifact hashes.

Usage:
  python tools/validate_portfolio.py
  python tools/validate_portfolio.py --site /path/to/site --original-zip original.zip
  python tools/validate_portfolio.py --allow-pending  # while UI assets are generated

No third-party packages or network requests are used. This is a static check,
not a browser interaction or JavaScript execution test. The embedded baseline
was computed from the user-supplied portfolio ZIP during this update.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit
import zipfile

# Replaced with hashes from the supplied original archive at creation time.
ORIGINAL_BASELINE = {'archive': 'Zehao_Portfolio_Redesigned(1).zip', 'archive_sha256': '5b48ecf19aea6fa9143274dfe3853a1f2b477cb33a9bddc593be5c02bca78723', 'files': [{'path': 'assets/data/car_r060_visits.csv', 'sha256': '546aa954982db007fc4461490d5c7039aef5b6a015e2651d21c3d887732c95e6', 'size_bytes': 6582}, {'path': 'assets/data/car_r090_visits.csv', 'sha256': '546aa954982db007fc4461490d5c7039aef5b6a015e2651d21c3d887732c95e6', 'size_bytes': 6582}, {'path': 'assets/data/cases.js', 'sha256': '4f557ce7ee4e9d2c5882bf1a5276ee5f3e78d33bbd88ed13825ddb812a560f5d', 'size_bytes': 3819348}, {'path': 'assets/data/comparison.csv', 'sha256': '07db631a858d7f93e007cee9a8e9c6a71404064629a3df1fbb9a29155ed3d3dc', 'size_bytes': 1486}, {'path': 'assets/data/evidence_manifest.json', 'sha256': '1870998033592d31651a7bfcf9d0a78322f05857618689359f3163d8544048b8', 'size_bytes': 2208}, {'path': 'assets/data/media_manifest.json', 'sha256': '2da16e99d5226928d8bf809a99b0f0f226ecd03c0fda6feea141f36130389458', 'size_bytes': 422}, {'path': 'assets/data/square_ga_circular_visits.csv', 'sha256': '94d6f9170073baf1e3e06ba65c16f875723dc320d6e5cb4c41d4357fd91138bb', 'size_bytes': 4610}, {'path': 'assets/data/square_ga_conservative_visits.csv', 'sha256': '94d6f9170073baf1e3e06ba65c16f875723dc320d6e5cb4c41d4357fd91138bb', 'size_bytes': 4610}, {'path': 'assets/data/square_ga_visits.csv', 'sha256': '94d6f9170073baf1e3e06ba65c16f875723dc320d6e5cb4c41d4357fd91138bb', 'size_bytes': 4610}, {'path': 'assets/data/square_greedy_visits.csv', 'sha256': '1dda0c3564c50b782f710dfc5add9855c9431eb10ec55ad239aa40a7204aaf01', 'size_bytes': 6953}, {'path': 'assets/data/square_mst_visits.csv', 'sha256': 'ebec751f4ab6d4f90c3132afef27556149e057bd82248109ac88031e368cfd38', 'size_bytes': 6343}, {'path': 'assets/data/test-summary.js', 'sha256': '1da2df8e39155b24d4d132386c7ae5c194dcbb467d6d3a9a61e5dbfcd49f51e6', 'size_bytes': 63}, {'path': 'assets/data/triangle_ga_visits.csv', 'sha256': 'a82c08b0999f253c490484713638795aa036e15662ed5d70a285eddb05723a89', 'size_bytes': 6223}, {'path': 'assets/data/triangle_greedy_visits.csv', 'sha256': '20f50b65ab521e51da913f98c99c23140857bcf19d00f6732ffe6ba1c0d04492', 'size_bytes': 9650}, {'path': 'assets/data/triangle_mst_visits.csv', 'sha256': 'af4bdad0db4b3358c5f27f2f8cc855de62df61cafd913bf45face0948e0cac24', 'size_bytes': 8458}, {'path': 'assets/images/bezier_closeup.png', 'sha256': '33dd5a0310975d7e4f8eb20a7550f5b0b1250baffeee288253e291787923ee8d', 'size_bytes': 101633}, {'path': 'assets/images/heading_loop.png', 'sha256': '6886615fe9d94265a47609eec86f01aecd34b1af8924ab361b54e56393c7f1f0', 'size_bytes': 105411}, {'path': 'assets/images/ordered_route.png', 'sha256': '3cb7876ba86f1d9844bbf8c406a77b2e84015d27426b69d77d22ca0435ca7b1e', 'size_bytes': 90118}, {'path': 'assets/images/radius_comparison.png', 'sha256': 'f3fd4fa1cf1750f4f836d259179c78b5c30403bba63bb14eb050d0c2636f147e', 'size_bytes': 75891}, {'path': 'assets/images/square_ga.png', 'sha256': '5b9541653e0d411f5e7b5ad8eeec81e0803b1e5eae43fadc89a2e5f7fa1bb279', 'size_bytes': 138519}, {'path': 'assets/images/square_ga_grid.png', 'sha256': 'afa019876c3d76aa61e5f89d7d4a4a59928979b4b1ff7cc1c5b66413cb17ab87', 'size_bytes': 43631}, {'path': 'assets/images/triangle_ga.png', 'sha256': '9b05ed7ba788131d822dc84525ac2dd6c320807d86c69612848cd55e3c0ff5e0', 'size_bytes': 145124}, {'path': 'assets/images/triangle_ga_grid.png', 'sha256': 'eeb7c6dd0db76648218d48fba0254066507ac12c7177667f50ed93648ad604b1', 'size_bytes': 130340}, {'path': 'assets/replay.js', 'sha256': '187b7acdf4d19714a2fdb4637e1d62be0d03eeba29faed85b9548a1a5cc7ccf6', 'size_bytes': 17309}, {'path': 'assets/videos/forward_uturn.csv', 'sha256': '5f24de50726e1727aed394b28f4f0ca7baa05970cfacbb3d89bc0d1ae6780973', 'size_bytes': 219397}, {'path': 'assets/videos/forward_uturn.jpg', 'sha256': '825ee4c419785b006dd0bbeaa2a45eea2414a358d0b7bd8c57f3654465eb5646', 'size_bytes': 46901}, {'path': 'assets/videos/forward_uturn.mp4', 'sha256': 'bc98ce25fce2afa1298c846642cdcb1ed12e5f7cdb200da4ca6cc94b023a3b3c', 'size_bytes': 470219}, {'path': 'assets/videos/heading_loop.csv', 'sha256': '8029c91eec6e01a04c9a5c1459596cd1127de8f25ba71a3c43fb5da42036a201', 'size_bytes': 219828}, {'path': 'assets/videos/heading_loop.jpg', 'sha256': '9fdc6391c11ab58a9579bbf01ab7b4e36066214d5e9e0ebc527b1292a8ce34cf', 'size_bytes': 47800}, {'path': 'assets/videos/heading_loop.mp4', 'sha256': 'a686e2e3ea1e0c9858b56fdfd1fade9f57c74ff9968404ffb2b2d8f0d4e80658', 'size_bytes': 628710}]}
PENDING_ASSETS = {
    "assets/farm.js",
    "assets/farm-graphs.js",
    "assets/data/farm-decision-model.js",
    "assets/farm-graphs.css",
}
GENERATED_DIRS = {"dist", "build", "out", "node_modules", "__pycache__", ".git", ".output", ".cache"}
LABELABLE = {"button", "input", "meter", "output", "progress", "select", "textarea"}


class Page(HTMLParser):
    def __init__(self, path: Path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.ids: list[tuple[str, str, int]] = []
        self.references: list[dict] = []
        self.associations: list[dict] = []
        self.feed(path.read_text(encoding="utf-8-sig"))
        self.close()

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        line = self.getpos()[0]
        if data.get("id") is not None:
            self.ids.append((data["id"], tag, line))
        # Old-style named anchor targets are legal fragment identifiers.
        if tag == "a" and data.get("name"):
            self.ids.append((data["name"], "named-anchor", line))
        for attr in ("href", "src", "poster"):
            if data.get(attr):
                self.references.append({"tag": tag, "attribute": attr,
                                        "value": data[attr], "line": line})
        if tag == "label" and data.get("for"):
            self.associations.append({"attribute": "for", "targets": [data["for"]],
                                      "line": line})
        for attr in ("aria-controls", "aria-labelledby", "aria-describedby"):
            if data.get(attr):
                self.associations.append({"attribute": attr,
                                          "targets": data[attr].split(), "line": line})

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def selected_original_asset(name: str) -> bool:
    return name.startswith(("assets/data/", "assets/videos/", "assets/images/")) or name == "assets/replay.js"


def archive_baseline(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        items = []
        for name in sorted(archive.namelist()):
            if not name.endswith("/") and selected_original_asset(name):
                data = archive.read(name)
                items.append({"path": name, "sha256": digest(data), "size_bytes": len(data)})
    return {"archive": path.name, "archive_sha256": digest(path.read_bytes()), "files": items}


def validate(site: Path, baseline: dict, allow_pending: bool) -> dict:
    errors, warnings, pending = [], [], []
    pages = {}
    for path in sorted(site.rglob("*.html")):
        relative = path.relative_to(site)
        if any(part.startswith(".") or part in GENERATED_DIRS for part in relative.parts):
            continue
        try:
            pages[path.resolve()] = Page(path)
        except (OSError, UnicodeError, ValueError) as exc:
            errors.append({"check": "html_read", "file": relative.as_posix(), "message": str(exc)})
    reference_count = fragment_count = association_count = 0
    missing_seen = set()
    for path, page in pages.items():
        rel = path.relative_to(site).as_posix()
        counts = Counter(item[0] for item in page.ids)
        for identifier, count in counts.items():
            if count > 1:
                errors.append({"check": "duplicate_id", "file": rel, "id": identifier, "count": count})
            if not identifier:
                warnings.append({"check": "empty_id", "file": rel})
        id_tags = {identifier: tag for identifier, tag, _ in page.ids}
        for association in page.associations:
            for identifier in association["targets"]:
                association_count += 1
                if identifier not in id_tags:
                    errors.append({"check": "element_association", "file": rel,
                                   "attribute": association["attribute"], "target": identifier,
                                   "line": association["line"], "message": "target ID missing"})
                elif association["attribute"] == "for" and id_tags[identifier] not in LABELABLE:
                    errors.append({"check": "label_target", "file": rel,
                                   "target": identifier, "line": association["line"],
                                   "message": "label target is not a labelable element"})
        for reference in page.references:
            value = reference["value"].strip()
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc:
                continue
            raw_path = unquote(parsed.path)
            if raw_path.startswith("/"):
                target = (site / raw_path.lstrip("/")).resolve()
            elif raw_path:
                target = (path.parent / raw_path).resolve()
            else:
                target = path
            try:
                target_relative = target.relative_to(site).as_posix()
            except ValueError:
                errors.append({"check": "site_path_escape", "file": rel,
                               "reference": value, "line": reference["line"]})
                continue
            if raw_path:
                reference_count += 1
                if not target.exists():
                    issue = {"check": "local_reference", "file": rel,
                             "reference": value, "target": target_relative,
                             "line": reference["line"]}
                    key = (rel, value)
                    if key not in missing_seen:
                        missing_seen.add(key)
                        if allow_pending and target_relative in PENDING_ASSETS:
                            issue["message"] = "expected generated asset, still pending"
                            pending.append(issue)
                        else:
                            issue["message"] = "local target missing"
                            errors.append(issue)
                    continue
            if target.is_dir():
                if (target / "index.html").is_file():
                    target = (target / "index.html").resolve()
                else:
                    warnings.append({"check": "directory_link", "file": rel,
                                     "reference": value, "message": "directory has no index.html"})
            if parsed.fragment and target.suffix.lower() == ".html" and target in pages:
                fragment = unquote(parsed.fragment)
                # Browser text fragments are not HTML ID references.
                if fragment.startswith(":~:text="):
                    continue
                fragment_count += 1
                identifiers = {identifier for identifier, _, _ in pages[target].ids}
                if fragment not in identifiers:
                    errors.append({"check": "html_fragment", "file": rel,
                                   "reference": value, "line": reference["line"],
                                   "target": target.relative_to(site).as_posix(),
                                   "fragment": fragment, "message": "HTML fragment target missing"})
    original_results = []
    for expected in baseline.get("files", []):
        target = site / expected["path"]
        item = dict(expected)
        if not target.is_file():
            item["status"] = "MISSING"
            errors.append({"check": "original_ccpp_asset", "file": expected["path"],
                           "message": "original asset missing"})
        else:
            item["actual_sha256"] = digest(target.read_bytes())
            item["status"] = "PASS" if item["actual_sha256"] == expected["sha256"] else "MODIFIED"
            if item["status"] != "PASS":
                errors.append({"check": "original_ccpp_asset", "file": expected["path"],
                               "message": "hash differs from supplied original ZIP"})
        original_results.append(item)
    if not original_results:
        errors.append({"check": "original_ccpp_baseline", "message": "no baseline assets available"})
    status = "FAIL" if errors else "PENDING" if pending else "PASS"
    return {
        "schema_version": 1,
        "status": status,
        "checked_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scope": "Source HTML references, fragment and control associations, and original CCPP artifact preservation; generated directories excluded",
        "excluded_directories": sorted(GENERATED_DIRS),
        "summary": {"html_files": len(pages), "local_references": reference_count,
                    "html_fragments": fragment_count, "element_associations": association_count,
                    "original_ccpp_assets": len(original_results), "errors": len(errors),
                    "warnings": len(warnings), "pending": len(pending)},
        "errors": errors, "warnings": warnings, "pending": pending,
        "original_ccpp_assets": {"archive": baseline.get("archive"),
                                 "archive_sha256": baseline.get("archive_sha256"),
                                 "files": original_results},
        "limits": ["No browser execution, JavaScript runtime assertions, or visual layout validation.",
                   "Only HTML references are resolved; arbitrary strings inside Markdown are not treated as links.",
                   "The allowed pending list is effective only with --allow-pending; a pending report is never PASS.",
                   "New Farm Carrier assets are checked for existence, not compared against the original CCPP archive."],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--original-zip", type=Path, help="compare with this original ZIP instead of the embedded baseline")
    parser.add_argument("--report", type=Path, help="output JSON path; defaults to reports/farm-site-static-validation.json")
    parser.add_argument("--allow-pending", action="store_true", help="recognize four not-yet-generated UI assets as PENDING")
    args = parser.parse_args()
    site = args.site.resolve()
    baseline = archive_baseline(args.original_zip.resolve()) if args.original_zip else ORIGINAL_BASELINE
    report = validate(site, baseline, args.allow_pending)
    output = args.report or site / "reports/farm-site-static-validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "summary": report["summary"],
                      "errors": report["errors"], "pending": report["pending"],
                      "report": str(output)}, ensure_ascii=False, indent=2))
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
