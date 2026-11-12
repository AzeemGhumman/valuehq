"""One JSON object per line, so CloudWatch Logs Insights can filter by any field."""
from __future__ import annotations

import json
import logging
import sys
import time

_context: dict[str, object] = {}


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, object] = {
            "time": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + "Z",
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
            **_context,
        }
        extra = getattr(record, "fields", None)
        if isinstance(extra, dict):
            out.update(extra)
        if record.exc_info:
            out["error"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


def setup(**context: object) -> None:
    """Call once per process. `context` (job id, workspace id) is added to every line."""
    _context.update({k: v for k, v in context.items() if v is not None})
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    # Scrapy is chatty at INFO; our own progress lines are enough.
    for name in ("scrapy", "scrapy-playwright", "playwright", "botocore", "urllib3", "trafilatura", "httpx"):
        logging.getLogger(name).setLevel(logging.WARNING)


def get(name: str) -> logging.Logger:
    return logging.getLogger(name)


def info(logger: logging.Logger, msg: str, **fields: object) -> None:
    logger.info(msg, extra={"fields": fields})
