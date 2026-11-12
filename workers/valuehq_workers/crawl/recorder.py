"""Keeps track of a crawl: which URLs were taken or skipped, what each fetch produced, and the report.

Blobs are content-addressed (sha256 of the bytes), so a page that didn't change, or the same file
linked from ten places, is stored once. New blobs are staged on local disk and uploaded at the end.
"""
from __future__ import annotations

import gzip
import hashlib
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from .. import layout

# Failures worth one more try after a pause.
TRANSIENT = {"timeout", "connection", "dns", "http-408", "http-429", "http-500", "http-502", "http-503", "http-504", "http-522", "http-524"}


def _timing(values: list[Any]) -> dict[str, int] | None:
    """Total, average, median and slowest fetch time in milliseconds."""
    ms = sorted(int(v) for v in values if isinstance(v, (int, float)))
    if not ms:
        return None
    return {"total": sum(ms), "avg": round(sum(ms) / len(ms)), "median": ms[len(ms) // 2], "max": ms[-1]}


def utcnow() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class Recorder:
    def __init__(self, workspace_id: str, host: str, max_pages: int, previous: list[dict[str, Any]], existing_blobs: set[str], staging: Path):
        self.workspace_id = workspace_id
        self.host = host
        self.max_pages = max_pages
        self.previous = {e["url"]: e for e in previous if e.get("url")}
        self.existing_blobs = existing_blobs
        self.staging = staging
        self.entries: dict[str, dict[str, Any]] = {}
        self.reserved: set[str] = set()
        self.parents: dict[str, str] = {}          # url -> the page it was first found on (for the link map)
        self.skipped: Counter[str] = Counter()
        self.skipped_examples: dict[str, list[str]] = defaultdict(list)
        self._skipped_seen: set[str] = set()
        self.new_blobs: dict[str, Path] = {}
        self.started = time.time()
        self.limit_reached = False
        self.bytes_downloaded = 0

    # ---------- deciding what to fetch ----------
    def reserve(self, url: str, parent: str | None = None) -> bool:
        """True if this URL should be fetched now (first time seen and under the page limit)."""
        if parent and url not in self.parents and url != parent:
            self.parents[url] = parent
        if url in self.reserved:
            return False
        if len(self.reserved) >= self.max_pages:
            self.limit_reached = True
            self.skip(url, "page-limit")
            return False
        self.reserved.add(url)
        return True

    def release(self, url: str) -> None:
        """Let a URL be fetched again (retry round)."""
        self.reserved.discard(url)

    def skip(self, url: str, reason: str) -> None:
        if url in self._skipped_seen or url in self.reserved:
            return
        self._skipped_seen.add(url)
        self.skipped[reason] += 1
        if len(self.skipped_examples[reason]) < 5:
            self.skipped_examples[reason].append(url)

    # ---------- results ----------
    def conditional_headers(self, url: str) -> dict[str, str]:
        prev = self.previous.get(url)
        if not prev or prev.get("status") not in ("ok", "unchanged", "carried"):
            return {}
        headers = {}
        if prev.get("etag"):
            headers["If-None-Match"] = prev["etag"]
        if prev.get("lastModified"):
            headers["If-Modified-Since"] = prev["lastModified"]
        return headers

    def _stage(self, key: str, data: bytes) -> None:
        if key in self.existing_blobs or key in self.new_blobs:
            return
        path = self.staging / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        self.new_blobs[key] = path

    def page(self, url: str, *, final_url: str, http_status: int, content_type: str, body: bytes, markdown: str,
             title: str | None, description: str | None, etag: str | None, last_modified: str | None, depth: int, attempts: int) -> None:
        sha = hashlib.sha256(body).hexdigest()
        raw_key = layout.raw_blob(self.workspace_id, self.host, sha, "html.gz")
        text_key = layout.text_blob(self.workspace_id, self.host, sha)
        self._stage(raw_key, gzip.compress(body))
        self._stage(text_key, markdown.encode())
        self.bytes_downloaded += len(body)
        self.entries[url] = {
            "url": url, "finalUrl": final_url, "status": "ok", "kind": "page", "httpStatus": http_status,
            "contentType": content_type, "sha256": sha, "rawKey": raw_key, "textKey": text_key,
            "title": title, "description": description, "chars": len(markdown),
            "etag": etag, "lastModified": last_modified, "fetchedAt": utcnow(), "depth": depth, "attempts": attempts,
        }

    def file(self, url: str, *, final_url: str, http_status: int, content_type: str, body: bytes, ext: str,
             etag: str | None, last_modified: str | None, depth: int, attempts: int) -> None:
        sha = hashlib.sha256(body).hexdigest()
        raw_key = layout.raw_blob(self.workspace_id, self.host, sha, ext or "bin")
        self._stage(raw_key, body)
        self.bytes_downloaded += len(body)
        self.entries[url] = {
            "url": url, "finalUrl": final_url, "status": "ok", "kind": "file", "httpStatus": http_status,
            "contentType": content_type, "sha256": sha, "rawKey": raw_key, "textKey": None, "bytes": len(body),
            "etag": etag, "lastModified": last_modified, "fetchedAt": utcnow(), "depth": depth, "attempts": attempts,
        }

    def unchanged(self, url: str, depth: int, attempts: int) -> dict[str, Any]:
        """304 Not Modified: keep the previous blob, just record that we checked."""
        entry = {**self.previous[url], "status": "unchanged", "checkedAt": utcnow(), "depth": depth, "attempts": attempts}
        self.entries[url] = entry
        return entry

    def failed(self, url: str, reason: str, *, http_status: int | None, depth: int, attempts: int, message: str = "") -> None:
        prev = self.previous.get(url)
        self.entries[url] = {
            "url": url, "status": "failed", "reason": reason, "httpStatus": http_status, "error": message[:300],
            "depth": depth, "attempts": attempts, "fetchedAt": utcnow(),
            # keep pointing at the last good copy so analysis can still use it
            **({"previousRawKey": prev.get("rawKey"), "previousTextKey": prev.get("textKey")} if prev and prev.get("rawKey") else {}),
        }

    def not_kept(self, url: str, reason: str, *, http_status: int | None, depth: int, content_type: str = "") -> None:
        """Fetched or refused on purpose (robots.txt, a type we don't keep). Not a failure."""
        self.entries[url] = {"url": url, "status": "skipped", "reason": reason, "httpStatus": http_status,
                             "contentType": content_type, "depth": depth, "fetchedAt": utcnow()}
        self.skipped[reason] += 1

    def annotate(self, url: str, **fields: Any) -> None:
        """Adds details to a recorded URL: timings (fetchMs, processMs) and links found on the page."""
        if url in self.entries:
            self.entries[url].update({k: v for k, v in fields.items() if v is not None})

    def transient_failures(self) -> list[tuple[str, int]]:
        return [(u, e.get("depth", 0)) for u, e in self.entries.items() if e["status"] == "failed" and e.get("reason") in TRANSIENT]

    # ---------- manifest and report ----------
    def manifest(self, carry_over: bool) -> list[dict[str, Any]]:
        """This crawl's entries, plus (for a partial re-crawl) the previous entries outside the scope."""
        rows = {u: ({**e, "parent": self.parents[u]} if u in self.parents and "parent" not in e else e) for u, e in self.entries.items()}
        if carry_over:
            for url, prev in self.previous.items():
                if url not in rows and prev.get("status") in ("ok", "unchanged", "carried"):
                    rows[url] = {**prev, "status": "carried"}
        return sorted(rows.values(), key=lambda e: e["url"])

    def report(self, crawl_id: str, config: dict[str, Any], carry_over: bool, retry_rounds: int) -> dict[str, Any]:
        by_status = Counter(e["status"] for e in self.entries.values())
        by_kind = Counter(e.get("kind", "page") for e in self.entries.values() if e["status"] in ("ok", "unchanged"))
        failures = [e for e in self.entries.values() if e["status"] == "failed"]
        good = by_status["ok"] + by_status["unchanged"]
        attempted = good + by_status["failed"]
        return {
            "crawlId": crawl_id,
            "host": self.host,
            "startUrl": config.get("start_url"),
            "mode": "partial" if carry_over else "full",
            "scope": config.get("scope") or [],
            "urls": len(config.get("urls") or []),
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.started)),
            "finishedAt": utcnow(),
            "durationSeconds": round(time.time() - self.started),
            "attempted": attempted,
            "ok": by_status["ok"],
            "unchanged": by_status["unchanged"],
            "failed": by_status["failed"],
            "pages": by_kind["page"],
            "files": by_kind["file"],
            "carried": sum(1 for e in self.manifest(carry_over) if e["status"] == "carried"),
            "successRate": round(good / attempted, 3) if attempted else 0.0,
            "pageLimit": self.max_pages,
            "pageLimitReached": self.limit_reached,
            "bytesDownloaded": self.bytes_downloaded,
            "fetchMs": _timing([e.get("fetchMs") for e in self.entries.values()]),
            "newBlobs": len(self.new_blobs),
            "retryPolicy": {
                "immediateRetries": config.get("retries"),
                "retryOn": sorted(TRANSIENT),
                "retryRounds": retry_rounds,
                "retryRoundWaitSeconds": config.get("retry_round_wait_seconds"),
                "notRetried": "401, 403, 404 and other 4xx; robots.txt refusals",
            },
            "failuresByReason": dict(Counter(e["reason"] for e in failures).most_common()),
            "failures": [{k: e.get(k) for k in ("url", "reason", "httpStatus", "attempts", "error")} for e in failures[:200]],
            "skippedByReason": dict(self.skipped.most_common()),
            "skippedExamples": dict(self.skipped_examples),
        }


def summary_for_app(report: dict[str, Any], s3_prefix: str) -> dict[str, Any]:
    """Small version of the report stored on the job record (DynamoDB items are limited to 400 KB)."""
    return {
        **{k: report[k] for k in ("crawlId", "host", "mode", "durationSeconds", "attempted", "ok", "unchanged", "failed",
                                  "pages", "files", "carried", "successRate", "pageLimit", "pageLimitReached",
                                  "failuresByReason", "skippedByReason")},
        "failures": report["failures"][:25],
        "location": s3_prefix,
    }


def describe(report: dict[str, Any]) -> str:
    """One line for the job step."""
    parts = [f"{report['pages']} pages", f"{report['files']} files"]
    if report["unchanged"]:
        parts.append(f"{report['unchanged']} unchanged")
    if report.get("carried"):
        parts.append(f"{report['carried']} carried over")
    line = " · ".join(parts)
    if report["failed"]:
        line += f" · {report['failed']} failed ({int(report['successRate'] * 100)}% success)"
    if report["pageLimitReached"]:
        line += f" · stopped at the {report['pageLimit']}-page limit"
    return line
