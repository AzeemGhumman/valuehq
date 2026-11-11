#!/usr/bin/env bash
# Deploys one environment: builds, runs `sam deploy` (CloudFormation stack valuehq-<env>),
# uploads static files to S3 and clears the CloudFront cache.
#   npm run deploy -- dev      (from your Mac: always the profile and account in config/account.ts)
#   npm run deploy -- prod
# GitHub Actions runs the same script with temporary credentials.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV="${1:-}"
if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then echo "Usage: npm run deploy -- dev|prod"; exit 1; fi
STACK="valuehq-$ENV"
REGION="${AWS_REGION:-us-east-1}"
source scripts/aws-account.sh   # sets PROFILE_ARGS, stops if the account isn't the pinned one

out() {
  aws cloudformation describe-stacks ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null || true
}
sync_static() {
  local bucket; bucket="$(out AssetsBucketName)"
  [ -n "$bucket" ] && [ "$bucket" != "None" ] || return 0
  aws s3 sync build/static "s3://$bucket" ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} --region "$REGION" --cache-control "public,max-age=31536000,immutable" --only-show-errors
}

echo "→ Building"
npm run build:lambda

echo "→ Uploading static files (before the new server goes live)"
sync_static

echo "→ Deploying stack $STACK"
sam deploy --config-env "$ENV" --region "$REGION" ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}

echo "→ Uploading static files"
sync_static
DIST="$(out DistributionId)"
aws cloudfront create-invalidation ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} --distribution-id "$DIST" --paths "/*" --region "$REGION" >/dev/null

echo ""
echo "Deployed $ENV: $(out AppUrl)"
