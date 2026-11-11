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
3. [Roles and permissions](#roles-and-permissions)
4. [Platform operators and the admin console](#platform-operators-and-the-admin-console)
5. [Sample data (seed profiles)](#sample-data-seed-profiles)
6. [Deploy](#deploy)
7. [Set up auto-deploy (one time)](#set-up-auto-deploy-one-time)
8. [How it works](#how-it-works)
9. [Configuration](#configuration)
10. [Project layout](#project-layout)
11. [Costs](#costs)
12. [Troubleshooting](#troubleshooting)

---

## Run it locally

You need **Node 22**, **Docker Desktop** (for a local DynamoDB) and, for deploying, the **AWS CLI** and **AWS SAM CLI** (`brew install awscli aws-sam-cli`).

```bash
npm install
cp .env.example .env.local
npm run db:local                                              # starts DynamoDB Local in Docker and creates the table
npm run users -- add you@company.com --name "Your Name" --role admin   # asks you to type a password
npm run seed -- comena                                        # loads a sample profile (optional, see below)
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
| `add <email> --name "Full Name"` | Add a person. Asks you to type their password (hidden, twice). |
| `add <email> --name "…" --role admin` | Add with a role: `admin`, `member` (default) or `viewer`. The first person in a workspace is always an admin. |
| `add <email> --name "…" --password "<pw>"` | Same, with the password on the command line |
| `remove <email>` | Remove a person. They're signed out right away. |
| `disable <email>` / `enable <email>` | Turn someone's sign-in off or back on. Their data stays. |
| `add <email> --name "…" --operator` | Add a platform operator (the ValueHQ team). Put `--operator` last. |
| `set-operator <email> on\|off` | Make an existing user an operator, or stop them being one |
| `reset-password <email>` | Asks you to type a new password |
| `set-role <email> <role>` | Change someone's role. A workspace always keeps at least one admin. |
| `reset-password <email> --password "<pw>"` | Set a specific password |

`--env` defaults to `local`. For `dev` and `prod` the command always uses the `personal` AWS profile and checks the account (see [Which AWS account](#which-aws-account)).

Passwords need at least 4 characters. That's deliberately short for the demo; raise `minPasswordLength` in `config/auth.ts` before real customers sign in.

The first user you add creates the workspace. It's named "Comena" unless you pass `--workspace "Name"`.

Examples:

```bash
npm run users -- add sam@comena.ai --name "Sam Lee" --env dev
npm run users -- list --env prod
npm run users -- remove sam@comena.ai --env dev
```

Admins can also do all of this in the app under **Settings › Members**.

## Roles and permissions

Every rule lives in one file: **`config/roles.ts`**. The app checks it on every change (`src/server/permissions.ts`), and **Settings › Roles** shows the same table to everyone.

| Role | In short |
|---|---|
| **Admin** | Runs the workspace: company profile, offerings, value maps, members, rules. Can do everything. |
| **Member** | Works accounts: adds accounts, edits them, runs jobs. Reads the company profile and offerings. |
| **Viewer** | Read-only. Changes nothing except their own name and password. |

Default rules:

| Permission | Admin | Member | Viewer |
|---|---|---|---|
| Edit the company profile and company sources | ✓ | – | – |
| Create, duplicate and delete offerings | ✓ | – | – |
| Edit offering details and sources ★ | ✓ | – | – |
| Edit value map rows and mark them reviewed ★ | ✓ | – | – |
| Add accounts ★ | ✓ | ✓ | – |
| Edit account details and sources ★ | ✓ | ✓ | – |
| Change an account's owner and team ★ | ✓ | their accounts | – |
| Delete accounts ★ | ✓ | their accounts | – |
| Start background jobs ★ | ✓ | ✓ | – |
| Manage members and roles | ✓ | – | – |
| Rename the workspace, change ★ rules | ✓ | – | – |

**Rule types:**
- **"Their accounts"** means accounts they own or are on the team of. Each account has an owner, set to whoever added it, and a team, both edited on the account page.
- **★ rules can be changed per workspace** by an admin in **Settings › Roles**. For example, an admin can let members edit value maps, or stop members from deleting accounts.
- **To change the default for everyone,** edit `grants` in `config/roles.ts`.
- **To add a new permission:**
  1. Add it to `PERMISSIONS` in `config/roles.ts`.
  2. Call `assertCan(ctx, '<permission>')` in the server action.
  3. Use `caps['<permission>']` to show or hide the control.

**Admin safeguards:**
- Admins can't change their own role or remove themselves.
- A workspace always keeps at least one admin.
- Removing someone moves the accounts they owned to the admin who removed them and takes them off every account team.

## Platform operators and the admin console

Operators are the ValueHQ team. They sign in like anyone else and land on the **admin console** at `/admin`, which sits above every workspace. The rules are written out in `config/roles.ts` (`OPERATOR`) and enforced by `requireOperator()` in `src/server/auth.ts`.

Create the first operator from the command line, then do everything else in the console:

```bash
npm run users -- add you@valuehq.com --name "Your Name" --operator              # local
npm run users -- add you@valuehq.com --name "Your Name" --operator --env dev    # deployed dev
```

Operators live in their own workspace, "ValueHQ Platform", created on first use. It never shows up as a customer org.

What the console does:

| Where | What you can do |
|---|---|
| **Orgs** (`/admin`) | Every org with its status, people, profile job and last sign-in. Open any org as its admin. |
| **New org** | Company name, website and other links, the first admin's name, email and password, and optional sample data. With **Build their profile** on, a background job reads each link and drafts the empty profile fields (Category, What we do, How it works). The first admin sees “We’re building your company profile” on Home while it runs, and “We drafted parts of your profile” afterwards until they edit it. |
| **Org page** | Company profile summary and sources · background jobs with every step · rerun the profile job · rename · load a sample profile · disable or enable the org · delete it (type its name to confirm). |
| **People** (on the org page) | Change anyone's name, email, role or password in one form (handy for quick demo logins) · turn sign-in off or on · remove · add people. Changing an email also updates the accounts they own or are on. |
| **Platform team** | The same page for the ValueHQ Platform workspace: add and remove operators. |

**Open as admin:** you work inside the org with the admin role. A dark banner on every page says whose org you're in and leads back to the console. Changes are recorded under your email. Your own profile and password stay yours.

**Disabling:** a disabled person, or anyone in a disabled org, is signed out and sees a message on the sign-in page. Operators can always sign in.

**The profile job** reads public pages only, with plain HTML parsing for now (title, description, main heading, first paragraphs). It never overwrites a field a person filled. Admins can rerun it themselves with **Draft from sources** on My company. When the AI step arrives, it plugs into `finish` in `src/jobs/steps.ts`.

## Sample data (seed profiles)

A seed profile is a complete sample setup: company profile, offerings with value maps, accounts and sources. Loading one **replaces** that workspace's company, offerings, accounts, sources and background jobs. Members and passwords stay. You're asked to type the workspace name to confirm.

```bash
npm run seed -- list                                  # show profiles
npm run seed -- comena                                # load into the only workspace
npm run seed -- halyard --workspace "Comena"          # pick a workspace by name
npm run seed -- comena --env dev --yes                # deployed dev, no prompt
```

| Profile | What it is |
|---|---|
| `comena` | Comena (AI order entry) selling to Grainger, Fastenal and MSC. Real public companies with real filing links. |
| `halyard` | Halyard Security (fictional) selling medical-device security to three fictional hospital systems. Useful to check the product isn't shaped around one industry. |

Accounts are owned by the workspace's first admin. Operators can also load a profile from an org's page in the admin console, or pick one when creating an org.

To add a profile:
1. Copy `scripts/seed-profiles/comena.ts`.
2. Change the data.
3. List it in `scripts/seed-profiles/index.ts`.

## Deploy

### Which AWS account

Everything runs in one AWS account, set in `config/account.ts`:

```ts
profile: 'personal',      // the only profile used from your Mac
accountId: '123456789012', // deploys and commands stop if the credentials are for any other account
```

- `npm run deploy` and `npm run users` / `npm run seed` with `--env dev|prod` always use the `personal` profile. `AWS_PROFILE`, `AWS_ACCESS_KEY_ID` and other credentials in your shell are ignored.
- Before doing anything, they check which account the credentials belong to and stop if it isn't `accountId`. GitHub's deploys run the same check.
- The first time, `accountId` is empty: the deploy stops and prints the line to paste. Paste it, commit it, run again.
- One-time AWS commands in this README (the GitHub deploy role) pass `--profile personal` explicitly.

### Deploying from your Mac

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

1. The app writes a job record to DynamoDB and starts a Step Functions execution: the state machine `valuehq-<env>-source-jobs` in `template.yaml`.
2. Each step runs in the `valuehq-<env>-jobs` Lambda (`src/jobs/handler.ts` → `src/jobs/steps.ts`) and updates the job record as it goes.
3. Sources are checked in parallel, five at a time, with retries.
4. A step that can't finish on its own marks the job **Needs your help**, for example when a link is blocked. Errors mark it **Failed** with a reason.
5. The **Background jobs** page and the sidebar badge read the job records. The page refreshes every few seconds while a job runs.
6. Each job links to its execution in the Step Functions console, which shows every step's input, output and error. Lambda logs are in CloudWatch under `/aws/lambda/valuehq-<env>-jobs`.

There are two job types, sharing one state machine (one step per source in parallel, then a final step):
- **Check sources** (`check-sources`): open an account and select **Check sources**. It confirms each source link responds.
- **Build company profile** (`build-profile`): started when an operator creates an org, or with **Draft from sources** on My company. It reads each company source and drafts the empty profile fields.

To add a job type:
1. Add its steps in `src/jobs/` (or a new branch in `finish`).
2. If its shape differs (not "one step per source"), add a state machine in `template.yaml`.
3. Add a start function in `src/server/jobs.ts`.

## Configuration

Settings live in `config/`, one file per concern. Each reads environment variables in one place.

| File | What's in it |
|---|---|
| `config/app.ts` | Environment name (`local`, `dev`, `prod`), CloudFront origin secret |
| `config/auth.ts` | Session cookie, session length, minimum password length |
| `config/aws.ts` | Region, table name, local DynamoDB endpoint, state machine ARN |
| `config/account.ts` | The AWS profile (`personal`) and the pinned account ID every AWS operation must use |
| `config/jobs.ts` | Job runner (Step Functions or local), refresh interval, demo step delay |
| `config/ai.ts` | AI provider settings (reserved for extraction, Briefs and Ask) |
| `config/roles.ts` | Roles and the permission rules (see [Roles and permissions](#roles-and-permissions)) |

Where the values come from:
- **Locally:** from `.env.local`.
- **In AWS:** from `template.yaml`.
- **Per-environment deploy settings** (stack name, region, tags): `samconfig.toml`.

## Project layout

```
config/                 settings, one file per concern
src/app/                screens (Next.js App Router); (app)/ = signed-in pages, admin/ = platform admin console, login/ = sign in
src/components/ui/      shadcn/ui components
src/components/         app components (sidebar, sources, forms)
src/server/             data access (repo.ts), sign-in (auth.ts), permissions (permissions.ts), server actions (actions.ts),
                        operator actions (admin-actions.ts), job starter (jobs.ts), sample-data loader (seed.ts)
src/jobs/               background job steps and the Lambda handler
scripts/                users CLI, seed, local table, build and deploy
scripts/seed-profiles/  sample workspace data, one file per profile
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
| "Stopped: these credentials are for AWS account …" | The `personal` profile points at a different account than `config/account.ts` pins. Fix `~/.aws/config`; change `accountId` only if you really mean to move accounts. |
| First page load is slow | Expected after the app has been idle: Lambda is starting |
| `Forbidden` on every page | You're calling the Lambda URL directly. Use the CloudFront link (`AppUrl`). |
| Forms fail with "Invalid Server Actions request" on a custom domain | Set `APP_DOMAIN` at build time (see `next.config.mjs`) |
| Function URL returns 403 even through CloudFront | Newer AWS accounts may also need `lambda:InvokeFunction` permission on the function URL. Update the SAM CLI and redeploy. |
| Delete a stack | `aws cloudformation delete-stack --stack-name valuehq-dev`. Empty its assets bucket first. The DynamoDB table is kept. |
