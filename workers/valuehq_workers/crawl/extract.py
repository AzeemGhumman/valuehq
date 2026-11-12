"""Turning a fetched page into clean text. trafilatura does the heavy lifting (boilerplate removal)."""
from __future__ import annotations

import html as htmllib
import re

_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_TAGS = re.compile(r"<[^>]+>")
_SCRIPTS = re.compile(r"<(script|style|noscript|svg)[\s\S]*?</\1>", re.I)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(_TAGS.sub(" ", s))).strip()


def _meta(html: str, key: str) -> str | None:
    for pattern in (
        rf"<meta[^>]+(?:name|property)=[\"']{re.escape(key)}[\"'][^>]*content=[\"']([^\"']*)[\"']",
        rf"<meta[^>]+content=[\"']([^\"']*)[\"'][^>]*(?:name|property)=[\"']{re.escape(key)}[\"']",
    ):
        m = re.search(pattern, html, re.I)
        if m and m.group(1).strip():
            return _clean(m.group(1))
    return None


def title_and_description(html: str) -> tuple[str | None, str | None]:
    m = _TITLE.search(html)
    title = _clean(m.group(1))[:300] if m else None
    desc = _meta(html, "description") or _meta(html, "og:description")
    return title or None, (desc[:600] if desc else None)


def to_markdown(html: str, url: str) -> str:
    """Main content as markdown. Falls back to plain text if trafilatura finds nothing."""
    text: str | None = None
    try:
        import trafilatura

        try:
            text = trafilatura.extract(html, url=url, output_format="markdown", include_tables=True, include_links=False, favor_recall=True)
        except (TypeError, ValueError):  # older trafilatura without markdown output
            text = trafilatura.extract(html, url=url, include_tables=True, favor_recall=True)
    except ImportError:
        pass
    if not text:
        text = _clean(_SCRIPTS.sub(" ", html))
    return text.strip()


def decode(body: bytes, encoding: str | None) -> str:
    for enc in (encoding, "utf-8", "latin-1"):
        if not enc:
            continue
        try:
            return body.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return body.decode("utf-8", errors="replace")
