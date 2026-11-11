// ─────────────────────────────────────────────────────────────────────────────
// WHICH AWS ACCOUNT EVERYTHING RUNS IN
//
// Every AWS operation from your Mac (npm run deploy, and npm run users / seed with
// --env dev|prod) uses this profile from ~/.aws/config, and only this profile:
// AWS_PROFILE and AWS_ACCESS_KEY_ID in your shell are ignored.
//
// accountId pins the 12-digit account that profile must point at. Deploys (yours and
// GitHub's) and the commands stop if the credentials belong to any other account.
// Leave it empty and the first deploy stops and prints the value to put here.
// ─────────────────────────────────────────────────────────────────────────────
export const awsAccount = {
  profile: 'personal',
  accountId: '711609367175',
} as const;
