"""Settings from environment variables. The workers stack (infra/workers.yaml) sets these in AWS."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    env: str                    # local | dev | prod
    region: str
    table_name: str             # the app's DynamoDB table (job records, company profile)
    dynamodb_endpoint: str | None  # http://localhost:8000 for DynamoDB Local
    data_bucket: str | None     # S3 bucket for crawls and analyses
    data_dir: str | None        # local folder instead of S3 (for running on your Mac)
    anthropic_secret_id: str    # Secrets Manager secret holding the Anthropic API key
    anthropic_model: str
    anthropic_admin_secret_id: str        # Admin API key for the cost report (one per Anthropic organization)
    anthropic_workspace_id: str | None    # count only this Anthropic workspace's costs (None = whole organization)

    @staticmethod
    def load() -> "Settings":
        env = os.environ.get("APP_ENV", "local")
        return Settings(
            env=env,
            region=os.environ.get("AWS_REGION", "us-east-1"),
            table_name=os.environ.get("TABLE_NAME", f"valuehq-{env}"),
            dynamodb_endpoint=os.environ.get("DYNAMODB_ENDPOINT") or None,
            data_bucket=os.environ.get("DATA_BUCKET") or None,
            data_dir=os.environ.get("DATA_DIR") or None,
            anthropic_secret_id=os.environ.get("ANTHROPIC_SECRET_ID", f"valuehq/{env}/anthropic"),
            anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
            anthropic_admin_secret_id=os.environ.get("ANTHROPIC_ADMIN_SECRET_ID", "valuehq/anthropic-admin"),
            anthropic_workspace_id=os.environ.get("ANTHROPIC_WORKSPACE_ID") or None,
        )
