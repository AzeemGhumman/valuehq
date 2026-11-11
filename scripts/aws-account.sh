#!/usr/bin/env bash
# Sourced by deploy.sh. Makes every aws/sam command run against the account in config/account.ts:
#   - on your Mac: only the profile from config/account.ts (shell AWS_PROFILE and access keys are ignored)
#   - in GitHub Actions: the temporary credentials of the deploy role
# Then checks the credentials' account against the pinned accountId and stops on a mismatch.

PROFILE="$(sed -n "s/^[[:space:]]*profile: '\([^']*\)'.*/\1/p" config/account.ts)"
PINNED="$(sed -n "s/^[[:space:]]*accountId: '\([^']*\)'.*/\1/p" config/account.ts)"

if [ -z "${CI:-}" ]; then
  [ -n "$PROFILE" ] || { echo "No profile set in config/account.ts"; exit 1; }
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_DEFAULT_PROFILE
  export AWS_PROFILE="$PROFILE"
  PROFILE_ARGS=(--profile "$PROFILE")
else
  PROFILE_ARGS=()
fi

ACCOUNT="$(aws sts get-caller-identity ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} --query Account --output text 2>/dev/null || true)"
if [ -z "$ACCOUNT" ] || [ "$ACCOUNT" = "None" ]; then
  echo "Can't sign in to AWS${PROFILE:+ with profile \"$PROFILE\"}. Try: aws sso login --profile $PROFILE (or check ~/.aws/credentials)."
  exit 1
fi
if [ -z "$PINNED" ]; then
  echo ""
  echo "Your \"$PROFILE\" profile is AWS account $ACCOUNT."
  echo "To make sure nothing ever deploys anywhere else, pin it in config/account.ts:"
  echo ""
  echo "    accountId: '$ACCOUNT',"
  echo ""
  echo "then run this again (and commit it, so GitHub's deploys check it too)."
  exit 1
fi
if [ "$ACCOUNT" != "$PINNED" ]; then
  echo "Stopped: these credentials are for AWS account $ACCOUNT, but config/account.ts pins $PINNED."
  exit 1
fi
echo "→ AWS account $ACCOUNT${PROFILE:+ (profile $PROFILE)}"
