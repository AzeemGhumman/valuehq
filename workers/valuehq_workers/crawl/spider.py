"""The Scrapy spider. Scrapy does scheduling, robots.txt, retries, throttling and redirects; this
class decides what to keep and what to follow, and hands results to the Recorder."""
from __future__ import annotations

import re
import time
from typing import Any, Callable, Iterator

import scrapy
from scrapy.exceptions import IgnoreRequest
from scrapy.http import HtmlResponse, Response, TextResponse
from scrapy.linkextractors import LinkExtractor
from scrapy.spidermiddlewares.httperror import HttpError
from twisted.internet.error import (
    ConnectError, ConnectionLost, ConnectionRefusedError, DNSLookupError, TCPTimedOutError, TimeoutError as TxTimeoutError,
)

from ..storage import Storage
from .config import CrawlConfig
from .extract import decode, title_and_description, to_markdown
from .recorder import Recorder
from .rules import FILE_EXTENSIONS, SKIP_EXTENSIONS, Rules, extension, normalize

HTML_TYPES = {"text/html", "application/xhtml+xml"}
FILE_TYPES = {
    "application/pdf": "pdf", "application/msword": "doc", "text/csv": "csv", "text/plain": "txt", "text/markdown": "md",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt", "application/vnd.ms-excel": "xls", "application/rtf": "rtf",
}
_LOC = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)


