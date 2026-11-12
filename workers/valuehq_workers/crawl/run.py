"""Runs one crawl end to end: read the previous crawl, crawl, store blobs, write manifest and report,
update the job record. Called by `python -m valuehq_workers crawl` (see __main__.py)."""
from __future__ import annotations

import gzip
import json
import mimetypes
import shutil
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from .. import layout, log
from ..jobs import JobProgress, load_job
from ..settings import Settings
from ..storage import Storage, open_storage
from .config import CrawlConfig
from .recorder import Recorder, describe, summary_for_app
from .rules import Rules

logger = log.get("crawl")

# A crawl below this success rate is flagged "Needs your help" on the job.
HEALTHY_SUCCESS_RATE = 0.9


def scrapy_settings(cfg: CrawlConfig, retry_round: bool = False) -> dict[str, Any]:
    bfs = cfg.strategy == "bfs"
    concurrency = 1 if retry_round else cfg.concurrency
    s: dict[str, Any] = {
        "BOT_NAME": "valuehq",
        "USER_AGENT": "Mozilla/5.0 (compatible; ValueHQ research crawler)",
        "ROBOTSTXT_OBEY": cfg.respect_robots,
        "CONCURRENT_REQUESTS": concurrency * 2,
        "CONCURRENT_REQUESTS_PER_DOMAIN": concurrency,
        "DOWNLOAD_DELAY": cfg.delay_seconds * (4 if retry_round else 1),
        "RANDOMIZE_DOWNLOAD_DELAY": True,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": max(cfg.delay_seconds, 0.5),
        "AUTOTHROTTLE_MAX_DELAY": 30,
        "AUTOTHROTTLE_TARGET_CONCURRENCY": max(1.0, concurrency / 2),
        "DOWNLOAD_TIMEOUT": cfg.timeout_seconds * (2 if retry_round else 1),
        "RETRY_ENABLED": True,
        "RETRY_TIMES": cfg.retries,
        "RETRY_HTTP_CODES": [408, 429, 500, 502, 503, 504, 522, 524],
        "DOWNLOAD_MAXSIZE": cfg.max_file_mb * 1024 * 1024,
        "DOWNLOAD_WARNSIZE": 0,
        "DEPTH_LIMIT": 0,  # depth is enforced by the spider so it can be reported
        "DEPTH_PRIORITY": 1 if bfs else 0,
        "SCHEDULER_MEMORY_QUEUE": "scrapy.squeues.FifoMemoryQueue" if bfs else "scrapy.squeues.LifoMemoryQueue",
        "SCHEDULER_DISK_QUEUE": "scrapy.squeues.PickleFifoDiskQueue" if bfs else "scrapy.squeues.PickleLifoDiskQueue",
        "CLOSESPIDER_TIMEOUT": 6 * 3600,
        "TELNETCONSOLE_ENABLED": False,
        "LOG_LEVEL": "WARNING",
        "REQUEST_FINGERPRINTER_IMPLEMENTATION": "2.7",
        "TWISTED_REACTOR": "twisted.internet.asyncioreactor.AsyncioSelectorReactor",
    }
    if cfg.render_js:
        s.update({
            "DOWNLOAD_HANDLERS": {
                "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
                "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
            },
            "PLAYWRIGHT_BROWSER_TYPE": "chromium",
            "PLAYWRIGHT_LAUNCH_OPTIONS": {"headless": True},
            "PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT": cfg.timeout_seconds * 1000,
        })
    return s


