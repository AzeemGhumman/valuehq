"""Choosing which crawled pages to send to the model, within a character budget. Pure functions."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

# (pattern on the path, score). First match wins; the home page gets HOME_SCORE.
SCORES: list[tuple[re.Pattern[str], int]] = [
    (re.compile(r"pric|plans?\b|/plans|/buy|/quote", re.I), 90),
    (re.compile(r"product|platform|features?|solutions?|how-it-works|overview|capabilit", re.I), 60),
    (re.compile(r"about|company|who-we-are|mission|team|leadership", re.I), 50),
    (re.compile(r"customers?|case-stud|stories|industr|use-cases?|why-", re.I), 40),
    (re.compile(r"integrations?|security|trust|partners?|compare|vs-", re.I), 20),
    (re.compile(r"blog|news|press|events?|webinars?|careers?|jobs|legal|privacy|terms|cookie|gdpr|status", re.I), -40),
]
HOME_SCORE = 100
PRICING_SCORE = 90


@dataclass
class Page:
    url: str
    title: str | None
    text_key: str
    chars: int
    score: int


def score(url: str) -> int:
    path = urlsplit(url).path or "/"
    if path in ("/", ""):
        return HOME_SCORE
    depth = len([p for p in path.split("/") if p])
    for pattern, points in SCORES:
        if pattern.search(path):
            return points - 5 * (depth - 1)
    return 10 - 5 * (depth - 1)


def candidates(manifest: list[dict[str, Any]]) -> list[Page]:
    """Pages with text, including the last good copy of pages that failed this time."""
    pages = []
    for e in manifest:
        if e.get("kind", "page") != "page":
            continue
        key = e.get("textKey") if e.get("status") in ("ok", "unchanged", "carried") else e.get("previousTextKey")
        if not key:
            continue
        pages.append(Page(url=e["url"], title=e.get("title"), text_key=key, chars=int(e.get("chars") or 0), score=score(e["url"])))
    # Same content under two URLs (e.g. / and /index.html): keep the best-scored one.
    best: dict[str, Page] = {}
    for p in sorted(pages, key=lambda p: (-p.score, len(p.url))):
        best.setdefault(p.text_key, p)
    return sorted(best.values(), key=lambda p: (-p.score, len(p.url)))


def pick(pages: list[Page], budget_chars: int, per_page_chars: int, pricing_page_chars: int) -> list[tuple[Page, int]]:
    """Highest-scoring pages first, each clipped, until the budget is used. Returns (page, chars to use)."""
    out: list[tuple[Page, int]] = []
    used = 0
    for p in pages:
        if p.score < 0 and used > budget_chars // 2:
            break
        cap = pricing_page_chars if p.score == PRICING_SCORE else per_page_chars
        left = budget_chars - used
        if left < 300:
            break
        take = min(p.chars or cap, cap, left)
        if take <= 0:
            continue
        out.append((p, take))
        used += take
        if used >= budget_chars:
            break
    return out
