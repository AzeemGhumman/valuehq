"""Builds the cost snapshot and stores it in the app's table (PK COSTS / SK LATEST, plus a dated copy).
Called by `python -m valuehq_workers costs`, daily from the schedule in infra/workers.yaml."""
from __future__ import annotations

import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

from .. import log
from ..jobs import _table
from ..settings import Settings
from . import allocate, anthropic_costs, aws_costs

logger = log.get("costs")


def _admin_key(settings: Settings) -> str | None:
    if os.environ.get("ANTHROPIC_ADMIN_KEY"):
        return os.environ["ANTHROPIC_ADMIN_KEY"]
    import boto3

    sm = boto3.client("secretsmanager", region_name=settings.region)
    try:
        raw = sm.get_secret_value(SecretId=settings.anthropic_admin_secret_id)["SecretString"]
    except sm.exceptions.ResourceNotFoundException:
        return None
    try:
        value = json.loads(raw)
        if isinstance(value, dict):
            return str(value.get("apiKey") or value.get("key"))
    except json.JSONDecodeError:
        pass
    return raw.strip()


def _org_usage(table: Any, month: str) -> list[dict[str, Any]]:
    from boto3.dynamodb.conditions import Attr, Key

    workspaces: list[dict[str, Any]] = []
    kwargs: dict[str, Any] = {"FilterExpression": Attr("SK").eq("META")}
    while True:
        res = table.scan(**kwargs)
        workspaces.extend(res.get("Items", []))
        if "LastEvaluatedKey" not in res:
            break
        kwargs["ExclusiveStartKey"] = res["LastEvaluatedKey"]
    orgs = []
    for w in workspaces:
        if w.get("kind") == "internal":
            continue
        jobs: list[dict[str, Any]] = []
        q: dict[str, Any] = {"KeyConditionExpression": Key("PK").eq(f"WS#{w['id']}") & Key("SK").begins_with("JOB#")}
        while True:
            res = table.query(**q)
            jobs.extend(res.get("Items", []))
            if "LastEvaluatedKey" not in res:
                break
            q["ExclusiveStartKey"] = res["LastEvaluatedKey"]
        orgs.append({"id": w["id"], "name": w.get("name", w["id"]), "usage": allocate.usage_from_jobs(jobs, month)})
    return orgs


def build_snapshot(settings: Settings, today: date | None = None) -> dict[str, Any]:
    today = today or datetime.now(timezone.utc).date()
    this_month = aws_costs.month_start(today)
    last_month = aws_costs.month_start(this_month - timedelta(days=1))

    try:
        import boto3

        aws = aws_costs.fetch(boto3.client("ce", region_name="us-east-1"), today)
    except Exception as e:  # noqa: BLE001 - show the reason on the Costs page instead of failing the run
        logger.exception("aws costs failed")
        aws = {"error": f"{type(e).__name__}: {e}"[:300]}

    key = _admin_key(settings)
    if not key:
        anthropic: dict[str, Any] = {"error": f"No Anthropic Admin API key in Secrets Manager ({settings.anthropic_admin_secret_id})."}
    else:
        try:
            buckets = anthropic_costs.fetch_buckets(key, last_month, today + timedelta(days=1))
            anthropic = anthropic_costs.summarize(buckets, settings.anthropic_workspace_id, this_month.isoformat()[:7], last_month.isoformat()[:7])
        except Exception as e:  # noqa: BLE001
            logger.exception("anthropic costs failed")
            anthropic = {"error": f"{type(e).__name__}: {e}"[:300]}

    table = _table(settings)
    month = this_month.isoformat()[:7]
    fargate = (aws.get("months") or [{}])[0].get("byService", {}).get(allocate.FARGATE_SERVICE, 0.0) if "months" in aws else 0.0
    anthropic_total = anthropic["months"][0]["total"] if "months" in anthropic else None
    orgs = allocate.allocate(_org_usage(table, month), fargate, anthropic_total)
    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "env": settings.env,
        "month": month,
        "aws": aws,
        "anthropic": anthropic,
        "orgs": orgs,
    }


def run_costs(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or Settings.load()
    started = time.time()
    snapshot = build_snapshot(settings)
    table = _table(settings)
    body = json.dumps(snapshot, default=str)
    table.put_item(Item={"PK": "COSTS", "SK": "LATEST", "type": "costs", "data": body})
    table.put_item(Item={"PK": "COSTS", "SK": f"SNAPSHOT#{snapshot['generatedAt'][:10]}", "type": "costs", "data": body,
                         "ttl": int(time.time()) + 400 * 86_400})
    log.info(logger, "costs saved", seconds=round(time.time() - started), month=snapshot["month"],
             aws=(snapshot["aws"].get("months") or [{}])[0].get("total") if "months" in snapshot["aws"] else snapshot["aws"].get("error"),
             anthropic=snapshot["anthropic"]["months"][0]["total"] if "months" in snapshot["anthropic"] else snapshot["anthropic"].get("error"))
    return snapshot