def _crawl(cfg: CrawlConfig, rules: Rules, recorder: Recorder, storage: Storage, progress: JobProgress, step: int) -> int:
    """Runs Scrapy (and one retry round for transient failures). Returns the number of rounds."""
    from scrapy.utils.reactor import install_reactor

    install_reactor("twisted.internet.asyncioreactor.AsyncioSelectorReactor")
    from scrapy.crawler import CrawlerRunner
    from twisted.internet import defer, reactor, task

    from .spider import SiteSpider

    state: dict[str, Any] = {"rounds": 0, "error": None}

    def on_progress() -> None:
        r = recorder
        fetched = sum(1 for e in r.entries.values() if e["status"] in ("ok", "unchanged"))
        failed = sum(1 for e in r.entries.values() if e["status"] == "failed")
        progress.step(step, detail=f"{fetched} fetched · {failed} failed · {len(r.reserved)} of max {cfg.max_pages} found", throttle=5)

    common = dict(cfg=cfg, rules=rules, recorder=recorder, storage=storage, on_progress=on_progress)

    @defer.inlineCallbacks
    def run():  # type: ignore[no-untyped-def]
        seeds = [(u, 0) for u in rules.seeds() if recorder.reserve(u)]
        state["rounds"] = 1
        yield CrawlerRunner(scrapy_settings(cfg)).crawl(SiteSpider, seeds=seeds, use_sitemap=cfg.use_sitemap and not cfg.partial, **common)
        retry = recorder.transient_failures()
        if retry:
            log.info(logger, "retry round", urls=len(retry), wait=cfg.retry_round_wait_seconds)
            progress.step(step, detail=f"Retrying {len(retry)} pages in {cfg.retry_round_wait_seconds}s")
            yield task.deferLater(reactor, cfg.retry_round_wait_seconds, lambda: None)
            for url, _ in retry:
                recorder.release(url)
            seeds = [(u, d) for u, d in retry if recorder.reserve(u)]
            state["rounds"] = 2
            yield CrawlerRunner(scrapy_settings(cfg, retry_round=True)).crawl(SiteSpider, seeds=seeds, use_sitemap=False, **common)

    def done(result: Any) -> None:
        if hasattr(result, "value"):
            state["error"] = result.value
        reactor.stop()  # type: ignore[attr-defined]

    run().addBoth(done)
    reactor.run()  # type: ignore[attr-defined]
    if state["error"]:
        raise state["error"]
    return state["rounds"]


CORPUS_CHARS_PER_PAGE = 30_000  # keeps the search file small enough to load in one request


def build_corpus(storage: Storage, recorder: Recorder, manifest: list[dict[str, Any]], previous_corpus: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Text of every page in the crawl, in one file, for searching. Reuses the previous crawl's corpus
    for pages that didn't change, so nothing is read twice."""
    prev = {r["textKey"]: r["text"] for r in previous_corpus if r.get("textKey")}
    rows: list[dict[str, Any]] = []
    missing: list[tuple[int, str]] = []
    for e in manifest:
        if e.get("kind", "page") != "page":
            continue
        key = e.get("textKey") if e.get("status") in ("ok", "unchanged", "carried") else e.get("previousTextKey")
        if not key:
            continue
        if key in recorder.new_blobs:
            text: str | None = recorder.new_blobs[key].read_text(encoding="utf-8", errors="replace")
        else:
            text = prev.get(key)
        rows.append({"url": e["url"], "title": e.get("title"), "textKey": key, "text": (text or "")[:CORPUS_CHARS_PER_PAGE]})
        if text is None:
            missing.append((len(rows) - 1, key))
    if missing:
        with ThreadPoolExecutor(max_workers=16) as pool:
            for (i, _), text in zip(missing, pool.map(lambda m: storage.get_text(m[1]) or "", missing)):
                rows[i]["text"] = text[:CORPUS_CHARS_PER_PAGE]
    return rows


def _upload(storage: Storage, blobs: dict[str, Path]) -> None:
    def put(item: tuple[str, Path]) -> None:
        key, path = item
        ctype = "text/markdown" if key.endswith(".md") else "application/gzip" if key.endswith(".gz") else (mimetypes.guess_type(key)[0] or "application/octet-stream")
        storage.put(key, path.read_bytes(), ctype)

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(put, blobs.items()))


def _read_corpus(storage: Storage, folder: str) -> list[dict[str, Any]]:
    text = storage.get_text(f"{folder}/corpus.jsonl.gz")
    return [json.loads(line) for line in text.splitlines() if line.strip()] if text else []


