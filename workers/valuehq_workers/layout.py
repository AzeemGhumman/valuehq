"""Where everything lives in the data bucket. Change paths here only.

workspaces/{workspaceId}/website/{host}/
  blobs/raw/{sha256}.{ext}[.gz]   original bytes of each page or file, stored once (content-addressed)
  blobs/text/{sha256}.md          clean markdown extracted from an HTML page
  crawls/{crawlId}/config.json    what was asked for: rules, limits, traversal, scope
  crawls/{crawlId}/manifest.jsonl one line per URL: status, blob, ETag, fetched time
  crawls/{crawlId}/report.json    how it went: counts, failures and reasons, timing
  latest.json                     {"crawlId": ...} of the newest usable crawl
workspaces/{workspaceId}/analyses/{analysis}/{promptVersion}/{runId}.json
"""
from __future__ import annotations

import re
import time
from urllib.parse import urlsplit


def crawl_id(now: float | None = None) -> str:
    """Sortable and readable: 2026-11-12T06-30-05Z."""
    return time.strftime("%Y-%m-%dT%H-%M-%SZ", time.gmtime(now if now is not None else time.time()))


def host_of(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _safe(part: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", part)


def website_root(workspace_id: str, host: str) -> str:
    return f"workspaces/{_safe(workspace_id)}/website/{_safe(host)}"


def raw_blob(workspace_id: str, host: str, sha: str, ext: str) -> str:
    return f"{website_root(workspace_id, host)}/blobs/raw/{sha}.{ext}"


def text_blob(workspace_id: str, host: str, sha: str) -> str:
    return f"{website_root(workspace_id, host)}/blobs/text/{sha}.md"


def crawl_dir(workspace_id: str, host: str, cid: str) -> str:
    return f"{website_root(workspace_id, host)}/crawls/{cid}"


def latest_pointer(workspace_id: str, host: str) -> str:
    return f"{website_root(workspace_id, host)}/latest.json"


def analysis(workspace_id: str, name: str, prompt_version: str, run_id: str) -> str:
    return f"workspaces/{_safe(workspace_id)}/analyses/{_safe(name)}/{_safe(prompt_version)}/{_safe(run_id)}.json"
