"""Which URLs a crawl takes: same site, include/exclude/scope paths, file types. Pure functions, easy to test."""
from __future__ import annotations

import posixpath
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .config import DEFAULT_EXCLUDE, CrawlConfig

# Files worth keeping for research (parsed later with Docling).
FILE_EXTENSIONS = {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "txt", "rtf", "odt", "md"}
# Never fetched.
SKIP_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tif", "tiff", "avif", "heic",
    "mp4", "mov", "avi", "webm", "mkv", "mp3", "wav", "ogg", "m4a",
    "zip", "gz", "tgz", "rar", "7z", "dmg", "exe", "msi", "pkg", "apk", "iso",
    "css", "js", "mjs", "map", "json", "xml", "rss", "atom", "woff", "woff2", "ttf", "otf", "eot",
}
TRACKING_PARAMS = re.compile(r"^(utm_\w+|gclid|fbclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|hsCtaTracking|ref|ref_src)$", re.I)


def glob_to_regex(pattern: str) -> re.Pattern[str]:
    """'/blog/**' -> anything under /blog/; '/pricing*' -> /pricing...; a plain path also matches what's under it."""
    p = pattern if pattern.startswith("/") else "/" + pattern
    has_wildcard = "*" in p
    out = ""
    i = 0
    while i < len(p):
        if p.startswith("**", i):
            out += ".*"
            i += 2
        elif p[i] == "*":
            out += "[^/]*"
            i += 1
        else:
            out += re.escape(p[i])
            i += 1
    if not has_wildcard:
        out = out.rstrip("/") + "(/.*)?"
    return re.compile("^" + out + "$", re.I)


def literal_prefix(pattern: str) -> str:
    """The part of a scope pattern before any wildcard, used as a starting URL: '/blog/**' -> '/blog/'."""
    p = pattern if pattern.startswith("/") else "/" + pattern
    cut = p.find("*")
    return p if cut == -1 else p[:cut]


def normalize(url: str) -> str:
    """Same page, same string: lowercase host, no fragment, no tracking parameters, no default port."""
    parts = urlsplit(url.strip())
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    port = parts.port
    netloc = host if port is None or (scheme, port) in (("http", 80), ("https", 443)) else f"{host}:{port}"
    path = parts.path or "/"
    path = posixpath.normpath(path) + ("/" if path.endswith("/") and path != "/" else "")
    if path.startswith("//"):
        path = "/" + path.lstrip("/")
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not TRACKING_PARAMS.match(k)])
    return urlunsplit((scheme, netloc, path, query, ""))


def extension(url: str) -> str:
    last = urlsplit(url).path.rsplit("/", 1)[-1]
    return last.rsplit(".", 1)[-1].lower() if "." in last else ""


def site_host(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


class Rules:
    def __init__(self, cfg: CrawlConfig):
        self.cfg = cfg
        self.host = site_host(cfg.start_url)
        self.include = [glob_to_regex(p) for p in cfg.include]
        self.exclude = [glob_to_regex(p) for p in DEFAULT_EXCLUDE + cfg.exclude]
        self.scope = [glob_to_regex(p) for p in cfg.scope]
        self.only = {normalize(u) for u in cfg.urls} if cfg.urls and not cfg.follow_links else None

    def same_site(self, url: str) -> bool:
        host = site_host(url)
        return host == self.host or (self.cfg.include_subdomains and host.endswith("." + self.host))

    def in_scope(self, url: str) -> bool:
        if self.only is not None:
            return url in self.only
        return not self.scope or any(r.match(urlsplit(url).path or "/") for r in self.scope)

    def check(self, url: str) -> tuple[bool, str]:
        """(take it?, reason when not). Reasons appear in the crawl report."""
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https"):
            return False, "not-web"
        if not self.same_site(url):
            return False, "other-site"
        ext = extension(url)
        if ext in SKIP_EXTENSIONS:
            return False, "file-type"
        if ext in FILE_EXTENSIONS and not self.cfg.download_files:
            return False, "file-type"
        path = parts.path or "/"
        if any(r.match(path) for r in self.exclude):
            return False, "excluded"
        if self.include and not any(r.match(path) for r in self.include):
            return False, "not-included"
        if not self.in_scope(url):
            return False, "out-of-scope"
        return True, ""

    def seeds(self) -> list[str]:
        """Where to start: the start URL, or each scope path for a partial re-crawl."""
        base = urlsplit(self.cfg.start_url)
        if self.cfg.urls:
            return list(dict.fromkeys(normalize(u) for u in self.cfg.urls if self.same_site(u)))
        if not self.cfg.scope:
            return [normalize(self.cfg.start_url)]
        return [normalize(f"{base.scheme}://{base.netloc}{literal_prefix(p)}") for p in self.cfg.scope]
