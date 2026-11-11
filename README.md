# ValueHQ

Account research and POV decks for software AEs. This repo is the working product: sign in, set up your company and offerings, add accounts and their sources, and run background jobs. Briefs, Ask, POV decks, stakeholders and outreach plug in next.

- **App:** Next.js 15 (App Router, server actions), React 19, shadcn/ui, Tailwind CSS 4
- **Data:** DynamoDB (one table)
- **Background jobs:** AWS Step Functions + Lambda
- **Hosting:** Lambda (Lambda Web Adapter) behind CloudFront, static files in S3
- **Infrastructure:** `template.yaml` (AWS SAM), one CloudFormation stack per environment: `valuehq-dev` and `valuehq-prod`
- **Pipeline:** GitHub Actions. Pull requests are checked, `main` deploys to dev, and `v*` tags deploy to prod.

The clickable static demo lives next to this repo in `../demo-1` (see its own README).

---

## Contents

1. [Run it locally](#run-it-locally)
2. [Manage users](#manage-users)
3. [Deploy](#deploy)
4. [Set up auto-deploy (one time)](#set-up-auto-deploy-one-time)
5. [How it works](#how-it-works)
6. [Configuration](#configuration)
7. [Project layout](#project-layout)
8. [Costs](#costs)
9. [Troubleshooting](#troubleshooting)

---

## Run it locally

You need **Node 22**, **Docker Desktop** (for a local DynamoDB) and, for deploying, the **AWS CLI** and **AWS SAM CLI** (`brew install awscli aws-sam-cli`).

```bash
npm install
cp .env.example .env.local
npm run db:local                                              # starts DynamoDB Local in Docker and creates the table
npm run users -- add you@company.com --name "Your Name" --role admin   # prints your password
npm run seed                                                  # loads the Comena sample data (optional)
npm run dev                                                   # http://localhost:3000
```

Locally, background jobs run inside the dev server instead of Step Functions. Their progress shows the same way on the Background jobs page.

After your first `npm install`, commit `package-lock.json` so every build uses the same versions.

## Manage users

One command adds, removes and lists the people who can sign in. It works against your local database or a deployed environment.

```bash
npm run users -- <command> [options] [--env local|dev|prod]
```

| Command | What it does |
|---|---|
| `list` | List everyone, by workspace |
| `add <email> --name "Full Name"` | Add a person. Prints a generated password once. |
| `add <email> --name "…" --role admin` | Add an admin (default role is `member`) |
| `add <email> --name "…" --password "<pw>"` | Add with a password you choose (at least 10 characters) |
| `remove <email>` | Remove a person. They're signed out on their next page load. |
| `reset-password <email>` | Generate a new password and print it |
| `reset-password <email> --password "<pw>"` | Set a specific password |

`--env` defaults to `local`. For `dev` and `prod` the command uses your AWS profile (`AWS_PROFILE`, default `personal`).

The first user you add creates the workspace. It's named "Comena" unless you pass `--workspace "Name"`.

Examples:

```bash
npm run users -- add sam@comena.ai --name "Sam Lee" --env dev
npm run users -- list --env prod
npm run users -- remove sam@comena.ai --env dev
AWS_PROFILE=other npm run users -- list --env prod
```

To load sample data into a deployed environment: `npm run seed -- --env dev`.

## Deploy

Deploys normally happen from GitHub (see the next section). You can also deploy from your Mac:

```bash
npm run deploy -- dev      # or: prod
```

This runs `scripts/deploy.sh`:
1. Builds the app (`npm run build:lambda`).
2. Runs `sam deploy`, which creates or updates the CloudFormation stack `valuehq-dev`.
3. Uploads static files to S3 and clears the CloudFront cache.
4. Prints the link to share, e.g. `https://d1234abcd.cloudfront.net`.

The first deploy takes about 5–10 minutes, mostly CloudFront. Later deploys take 2–4 minutes.

After the first deploy of an environment, add yourself there:

```bash
npm run users -- add you@company.com --name "Your Name" --role admin --env dev
```

## Set up auto-deploy (one time)

GitHub Actions deploys with short-lived credentials (OpenID Connect), so no AWS keys are stored in GitHub.

**1. Create the deploy role in AWS** (from your Mac):

```bash
aws cloudformation deploy --profile personal --region us-east-1 \
  --stack-name valuehq-github-oidc --template-file infra/github-oidc.yaml \
  --capabilities CAPABILITY_NAMED_IAM
aws cloudformation describe-stacks --profile personal --region us-east-1 --stack-name valuehq-github-oidc \
  --query "Stacks[0].Outputs[0].OutputValue" --output text
```

If your account already has a GitHub OIDC provider, add `--parameter-overrides CreateOidcProvider=false` to the first command.

**2. Tell GitHub the role.** In GitHub, open the repo, then **Settings › Secrets and variables › Actions › Variables**. Add a variable named `AWS_DEPLOY_ROLE_ARN` with the ARN printed above.

**3. Protect prod.** In **Settings › Environments**, create `dev` and `prod`. On `prod`, turn on **Required reviewers** and add yourself. Prod deploys then wait for your approval.

**4. Use it:**

| You do | What happens |
|---|---|
| Open a pull request | **CI**: type-check, build, validate the template |
| Merge or push to `main` | **Deploy** to dev |
| `git tag v0.1.0 && git push origin v0.1.0` | **Deploy** to prod, after you approve it in the Actions tab |
| Actions › Deploy › Run workflow | Deploy dev or prod by hand |

Until `AWS_DEPLOY_ROLE_ARN` is set, the Deploy workflow is skipped.

## How it works

### Requests

```
Browser ──► CloudFront ──┬── /_next/static/* ──► S3 (cached)
                         └── everything else ──► Lambda Function URL ──► Lambda Web Adapter ──► Next.js server.js
                                                                                        ├──► DynamoDB
                                                                                        └──► Step Functions
```

- `next build` with `output: 'standalone'` produces a plain Node server, `server.js`.
- The Lambda Web Adapter layer starts that server inside Lambda and passes each request to it, so the app doesn't know it runs on Lambda.
- CloudFront adds a secret header (`x-origin-verify`) that the app checks in `src/middleware.ts`, so the Lambda URL can't be used directly.
- **Cold starts:** after the app has been idle for a while, the first request takes about 1–2 seconds.

### Data

One DynamoDB table per environment (`valuehq-dev`, `valuehq-prod`). Keys are documented at the top of `src/server/repo.ts`:

| PK | SK | Item |
|---|---|---|
| `USER#<email>` | `PROFILE` | user (also indexed by workspace in `GSI1`) |
| `SESSION#<hash>` | `SESSION` | sign-in session, expires automatically (`ttl`) |
| `WS#<id>` | `META` · `COMPANY` · `OFFERING#…` · `ACCOUNT#…` · `SOURCE#…` · `JOB#…` | everything in a workspace |

Prod has point-in-time recovery turned on. Both tables are kept if a stack is deleted.

### Background jobs

Each piece of background work is a **job**.

1. The app writes a job record to DynamoDB and starts a Step Functions execution: the state machine `valuehq-<env>-check-sources` in `template.yaml`.
2. Each step runs in the `valuehq-<env>-jobs` Lambda (`src/jobs/handler.ts` → `src/jobs/steps.ts`) and updates the job record as it goes.
3. Sources are checked in parallel, five at a time, with retries.
4. A step that can't finish on its own marks the job **Needs your help**, for example when a link is blocked. Errors mark it **Failed** with a reason.
5. The **Background jobs** page and the sidebar badge read the job records. The page refreshes every few seconds while a job runs.
6. Each job links to its execution in the Step Functions console, which shows every step's input, output and error. Lambda logs are in CloudWatch under `/aws/lambda/valuehq-<env>-jobs`.

The first job type is **Check sources**: open an account and select **Check sources**. It confirms each source link responds. To add a new job type:
1. Add its steps in `src/jobs/`.
2. Add a state machine in `template.yaml`.
3. Add a start function in `src/server/jobs.ts`.

## Configuration

Settings live in `config/`, one file per concern. Each reads environment variables in one place.

| File | What's in it |
|---|---|
| `config/app.ts` | Environment name (`local`, `dev`, `prod`), CloudFront origin secret |
| `config/auth.ts` | Session cookie, session length, minimum password length |
| `config/aws.ts` | Region, table name, local DynamoDB endpoint, state machine ARN, CLI profile |
| `config/jobs.ts` | Job runner (Step Functions or local), refresh interval, demo step delay |
| `config/ai.ts` | AI provider settings (reserved for extraction, Briefs and Ask) |

Where the values come from:
- **Locally:** from `.env.local`.
- **In AWS:** from `template.yaml`.
- **Per-environment deploy settings** (stack name, region, tags): `samconfig.toml`.

## Project layout

```
config/                 settings, one file per concern
src/app/                screens (Next.js App Router); (app)/ = signed-in pages, login/ = sign in
src/components/ui/      shadcn/ui components
src/components/         app components (sidebar, sources, forms)
src/server/             data access (repo.ts), sign-in (auth.ts), server actions (actions.ts), job starter (jobs.ts)
src/jobs/               background job steps and the Lambda handler
scripts/                users CLI, seed, local table, build and deploy
infra/github-oidc.yaml  one-time GitHub → AWS deploy role
template.yaml           everything deployed to AWS (SAM)
samconfig.toml          dev and prod deploy settings
.github/workflows/      CI and deploy pipelines
```

To add more shadcn/ui components: `npx shadcn@latest add dialog` (settings are in `components.json`).

## Costs

At demo traffic, each environment costs a few dollars a month or less:
- **Lambda, DynamoDB and Step Functions:** mostly inside the free tier.
- **CloudFront and S3:** cents.

With nobody using it, the cost is close to zero.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm run users` says the table doesn't exist | Locally: `npm run db:local`. Deployed: deploy that environment first. |
| AWS credentials errors | `aws sso login --profile personal`, or check `~/.aws/credentials` |
| First page load is slow | Expected after the app has been idle: Lambda is starting |
| `Forbidden` on every page | You're calling the Lambda URL directly. Use the CloudFront link (`AppUrl`). |
| Forms fail with "Invalid Server Actions request" on a custom domain | Set `APP_DOMAIN` at build time (see `next.config.mjs`) |
| Function URL returns 403 even through CloudFront | Newer AWS accounts may also need `lambda:InvokeFunction` permission on the function URL. Update the SAM CLI and redeploy. |
| Delete a stack | `aws cloudformation delete-stack --stack-name valuehq-dev`. Empty its assets bucket first. The DynamoDB table is kept. |
