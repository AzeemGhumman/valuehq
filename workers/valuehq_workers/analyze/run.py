"""Runs the company summary on the latest crawl of a site and fills the empty company profile fields.
Called by `python -m valuehq_workers analyze` (see __main__.py)."""
from __future__ import annotations

import json
import os
import time
from typing import Any

from .. import layout, log
from ..jobs import CompanyProfile, JobProgress
from ..settings import Settings
from ..storage import open_storage
from . import company_summary as cs
from .select import candidates, pick

logger = log.get("analyze")

AUTHOR = "ValueHQ"          # shown as "last edited by"; the app's banner keys off it
BUDGET_CHARS = 120_000      # roughly 30k tokens of page text
PER_PAGE_CHARS = 8_000
PRICING_PAGE_CHARS = 16_000


def anthropic_key(settings: Settings) -> str:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    import boto3

    raw = boto3.client("secretsmanager", region_name=settings.region).get_secret_value(SecretId=settings.anthropic_secret_id)["SecretString"]
    try:
        value = json.loads(raw)
        if isinstance(value, dict):
            return str(value.get("apiKey") or value.get("ANTHROPIC_API_KEY") or value.get("key"))
    except json.JSONDecodeError:
        pass
    return raw.strip()


def run_analysis(job: dict[str, Any], settings: Settings | None = None) -> dict[str, Any]:
    """job: {workspaceId, jobId?, crawl: {start_url}, stepIndex?, lastStep?}"""
    settings = settings or Settings.load()
    storage = open_storage(settings)
    workspace_id: str = job["workspaceId"]
    step = int(job.get("stepIndex", 1))
    last_step = bool(job.get("lastStep", True))
    host = layout.host_of(job["crawl"]["start_url"] if "://" in job["crawl"]["start_url"] else "https://" + job["crawl"]["start_url"])
    progress = JobProgress(settings, workspace_id, job.get("jobId"))
    progress.step(step, "running", "Choosing pages to read")

    pointer = storage.get_json(layout.latest_pointer(workspace_id, host))
    crawl_id = pointer.get("crawlId") if isinstance(pointer, dict) else None
    if not crawl_id:
        progress.step(step, "needs-help", "No crawl of this site yet, so there's nothing to summarize.", count_done=True)
        if last_step:
            progress.finish("needs-help")
        return {"ok": False}
    manifest = storage.get_jsonl(f"{layout.crawl_dir(workspace_id, host, crawl_id)}/manifest.jsonl")
    chosen = pick(candidates(manifest), BUDGET_CHARS, PER_PAGE_CHARS, PRICING_PAGE_CHARS)
    if not chosen:
        progress.step(step, "needs-help", "The crawl found no readable pages.", count_done=True)
        if last_step:
            progress.finish("needs-help")
        return {"ok": False}

    parts = []
    for page, chars in chosen:
        text = (storage.get_text(page.text_key) or "")[:chars]
        parts.append(f"### Page: {page.title or page.url}\nURL: {page.url}\n\n{text}")
    content = "\n\n".join(parts)

    progress.step(step, detail=f"Reading {len(chosen)} pages with Claude")
    import anthropic

    client = anthropic.Anthropic(api_key=anthropic_key(settings), max_retries=4, timeout=300)
    started = time.time()
    message = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=4096,
        system=cs.system_prompt(),
        messages=[{"role": "user", "content": content}],
        tools=[cs.TOOL],
        tool_choice={"type": "tool", "name": cs.TOOL_NAME},
    )
    block = next((b for b in message.content if getattr(b, "type", None) == "tool_use"), None)
    if block is None:
        raise RuntimeError(f"The model didn't return a profile (stop reason: {message.stop_reason})")
    result: dict[str, Any] = dict(block.input)  # type: ignore[arg-type]
    usage = {"inputTokens": message.usage.input_tokens, "outputTokens": message.usage.output_tokens}

    run_id = layout.crawl_id()
    key = layout.analysis(workspace_id, cs.NAME, cs.PROMPT_VERSION, run_id)
    record = {
        "analysis": cs.NAME, "promptVersion": cs.PROMPT_VERSION, "model": settings.anthropic_model, "runId": run_id,
        "host": host, "crawlId": crawl_id, "seconds": round(time.time() - started), "usage": usage,
        # One request covers all pages, so each page's tokens are its share of the input by characters (an estimate).
        "pages": [{"url": p.url, "title": p.title, "chars": c, "score": p.score,
                   "tokensEst": round(usage["inputTokens"] * c / max(1, sum(n for _, n in chosen)))} for p, c in chosen],
        "result": result,
    }
    storage.put_json(key, record)
    storage.put_json(f"workspaces/{workspace_id}/analyses/{cs.NAME}/latest.json", {"key": key, "runId": run_id, "promptVersion": cs.PROMPT_VERSION})

    filled = CompanyProfile(settings, workspace_id).fill_empty(cs.to_company_fields(result), AUTHOR)
    pricing = result.get("pricing") or {}
    progress.patch(analysis={
        "name": cs.NAME, "promptVersion": cs.PROMPT_VERSION, "model": settings.anthropic_model, "pages": len(chosen),
        "pricingModel": cs.PRICING_LABELS.get(pricing.get("model", ""), pricing.get("model")), "filled": filled,
        "gaps": (result.get("gaps") or [])[:5], "crawlId": crawl_id, "key": key, **usage,
        "location": f"s3://{settings.data_bucket}/{key}" if settings.data_bucket else key,
    })
    names = {"tagline": "Category", "whatWeDo": "What we do", "whoWeSellTo": "Who we sell to", "howItWorks": "How it works", "pricing": "Pricing", "proof": "Proof"}
    label = ", ".join(names.get(f, f) for f in filled) if filled else "nothing (the profile already had those fields)"
    progress.step(step, "done", f"Summarized {len(chosen)} pages · pricing: {cs.PRICING_LABELS.get(pricing.get('model', ''), 'unknown')} · filled {label}", count_done=True)
    if last_step:
        progress.finish("done")
    log.info(logger, "analysis done", host=host, crawlId=crawl_id, runId=run_id, pages=len(chosen), filled=filled, **usage)
    return {"ok": True, "key": key}
