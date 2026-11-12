"""What a crawl should do. Comes from the job input (the app or the CLI) and is saved with the crawl.

Path patterns are globs on the URL path: `*` matches within one segment, `**` matches anything.
  "/blog/**"   everything under /blog/
  "/pricing*"  /pricing, /pricing-enterprise, ...
  "/docs"      exactly /docs and anything under it (a plain path is a prefix)
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any
from urllib.parse import urlsplit

STRATEGIES = ("bfs", "dfs")

# Never worth crawling for company research.
DEFAULT_EXCLUDE = [
    "/cart*", "/checkout*", "/login*", "/signin*", "/sign-in*", "/signup*", "/sign-up*", "/logout*",
    "/account/**", "/my-account/**", "/wp-admin/**", "/wp-login*", "/wp-json/**", "/cdn-cgi/**",
    "/search*", "/feed*", "/**/feed", "/tag/**", "/author/**",
]


@dataclass
class CrawlConfig:
    start_url: str
    include: list[str] = field(default_factory=list)        # empty = everything on the site
    exclude: list[str] = field(default_factory=list)        # added to DEFAULT_EXCLUDE
    scope: list[str] = field(default_factory=list)          # partial re-crawl: only these paths; the rest is carried over
    urls: list[str] = field(default_factory=list)           # re-crawl exactly these pages (the rest is carried over)
    follow_links: bool = True                               # False with `urls`: fetch only those pages, don't follow their links
    max_pages: int = 500
    max_depth: int = 6
    strategy: str = "bfs"                                   # bfs: breadth first (overview pages first) | dfs: depth first
    render_js: bool = False                                 # use a headless browser for sites built with JavaScript
    use_sitemap: bool = True                                # also seed from /sitemap.xml
    include_subdomains: bool = False                        # docs.example.com when starting at example.com
    download_files: bool = True                             # PDFs, Office documents, CSV
    respect_robots: bool = True
    concurrency: int = 4                                    # requests in flight to the site
    delay_seconds: float = 0.25                             # minimum gap between requests (auto-throttle adds more)
    timeout_seconds: int = 30
    retries: int = 3                                        # immediate retries per URL on timeouts, 5xx, 408, 429
    retry_round_wait_seconds: int = 60                      # then one more round for what still failed, after this pause
    max_file_mb: int = 25

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "CrawlConfig":
        known = {k: v for k, v in d.items() if k in CrawlConfig.__dataclass_fields__ and v is not None}
        cfg = CrawlConfig(**known)
        cfg.validate()
        return cfg

    def validate(self) -> None:
        url = self.start_url.strip()
        if "://" not in url:
            url = "https://" + url
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.hostname or "." not in parts.hostname:
            raise ValueError(f"Not a website address: {self.start_url!r}")
        self.start_url = f"{parts.scheme}://{parts.netloc}{parts.path or '/'}" + (f"?{parts.query}" if parts.query else "")
        if self.strategy not in STRATEGIES:
            raise ValueError(f"strategy must be one of {STRATEGIES}")
        self.max_pages = max(1, min(int(self.max_pages), 20_000))
        self.max_depth = max(0, min(int(self.max_depth), 50))
        self.concurrency = max(1, min(int(self.concurrency), 16))
        self.retries = max(0, min(int(self.retries), 10))
        for name in ("include", "exclude", "scope", "urls"):
            setattr(self, name, [p.strip() for p in getattr(self, name) if p and p.strip()])
        # Relative page paths ("/pricing") are taken on the start site.
        origin = f"{parts.scheme}://{parts.netloc}"
        self.urls = [u if "://" in u else origin + (u if u.startswith("/") else "/" + u) for u in self.urls][:5000]

    @property
    def partial(self) -> bool:
        """Only part of the site is fetched; everything else is carried over from the previous crawl."""
        return bool(self.scope or self.urls)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
