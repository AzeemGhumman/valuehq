#!/usr/bin/env bash
# Deploys the background workers (stack valuehq-workers-<env>), separately from the app:
#   1. builds the worker image (workers/Dockerfile) and pushes it to ECR, skipping the build if
#      an image with the same contents is already there
#   2. deploys infra/workers.yaml with that image
#
#   npm run deploy:workers -- dev      (needs Docker running)
#   npm run deploy:workers -- prod
#   ANTHROPIC_WORKSPACE_ID=wrkspc_... npm run deploy:workers -- dev   (count only that Anthropic workspace's costs; kept on later deploys)
set -euo pipefail
cd "$(dirname "$0")/.."

ENV="${1:-}"
if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then echo "Usage: npm run deploy:workers -- dev|prod"; exit 1; fi
STACK="valuehq-workers-$ENV"
REGION="${AWS_REGION:-us-east-1}"
REPO="valuehq-workers"
source scripts/aws-account.sh   # sets ACCOUNT and PROFILE_ARGS, stops if the account isn't the pinned one
AWS=(aws ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} --region "$REGION")

if ! "${AWS[@]}" cloudformation describe-stacks --stack-name "valuehq-$ENV" >/dev/null 2>&1; then
  echo "Deploy the app first (npm run deploy -- $ENV): the workers write to its table valuehq-$ENV."
  exit 1
fi

echo "→ Image repository"
if ! "${AWS[@]}" ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1; then
  "${AWS[@]}" ecr create-repository --repository-name "$REPO" --image-scanning-configuration scanOnPush=true --tags Key=app,Value=valuehq >/dev/null
  "${AWS[@]}" ecr put-lifecycle-policy --repository-name "$REPO" --lifecycle-policy-text \
    '{"rules":[{"rulePriority":1,"description":"keep the last 30 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":30},"action":{"type":"expire"}}]}' >/dev/null
fi
# Everything ValueHQ creates carries app=valuehq, so the Costs page can separate it from the rest of the account.
"${AWS[@]}" ecr tag-resource --resource-arn "arn:aws:ecr:$REGION:$ACCOUNT:repository/$REPO" --tags Key=app,Value=valuehq >/dev/null
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
# The tag is a hash of the worker sources, so unchanged code isn't rebuilt and dev and prod run the same image.
TAG="$(cd workers && find . -type f -not -path '*/__pycache__/*' -not -path './.venv/*' -not -name '*.pyc' | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256 | cut -c1-16)"
IMAGE="$REGISTRY/$REPO:$TAG"

if "${AWS[@]}" ecr describe-images --repository-name "$REPO" --image-ids imageTag="$TAG" >/dev/null 2>&1; then
  echo "→ Image $TAG already built"
else
  echo "→ Building $TAG (the first build takes a few minutes)"
  "${AWS[@]}" ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
  docker build --platform linux/amd64 -t "$IMAGE" workers
  docker push "$IMAGE"
fi

echo "→ Deploying stack $STACK"
"${AWS[@]}" cloudformation deploy --stack-name "$STACK" --template-file infra/workers.yaml \
  --parameter-overrides "Env=$ENV" "ImageUri=$IMAGE" ${ANTHROPIC_WORKSPACE_ID:+"AnthropicWorkspaceId=$ANTHROPIC_WORKSPACE_ID"} --capabilities CAPABILITY_IAM \
  --tags app=valuehq "env=$ENV" --no-fail-on-empty-changeset

out() { "${AWS[@]}" cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
echo ""
echo "Deployed workers $ENV"
echo "  state machine: $(out WebsiteIngestStateMachineArn)"
echo "  data bucket:   $(out DataBucketName)"
echo "  logs:          $(out WorkerLogGroup)"
echo "  costs:         $(out CostsStateMachineArn) (daily)"
for secret in "valuehq/$ENV/anthropic" "valuehq/anthropic-admin"; do
  "${AWS[@]}" secretsmanager tag-resource --secret-id "$secret" --tags Key=app,Value=valuehq >/dev/null 2>&1 || true
done
if ! "${AWS[@]}" secretsmanager describe-secret --secret-id "valuehq/anthropic-admin" >/dev/null 2>&1; then
  echo ""
  echo "Optional, for Anthropic costs on the admin Costs page: store an Anthropic Admin API key (sk-ant-admin...):"
  echo "  read -rs KEY && aws secretsmanager create-secret --profile ${PROFILE:-personal} --region $REGION --name valuehq/anthropic-admin --secret-string \"\$KEY\" --tags Key=app,Value=valuehq && unset KEY"
fi
if ! "${AWS[@]}" secretsmanager describe-secret --secret-id "valuehq/$ENV/anthropic" >/dev/null 2>&1; then
  echo ""
  echo "One more step: store your Anthropic API key (the summary step reads it). Paste the key when asked:"
  echo "  read -rs KEY && aws secretsmanager create-secret --profile ${PROFILE:-personal} --region $REGION --name valuehq/$ENV/anthropic --secret-string \"\$KEY\" && unset KEY"
fi
