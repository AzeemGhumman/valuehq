"""Command line for the workers. In AWS, Step Functions runs `python -m valuehq_workers <command>` in a
Fargate container with the job in the JOB_INPUT environment variable. On your Mac you pass options instead.

  python -m valuehq_workers crawl   --workspace <id> --url acme.com [--max-pages 200] [--include "/products/**"]
                                    [--exclude "/blog/**"] [--scope "/pricing"] [--strategy bfs|dfs] [--render-js]
  python -m valuehq_workers analyze --workspace <id> --url acme.com
  python -m valuehq_workers ingest  --workspace <id> --url acme.com     (crawl, then analyze)
  python -m valuehq_workers costs                                        (AWS + Anthropic cost snapshot)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from typing import Any

from . import log
from .settings import Settings


def _job_from_args(argv: list[str]) -> tuple[str, dict[str, Any]]:
    p = argparse.ArgumentParser(prog="python -m valuehq_workers", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["crawl", "analyze", "ingest", "costs"])
    p.add_argument("--workspace", help="workspace (org) id; see `npm run users -- list` or the admin console URL")
    p.add_argument("--url", help="website, e.g. acme.com")
    p.add_argument("--job", help="job id to report progress to (optional)")
    p.add_argument("--max-pages", type=int)
    p.add_argument("--max-depth", type=int)
    p.add_argument("--include", action="append", default=[])
    p.add_argument("--exclude", action="append", default=[])
    p.add_argument("--scope", action="append", default=[], help="partial re-crawl: only these paths")
    p.add_argument("--strategy", choices=["bfs", "dfs"])
    p.add_argument("--render-js", action="store_true")
    p.add_argument("--no-sitemap", action="store_true")
    a = p.parse_args(argv)
    if a.command == "costs":
        return a.command, {}
    env_job = os.environ.get("JOB_INPUT")
    if env_job:
        return a.command, json.loads(env_job)
    if not a.workspace or not a.url:
        p.error("--workspace and --url are required (or set JOB_INPUT)")
    crawl = {
        "start_url": a.url, "max_pages": a.max_pages, "max_depth": a.max_depth, "include": a.include, "exclude": a.exclude,
        "scope": a.scope, "strategy": a.strategy, "render_js": a.render_js or None, "use_sitemap": False if a.no_sitemap else None,
    }
    return a.command, {"workspaceId": a.workspace, "jobId": a.job, "crawl": {k: v for k, v in crawl.items() if v not in (None, [])}}


def main(argv: list[str] | None = None) -> int:
    command, job = _job_from_args(sys.argv[1:] if argv is None else argv)
    settings = Settings.load()
    log.setup(command=command, workspaceId=job.get("workspaceId"), jobId=job.get("jobId"), env=settings.env)
    logger = log.get("main")
    try:
        if command == "costs":
            from .costs.run import run_costs

            run_costs(settings)
            return 0
        if command in ("crawl", "ingest"):
            from .crawl.run import run_crawl

            run_crawl({**job, "stepIndex": job.get("stepIndex", 0), "lastStep": command == "crawl" and job.get("lastStep", True)}, settings)
        if command in ("analyze", "ingest"):
            from .analyze.run import run_analysis

            run_analysis({**job, "stepIndex": job.get("analyzeStepIndex", job.get("stepIndex", 1) if command == "analyze" else 1), "lastStep": True}, settings)
        return 0
    except Exception as e:  # noqa: BLE001 - report every failure on the job, then fail the task
        logger.error("job failed", extra={"fields": {"error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()}})
        if command == "costs":
            return 1
        try:
            from .jobs import JobProgress

            index = 1 if command == "analyze" else 0
            progress = JobProgress(settings, job["workspaceId"], job.get("jobId"))
            progress.step(index, "failed", f"{type(e).__name__}: {str(e)[:200]}")
        except Exception:  # noqa: BLE001
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
