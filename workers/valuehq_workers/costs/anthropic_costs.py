"""Anthropic costs from the Admin API cost report (GET /v1/organizations/cost_report), in USD.

Needs an Admin API key (sk-ant-admin...), stored in Secrets Manager as valuehq/anthropic-admin.
With ANTHROPIC_WORKSPACE_ID set, only that Anthropic workspace counts, so other projects in the same
Anthropic organization are left out."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from typing import Any, Callable

API = "https://api.anthropic.com/v1/organizations/cost_report"


def _get(url: str, key: str) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"x-api-key": key, "anthropic-version": "2023-06-01", "user-agent": "valuehq-costs"})
    with urllib.request.urlopen(req, timeout=60) as res:  # noqa: S310 - fixed https URL
        return json.loads(res.read())


def fetch_buckets(key: str, start: date, end: date, get: Callable[[str, str], dict[str, Any]] = _get) -> list[dict[str, Any]]:
    """Daily buckets from start (inclusive) to end (exclusive), grouped by workspace and line item."""
    params: list[tuple[str, str]] = [
        ("starting_at", f"{start.isoformat()}T00:00:00Z"), ("ending_at", f"{end.isoformat()}T00:00:00Z"),
        ("bucket_width", "1d"), ("limit", "31"), ("group_by[]", "workspace_id"), ("group_by[]", "description"),
    ]
    buckets: list[dict[str, Any]] = []
    page: str | None = None
    while True:
        query = params + ([("page", page)] if page else [])
        res = get(f"{API}?{urllib.parse.urlencode(query)}", key)
        buckets.extend(res.get("data", []))
        page = res.get("next_page") if res.get("has_more") else None
        if not page:
            return buckets


def summarize(buckets: list[dict[str, Any]], workspace_id: str | None, this_month: str, last_month: str) -> dict[str, Any]:
    """Totals per month, per model and per day, in dollars. `amount` is in cents (a decimal string)."""
    months: dict[str, dict[str, Any]] = {m: {"total": 0.0, "byModel": defaultdict(float)} for m in (this_month, last_month)}
    daily: dict[str, float] = defaultdict(float)
    for b in buckets:
        day = b["starting_at"][:10]
        month = day[:7]
        for r in b.get("results", []):
            if workspace_id and r.get("workspace_id") != workspace_id:
                continue
            dollars = float(r.get("amount") or 0) / 100
            daily[day] += dollars
            if month in months:
                label = r.get("model") or (r.get("cost_type") or "other").replace("_", " ")
                months[month]["total"] += dollars
                months[month]["byModel"][label] += dollars
    return {
        "currency": "USD",
        "workspace": workspace_id or "whole organization",
        "months": [
            {"month": m, "total": round(v["total"], 2), "byModel": {k: round(x, 2) for k, x in sorted(v["byModel"].items(), key=lambda kv: -kv[1])}}
            for m, v in months.items()
        ],
        "daily": [{"date": d, "amount": round(a, 4)} for d, a in sorted(daily.items())],
    }