class SiteSpider(scrapy.Spider):
    name = "site"
    handle_httpstatus_list = [304]  # Not Modified reaches parse(); other errors go to on_error after retries

    # Set through CrawlerRunner.crawl(SiteSpider, cfg=..., ...)
    cfg: CrawlConfig
    rules: Rules
    recorder: Recorder
    storage: Storage
    seeds: list[tuple[str, int]]
    use_sitemap: bool
    on_progress: Callable[[], None]

    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self.allowed_domains = [self.rules.host]
        self.links = LinkExtractor(deny_extensions=sorted(SKIP_EXTENSIONS), unique=True, tags=("a", "area"), attrs=("href",))

    # ---------- requests ----------
    def request(self, url: str, depth: int) -> scrapy.Request:
        headers = {} if self.cfg.render_js else self.recorder.conditional_headers(url)
        meta: dict[str, Any] = {"depth": depth, "vhq_url": url}
        if self.cfg.render_js and extension(url) not in FILE_EXTENSIONS:
            meta["playwright"] = True
        return scrapy.Request(url, callback=self.parse, errback=self.on_error, headers=headers, meta=meta)

    def start_requests(self) -> Iterator[scrapy.Request]:
        for url, depth in self.seeds:
            yield self.request(url, depth)
        if self.use_sitemap:
            base = self.cfg.start_url.split("/", 3)
            root = f"{base[0]}//{base[2]}"
            for path in ("/sitemap.xml", "/sitemap_index.xml"):
                yield scrapy.Request(root + path, callback=self.parse_sitemap, errback=lambda f: None, meta={"vhq_sitemaps": 0}, dont_filter=True)

    def parse_sitemap(self, response: Response) -> Iterator[scrapy.Request]:
        """Adds pages listed in the sitemap (and up to 20 nested sitemaps). Counts toward the page limit."""
        body = response.text if isinstance(response, TextResponse) else decode(response.body, None)
        nested = response.meta.get("vhq_sitemaps", 0)
        for loc in _LOC.findall(body):
            if loc.lower().endswith((".xml", ".xml.gz")) and "<sitemapindex" in body[:2000].lower():
                if nested < 20:
                    nested += 1
                    yield scrapy.Request(loc, callback=self.parse_sitemap, errback=lambda f: None, meta={"vhq_sitemaps": 20})
                continue
            url = normalize(loc)
            ok, reason = self.rules.check(url)
            if not ok:
                self.recorder.skip(url, reason)
            elif self.recorder.reserve(url):
                yield self.request(url, 1)

    # ---------- results ----------
    def parse(self, response: Response) -> Iterator[scrapy.Request]:
        url = response.meta.get("vhq_url") or normalize(response.request.url)
        depth = response.meta.get("depth", 0)
        attempts = response.meta.get("retry_times", 0) + 1
        started = time.monotonic()
        latency = response.meta.get("download_latency")
        try:
            if response.status == 304 and url in self.recorder.previous:
                entry = self.recorder.unchanged(url, depth, attempts)
                if entry.get("kind") == "page" and entry.get("rawKey"):
                    html = self.storage.get_text(entry["rawKey"])
                    if html:
                        old = HtmlResponse(url=entry.get("finalUrl") or url, body=html.encode("utf-8"), encoding="utf-8")
                        yield from self.follow(old, depth, url)
                return

            ctype = response.headers.get("Content-Type", b"").decode("latin-1").split(";")[0].strip().lower()
            ext = extension(response.url) or extension(url)
            etag = response.headers.get("ETag", b"").decode("latin-1") or None
            last_modified = response.headers.get("Last-Modified", b"").decode("latin-1") or None
            common = dict(final_url=response.url, http_status=response.status, content_type=ctype, etag=etag,
                          last_modified=last_modified, depth=depth, attempts=attempts)

            if ctype in HTML_TYPES or (not ctype and ext in ("", "html", "htm")):
                html = response.text if isinstance(response, TextResponse) else decode(response.body, None)
                title, description = title_and_description(html)
                self.recorder.page(url, body=response.body, markdown=to_markdown(html, response.url), title=title, description=description, **common)
                if isinstance(response, TextResponse):
                    yield from self.follow(response, depth, url)
            elif self.cfg.download_files and (ext in FILE_EXTENSIONS or ctype in FILE_TYPES):
                self.recorder.file(url, body=response.body, ext=ext if ext in FILE_EXTENSIONS else FILE_TYPES.get(ctype, "bin"), **common)
            else:
                self.recorder.not_kept(url, "unsupported-type", http_status=response.status, depth=depth, content_type=ctype)
        finally:
            self.recorder.annotate(url, fetchMs=round(latency * 1000) if isinstance(latency, (int, float)) else None,
                                   processMs=round((time.monotonic() - started) * 1000))
            self.on_progress()

    def follow(self, response: Response, depth: int, page_url: str) -> Iterator[scrapy.Request]:
        """Records the page's links on this site (for the link map) and queues the ones the rules allow."""
        found: list[str] = []
        for link in self.links.extract_links(response):
            url = normalize(link.url)
            if self.rules.same_site(url) and url != page_url and url not in found:
                found.append(url)
            if not self.cfg.follow_links:
                continue
            ok, reason = self.rules.check(url)
            if not ok:
                self.recorder.skip(url, reason)
            elif depth + 1 > self.cfg.max_depth:
                self.recorder.skip(url, "too-deep")
            elif self.recorder.reserve(url, parent=page_url):
                yield self.request(url, depth + 1)
        self.recorder.annotate(page_url, links=found[:300], linkCount=len(found))

    def on_error(self, failure: Any) -> None:
        request = failure.request
        url = request.meta.get("vhq_url") or normalize(request.url)
        depth = request.meta.get("depth", 0)
        attempts = request.meta.get("retry_times", 0) + 1
        status: int | None = None
        message = str(failure.value)
        if failure.check(HttpError):
            status = failure.value.response.status
            reason = f"http-{status}"
        elif failure.check(DNSLookupError):
            reason = "dns"
        elif failure.check(TxTimeoutError, TCPTimedOutError):
            reason = "timeout"
        elif failure.check(ConnectionRefusedError, ConnectionLost, ConnectError):
            reason = "connection"
        elif failure.check(IgnoreRequest):
            lowered = message.lower()
            reason = "robots" if "robots" in lowered else "offsite" if "offsite" in lowered else "ignored"
            self.recorder.not_kept(url, reason, http_status=None, depth=depth)
            self.on_progress()
            return
        else:
            name = failure.type.__name__ if failure.type else "error"
            reason = "too-large" if "maxsize" in message.lower() or "max size" in message.lower() else name
            if name in ("ResponseNeverReceived", "ResponseFailed", "TunnelError"):
                reason = "connection"
        self.recorder.failed(url, reason, http_status=status, depth=depth, attempts=attempts, message=message)
        self.on_progress()
