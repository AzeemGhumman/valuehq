"""Estimated cost per org: this month's Fargate and Anthropic spend, split by each org's share of
crawl time and Claude tokens (from its job records). An estimate: shared costs (the app's servers,
storage, CloudFront) aren't split."""
from __future__ import annotations

from typing import Any

FARGATE_SERVICE = "Amazon Elastic Container Service"


def usage_from_jobs(jobs: list[dict[str, Any]], month: str) -> dict[str, float]:
    """Sums one org's usage from its job records for a month ('YYYY-MM')."""
    out = {"crawls": 0, "crawlSeconds": 0.0, "pages": 0, "inputTokens": 0, "outputTokens": 0}
    for j in jobs:
        if not str(j.get("createdAt", "")).startswith(month) or j.get("jobType") != "ingest-website":
            continue
        out["crawls"] += 1
        report = j.get("report") or {}
        out["crawlSeconds"] += float(report.get("durationSeconds") or 0)
        out["pages"] += int(report.get("pages") or 0)
        analysis = j.get("analysis") or {}
        out["inputTokens"] += int(analysis.get("inputTokens") or 0)
        out["outputTokens"] += int(analysis.get("outputTokens") or 0)
    return out


def allocate(orgs: list[dict[str, Any]], fargate_total: float, anthropic_total: float | None) -> list[dict[str, Any]]:
    """orgs: [{id, name, usage}] -> same with estimated fargate and anthropic dollars, largest first."""
    seconds = sum(o["usage"]["crawlSeconds"] for o in orgs)
    tokens = sum(o["usage"]["inputTokens"] + o["usage"]["outputTokens"] for o in orgs)
    out = []
    for o in orgs:
        u = o["usage"]
        f = fargate_total * u["crawlSeconds"] / seconds if seconds else 0.0
        a = (anthropic_total or 0) * (u["inputTokens"] + u["outputTokens"]) / tokens if tokens else 0.0
        out.append({**o, "fargate": round(f, 2), "anthropic": round(a, 2), "total": round(f + a, 2)})
    return sorted(out, key=lambda o: (-o["total"], o["name"]))
