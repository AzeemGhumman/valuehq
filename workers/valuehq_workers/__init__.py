"""ValueHQ background workers.

Each job is a command (see __main__.py) that runs in a Fargate container started by Step Functions
(infra/workers.yaml), or on your Mac against local DynamoDB and a local folder.
"""
