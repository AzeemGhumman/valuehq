"""Read and write the data bucket, or a local folder when DATA_DIR is set (running on your Mac)."""
from __future__ import annotations

import gzip
import json
import os
from pathlib import Path
from typing import Iterable

from .settings import Settings


class Storage:
    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None: ...
    def get(self, key: str) -> bytes | None: ...
    def keys(self, prefix: str) -> Iterable[str]: ...

    def put_json(self, key: str, value: object) -> None:
        self.put(key, json.dumps(value, indent=2, default=str).encode(), "application/json")

    def get_json(self, key: str) -> object | None:
        raw = self.get(key)
        return json.loads(raw) if raw is not None else None

    def put_jsonl(self, key: str, rows: Iterable[dict]) -> None:
        body = "".join(json.dumps(r, default=str) + "\n" for r in rows).encode()
        self.put(key, body, "application/x-ndjson")

    def get_jsonl(self, key: str) -> list[dict]:
        raw = self.get(key)
        if raw is None:
            return []
        return [json.loads(line) for line in raw.decode().splitlines() if line.strip()]

    def get_text(self, key: str) -> str | None:
        raw = self.get(key)
        if raw is None:
            return None
        if key.endswith(".gz"):
            raw = gzip.decompress(raw)
        return raw.decode("utf-8", errors="replace")


class S3Storage(Storage):
    def __init__(self, bucket: str, region: str):
        import boto3

        self.bucket = bucket
        self.s3 = boto3.client("s3", region_name=region)

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def get(self, key: str) -> bytes | None:
        try:
            return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.s3.exceptions.NoSuchKey:
            return None

    def keys(self, prefix: str) -> Iterable[str]:
        paginator = self.s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                yield obj["Key"]


class LocalStorage(Storage):
    def __init__(self, root: str):
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        return self.root / key

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def get(self, key: str) -> bytes | None:
        p = self._path(key)
        return p.read_bytes() if p.exists() else None

    def keys(self, prefix: str) -> Iterable[str]:
        base = self._path(prefix)
        folder = base if base.is_dir() else base.parent
        if not folder.exists():
            return
        for dirpath, _, files in os.walk(folder):
            for f in files:
                key = str(Path(dirpath, f).relative_to(self.root))
                if key.startswith(prefix):
                    yield key


def open_storage(settings: Settings) -> Storage:
    if settings.data_dir:
        return LocalStorage(settings.data_dir)
    if settings.data_bucket:
        return S3Storage(settings.data_bucket, settings.region)
    raise SystemExit("Set DATA_BUCKET (AWS) or DATA_DIR (a local folder) to say where crawls are stored.")