def run_crawl(job: dict[str, Any], settings: Settings | None = None) -> dict[str, Any]:
    """job: {workspaceId, jobId?, crawl: {...CrawlConfig}, stepIndex?, lastStep?}"""
    settings = settings or Settings.load()
    storage = open_storage(settings)
    workspace_id: str = job["workspaceId"]
    step = int(job.get("stepIndex", 0))
    last_step = bool(job.get("lastStep", True))
    if job.get("crawlOnJob") and job.get("jobId"):
        # Long page lists don't fit in a container's environment, so the app keeps the settings on the job record.
        record = load_job(settings, workspace_id, job["jobId"]) or {}
        job = {**job, "crawl": record.get("crawl") or job["crawl"]}
    cfg = CrawlConfig.from_dict(job["crawl"])
    rules = Rules(cfg)
    host = rules.host
    progress = JobProgress(settings, workspace_id, job.get("jobId"))
    progress.patch(status="running")
    progress.step(step, "running", "Starting the crawler")

    pointer = storage.get_json(layout.latest_pointer(workspace_id, host)) or {}
    previous_id = pointer.get("crawlId") if isinstance(pointer, dict) else None
    previous = storage.get_jsonl(f"{layout.crawl_dir(workspace_id, host, previous_id)}/manifest.jsonl") if previous_id else []
    root = layout.website_root(workspace_id, host)
    existing = set(storage.keys(f"{root}/blobs/"))
    staging = Path(tempfile.mkdtemp(prefix="crawl-"))
    recorder = Recorder(workspace_id, host, cfg.max_pages, previous, existing, staging)
    cid = layout.crawl_id()
    carry_over = cfg.partial and bool(previous)
    log.info(logger, "crawl start", host=host, crawlId=cid, previous=previous_id, previousUrls=len(previous), mode="partial" if cfg.partial else "full")

    started = time.time()
    try:
        rounds = _crawl(cfg, rules, recorder, storage, progress, step)
        _upload(storage, recorder.new_blobs)
        report = recorder.report(cid, cfg.to_dict(), carry_over, rounds)
        folder = layout.crawl_dir(workspace_id, host, cid)
        manifest = recorder.manifest(carry_over)
        storage.put_json(f"{folder}/config.json", {**cfg.to_dict(), "workspaceId": workspace_id, "jobId": job.get("jobId"), "previousCrawlId": previous_id})
        storage.put_jsonl(f"{folder}/manifest.jsonl", manifest)
        previous_corpus = _read_corpus(storage, layout.crawl_dir(workspace_id, host, previous_id)) if previous_id else []
        corpus = build_corpus(storage, recorder, manifest, previous_corpus)
        storage.put(f"{folder}/corpus.jsonl.gz", gzip.compress("".join(json.dumps(r) + "\n" for r in corpus).encode()), "application/gzip")
        storage.put_json(f"{folder}/report.json", report)
        good = report["ok"] + report["unchanged"]
        if good > 0:
            storage.put_json(layout.latest_pointer(workspace_id, host), {"crawlId": cid, "at": report["finishedAt"], "startUrl": cfg.start_url})
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    healthy = good > 0 and report["successRate"] >= HEALTHY_SUCCESS_RATE
    location = f"s3://{settings.data_bucket}/{folder}/" if settings.data_bucket else str(Path(settings.data_dir or ".") / folder)
    progress.patch(report=summary_for_app(report, location))
    detail = describe(report) if good else f"Couldn't fetch any page ({next(iter(report['failuresByReason']), 'no pages found')}). Check the address and the include rules."
    progress.step(step, "done" if healthy else "needs-help", detail, count_done=True)
    if last_step:
        progress.finish("done" if healthy else "needs-help")
    log.info(logger, "crawl done", host=host, crawlId=cid, seconds=round(time.time() - started), **{k: report[k] for k in ("ok", "unchanged", "failed", "successRate", "newBlobs")})
    return {"crawlId": cid, "host": host, "pagesAvailable": good}
