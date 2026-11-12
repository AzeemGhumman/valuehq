"""Job progress and company profile, in the app's DynamoDB table.

Uses the same keys and fields as the app (src/server/repo.ts), so the Background jobs page shows
worker progress live without any app changes:
  PK = WS#<workspaceId>, SK = JOB#<jobId>   job record (status, steps[], report)
  PK = WS#<workspaceId>, SK = COMPANY       company profile
"""
from __future__ import annotations

import time
from decimal import Decimal
from typing import Any

from .settings import Settings


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + ".000Z"


def _table(settings: Settings):
    import boto3

    kwargs: dict[str, Any] = {"region_name": settings.region}
    if settings.dynamodb_endpoint:
        kwargs.update(endpoint_url=settings.dynamodb_endpoint, aws_access_key_id="local", aws_secret_access_key="local")
    return boto3.resource("dynamodb", **kwargs).Table(settings.table_name)


def to_dynamo(value: Any) -> Any:
    """boto3 rejects Python floats; DynamoDB numbers are Decimals. Empty strings become null."""
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, float):
        return Decimal(str(round(value, 6)))
    if isinstance(value, dict):
        return {k: to_dynamo(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_dynamo(v) for v in value]
    return value


def set_expression(fields: dict[str, Any], prefix: str = "") -> tuple[str, dict[str, str], dict[str, Any]]:
    """SET expression for top-level fields, or fields of one list element when prefix is like '#steps[2].'."""
    names: dict[str, str] = {}
    values: dict[str, Any] = {}
    parts: list[str] = []
    for i, (k, v) in enumerate(fields.items()):
        names[f"#f{i}"] = k
        values[f":v{i}"] = to_dynamo(v)
        parts.append(f"{prefix}#f{i} = :v{i}")
    return ", ".join(parts), names, values


def from_dynamo(value: Any) -> Any:
    """DynamoDB numbers come back as Decimal; turn them into int or float."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: from_dynamo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [from_dynamo(v) for v in value]
    return value


def load_job(settings: Settings, workspace_id: str, job_id: str) -> dict[str, Any] | None:
    item = _table(settings).get_item(Key={"PK": f"WS#{workspace_id}", "SK": f"JOB#{job_id}"}).get("Item")
    return from_dynamo(item) if item else None


class JobProgress:
    """Updates one job record. With no job id (running by hand), it only logs."""

    def __init__(self, settings: Settings, workspace_id: str, job_id: str | None):
        self.workspace_id = workspace_id
        self.job_id = job_id
        self.table = _table(settings) if job_id else None
        self._last_detail_at = 0.0

    @property
    def key(self) -> dict[str, str]:
        return {"PK": f"WS#{self.workspace_id}", "SK": f"JOB#{self.job_id}"}

    def patch(self, **fields: Any) -> None:
        if not self.table:
            return
        expr, names, values = set_expression({**fields, "updatedAt": _now()})
        self.table.update_item(Key=self.key, UpdateExpression="SET " + expr, ExpressionAttributeNames=names, ExpressionAttributeValues=values)

    def step(self, index: int, status: str | None = None, detail: str | None = None, *, throttle: float = 0, count_done: bool = False) -> None:
        """Update steps[index]. `throttle` skips detail-only updates sent within that many seconds."""
        if not self.table:
            return
        now = time.monotonic()
        if throttle and status is None and now - self._last_detail_at < throttle:
            return
        self._last_detail_at = now
        fields = {k: v for k, v in {"status": status, "detail": detail}.items() if v is not None}
        expr, names, values = set_expression(fields, prefix="#steps[%d]." % index)
        names["#steps"] = "steps"
        names["#u"] = "updatedAt"
        values[":u"] = _now()
        update = f"SET {expr}, #u = :u"
        if count_done:
            update += " ADD doneCount :one"
            values[":one"] = 1
        self.table.update_item(Key=self.key, UpdateExpression=update, ExpressionAttributeNames=names, ExpressionAttributeValues=values)

    def finish(self, status: str, error: str | None = None) -> None:
        fields: dict[str, Any] = {"status": status, "finishedAt": _now()}
        if error:
            fields["error"] = error[:300]
        self.patch(**fields)


class CompanyProfile:
    def __init__(self, settings: Settings, workspace_id: str):
        self.table = _table(settings)
        self.key = {"PK": f"WS#{workspace_id}", "SK": "COMPANY"}
        self.workspace_id = workspace_id

    def get(self) -> dict[str, Any] | None:
        return self.table.get_item(Key=self.key).get("Item")

    def workspace_name(self) -> str | None:
        item = self.table.get_item(Key={"PK": f"WS#{self.workspace_id}", "SK": "META"}).get("Item")
        return item.get("name") if item else None

    def fill_empty(self, draft: dict[str, str | None], author: str) -> list[str]:
        """Writes only fields that are empty now, so nothing a person wrote is overwritten. Returns their names."""
        current = self.get() or {}
        fill = {k: v for k, v in draft.items() if v and not current.get(k)}
        if not fill:
            return []
        if not current:
            fill.setdefault("name", self.workspace_name() or "Company")
            fill["createdBy"] = author
        fill.update(updatedBy=author, updatedAt=_now(), type="company")
        expr, names, values = set_expression(fill)
        self.table.update_item(Key=self.key, UpdateExpression="SET " + expr, ExpressionAttributeNames=names, ExpressionAttributeValues=values)
        return [k for k in draft if k in fill]
