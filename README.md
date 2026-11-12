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
9. [Background workers](#background-workers)
10. [Configuration](#configuration)
11. [Project layout](#project-layout)
12. [Costs](#costs)
13. [Troubleshooting](#troubleshooting)

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
| `reset-password <email> --password "<pw>"` | Set a specific password |
| `set-role <email> <role>` | Change someone's role. A workspace always keeps at least one admin. |

`--env` defaults to `local`. For `dev` and `prod` the command always uses the `personal` AWS profile and checks the account (see [Which AWS account](#which-aws-account)).

### Passwords

Every person has an email and a password; there are no invite emails. You choose the password and share it with them privately.

**When you add someone**, either type the password when asked (hidden, twice), or give it in the command:

```bash
# asks: "Password:" then "Type it again:"
npm run users -- add sam@acme.com --name "Sam Lee" --env dev

# or set it directly
npm run users -- add sam@acme.com --name "Sam Lee" --password "blue-fish" --env dev

# operators: put --operator last
npm run users -- add azeem@valuehq.com --name "Azeem" --password "blue-fish" --operator --env dev
```

**To change a password later:**

| Who | How |
|---|---|
| Anyone, their own | In the app: **Settings › Your profile › Change password** (needs the current one) |
| You, from the command line | `npm run users -- reset-password sam@acme.com --env dev` (asks) or add `--password "new-one"` |
| An org's admin, for their people | **Settings › Members › Reset password** |
| An operator, for anyone in any org | **Admin console › the org › People**: type it in **New password** and **Save** (leave it empty to keep the current one) |

**Forgot your own operator password?** Use `reset-password` from your Mac; it doesn't need the old one.

Passwords need at least 4 characters. That's deliberately short for demos; raise `minPasswordLength` in `config/auth.ts` before real customers sign in. Passwords are stored hashed (scrypt), so nobody, including you, can look one up; you can only set a new one.

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
npm run users -- add you@valuehq.com --name "Your Name" --operator                          # local; asks for a password
npm run users -- add you@valuehq.com --name "Your Name" --password "your-pw" --operator --env dev   # deployed dev
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

**Crawls are operator-only.** Org admins and members can't start or re-run a crawl; they see the progress banner on Home and My company, and the drafted fields. In AWS the profile is built by the [background workers](#background-workers). Locally (no workers) a quick in-app job reads each company link instead, with plain HTML parsing; it never overwrites a field a person filled.

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

After the first deploy of an environment, add yourself there as an operator (each environment has its own database, so do this once for dev and once for prod):

```bash
npm run users -- add you@valuehq.com --name "Your Name" --operator --env dev   # asks for a password
```

Then sign in at the printed link. See [Passwords](#passwords) for setting and changing passwords.

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
- **Build company profile** (`build-profile`): the local stand-in for website reading. Started when an operator creates an org without the workers available. It reads each company source and drafts the empty profile fields.

To add a job type:
1. Add its steps in `src/jobs/` (or a new branch in `finish`).
2. If its shape differs (not "one step per source"), add a state machine in `template.yaml`.
3. Add a start function in `src/server/jobs.ts`.

## Background workers

Long-running research jobs, such as reading a whole website, run in a separate **workers stack** (`valuehq-workers-<env>`), not in the app. They're Python, so they can use specialized packages, and they deploy on their own.

```
App (Next.js)            starts a job: writes the job record, starts the state machine
  │
  ▼
Step Functions           valuehq-<env>-website-ingest:  Crawl → (Summarize) → done, or MarkFailed
  │
  ▼
Fargate containers       workers/ (Python): Scrapy crawler, Claude summary
  │                       ├─ every page and file → S3 data bucket (stored once, by content)
  │                       └─ progress, report, summary → the app's DynamoDB table (job record, company profile)
  ▼
CloudWatch Logs          /valuehq/<env>/workers (JSON lines, one per event)
```

The app's **Background jobs** page shows worker progress live, because the workers write to the same job record the app reads.

### First-time setup (per environment)

1. Deploy the app first (`npm run deploy -- dev`). The workers write to its table.
2. Start Docker Desktop, then deploy the workers. The first image build takes a few minutes; later deploys skip the build when `workers/` hasn't changed.
   ```bash
   npm run deploy:workers -- dev
   ```
3. Store your Anthropic API key in Secrets Manager. The summary step reads it; nothing else does. Paste the key when asked:
   ```bash
   read -rs KEY && aws secretsmanager create-secret --profile personal --region us-east-1 \
     --name valuehq/dev/anthropic --secret-string "$KEY" && unset KEY
   ```
   To replace it later, use `put-secret-value` with the same `--secret-id valuehq/dev/anthropic`.
4. Redeploy the app once (`npm run deploy -- dev`), so it knows about the workers.

After that, GitHub deploys the workers by itself whenever `workers/` or `infra/workers.yaml` changes (workflow **Deploy workers**). The app's deploy skips worker-only changes.

### Using it

| Where | What |
|---|---|
| **Admin console › New org** | With **Build their profile** on and a website given, the org's site is crawled (up to the max pages you set), then Claude summarizes it and fills the empty profile fields. |
| **Admin console › org › Website crawl** | The last crawl: its settings, live progress, report, Claude summary and where it's stored, plus earlier crawls. **Re-run crawl** repeats it with the same settings (and **Re-run on the whole site** if it was limited to some paths). Below that, start a new crawl with different settings: website, max pages, max clicks from the start page, include/exclude paths, only some paths, breadth or depth first, JavaScript rendering, summary on or off. |

Only operators can start or re-run crawls.

### What customers see

Customers (org admins, members and viewers) see plain progress, never the technical detail. The rules are in `src/lib/job-view.ts`.

| When | Home and My company | Background jobs page | Sidebar |
|---|---|---|---|
| Crawl running | Blue banner: “We’re building your company profile. Reading your website (212 pages so far)…”, then “…summarizing what you do and how you price” | “Reading your website”, two steps with In progress / Done | Count badge |
| Finished, fields drafted | Purple banner: “We drafted parts of your company profile… We filled in: What we do, Pricing model…”, until someone edits and saves the profile | Done | — |
| Crawl failed, or nothing could be read | Amber banner for 14 days: “We couldn’t read your website this time. Our team can see this and will follow up; there’s nothing you need to do.” | “Our team is on it” | Count badge for 3 days |

A crawl that missed some pages but still produced a summary counts as done for customers. Operators still see the missed pages in the report.

Operators see everything: on the org's **Website crawl** section, and on the org's Background jobs page while working inside it. That covers step detail, the crawl report with failed URLs and reasons, errors, token counts and the Step Functions link. The admin console's **Orgs** page counts orgs whose profile job needs attention, since customers are told the team will follow up.

Path rules are globs on the URL path: `*` matches within one segment, `**` matches anything below, and a plain path like `/docs` also covers everything under it. Logins, carts, account pages and feeds are always skipped (`DEFAULT_EXCLUDE` in `workers/valuehq_workers/crawl/config.py`).

### How a crawl works

- **Toolkit:** [Scrapy](https://scrapy.org) does the crawling (scheduling, robots.txt, redirects, throttling, retries); [scrapy-playwright](https://github.com/scrapy-plugins/scrapy-playwright) renders JavaScript when asked; [trafilatura](https://trafilatura.readthedocs.io) turns each page into clean markdown.
- **Order:** breadth first (default) fetches overview pages before deep ones; depth first follows each section down. The page limit and depth limit are enforced in the spider, so the report can say what was left out.
- **Also seeds from** `/sitemap.xml`, unless it's a partial re-crawl.
- **Files:** PDFs, Word, PowerPoint, Excel and CSV files linked from the site are downloaded and stored (their text extraction comes with the file-upload job, using Docling). Images, media and code are skipped.
- **No repeated downloads:** each page or file is stored by the SHA-256 of its bytes, so the same content is stored once. A re-crawl sends `If-None-Match` / `If-Modified-Since` from the last crawl, and pages that answer “not modified” keep their stored copy.
- **Partial re-crawl:** with paths given, only those paths are fetched. The new crawl's manifest carries over everything else from the previous crawl, so the latest crawl always describes the whole site.
- **Retry policy:** each URL is retried up to 3 times straight away on timeouts, connection errors, 408, 429 and 5xx, with auto-throttling slowing down when the site struggles. What still fails gets one more round after a 60-second pause, one request at a time, with a longer timeout. Never retried: 401, 403, 404 and other 4xx, and robots.txt refusals. Step Functions separately retries starting a container (3 times, with backoff).
- **Report:** saved with every crawl and summarized on the job: pages, files, unchanged, failed, success rate, failures by reason (with the URLs and attempts), links not followed and why, duration, and whether the page limit stopped it. A crawl under 90% success, or with no pages, is marked **Needs your help**.

### Crawl explorer (operators)

Every stored crawl can be browsed from the admin console: **Crawls** in the top bar (all orgs, filter by running or needing attention), **org › Crawls** (every site and crawl stored for that org), or **Open in crawl explorer** on the org page. The explorer reads straight from the data bucket and shows:

| View | What it shows |
|---|---|
| Header | Pages, files, unchanged, kept from earlier, failed, success rate, total time, average fetch time, Claude tokens |
| **Folders** | Every page by URL path, colour-coded by status (fetched, unchanged, kept from an earlier crawl, failed, skipped), with fetch time and estimated Claude tokens. Each folder has **re-crawl** |
| **Link map** | Each page under the page it was first found on, with how many pages it led to |
| **Failed** | Every failed page with the reason, HTTP status, error and number of tries |
| **Slowest** | The 100 slowest downloads |
| **Search** | Full-text search over the crawl's pages: words must all appear; `"quotes"` for an exact phrase |
| **Report** | Timings, bytes downloaded, failures and skipped links by reason (with examples), retry policy, settings, and the Claude run (model, prompt version, tokens) |

Click any page to open it: status, HTTP code, tries, fetch and processing time, clicks from the start page, size, when it was fetched, the page it was found on, every page linking to it and every link on it (with each target's status), the estimated Claude tokens it used, and its extracted text or original HTML.

**Re-crawling from the explorer** (operators only): the whole site, a folder (**re-crawl** next to it), the pages you tick (**Re-crawl selected**), one page (**Re-crawl this page**), or all failed pages (**Retry N failed**). It uses the settings of the crawl you're viewing. Only those pages are fetched; everything else is carried over, so the new crawl still covers the whole site. Tick **summarize again after** to re-run the Claude summary too.

Notes:
- Per-page Claude tokens are estimates: the summary sends many pages in one request, so each page gets its share of the input tokens by length. Pages not sent to Claude show none.
- Search loads the crawl's `corpus.jsonl.gz` (each page's text, up to 30,000 characters per page). It's fine for thousands of pages; a search service (or embeddings) is the next step past that.
- Crawls made before the explorer existed have no link map, timings or search file. Re-crawl them to get those.
- Locally, set `DATA_DIR=.data` in `.env.local` so the explorer reads crawls made with the workers on your Mac.

### Where the data goes

```
s3://valuehq-<env>-data-<account>/workspaces/<orgId>/
  website/<host>/
    blobs/raw/<sha256>.html.gz | .pdf | …    original bytes, stored once
    blobs/text/<sha256>.md                   clean markdown of each page
    crawls/<crawlId>/config.json             what was asked for
    crawls/<crawlId>/manifest.jsonl          one line per URL: status, blob, ETag, fetch time, depth, tries, found on, links
    crawls/<crawlId>/report.json             the full report
    crawls/<crawlId>/corpus.jsonl.gz         every page's text in one file, for search
    latest.json                              the newest usable crawl
  analyses/company-summary/<promptVersion>/<runId>.json    model answer, pages read, tokens, prompt version
  analyses/company-summary/latest.json
```

Crawl ids are UTC timestamps (`2026-11-12T06-30-05Z`), so the folder listing is the history. All paths are defined in `workers/valuehq_workers/layout.py`.

### The Claude summary

- Picks the most useful pages from the latest crawl (home, pricing, product, about, customers, …; blogs and legal pages last), up to about 120,000 characters, and asks Claude to fill a fixed schema. That schema covers category, what they do, who they sell to, how it works, products, pricing model and tiers, proof, evidence URLs, and gaps.
- The answer is saved in full in S3. Empty company profile fields are filled (Category, What we do, Who we sell to, How it works, **Pricing model**, Proof), attributed to “ValueHQ”. Nothing a person wrote is overwritten.
- **Changing the prompt:** add `prompts/company_summary_v2.md` and set `PROMPT_VERSION = "v2"` in `analyze/company_summary.py`. Don't edit v1: every stored result records the prompt version and model that produced it. Re-running the summary reads the stored crawl and downloads nothing.
- **Model:** set by the `AnthropicModel` parameter in `infra/workers.yaml` (default `claude-sonnet-5-5`).

### Running workers on your Mac

```bash
cd workers
uv venv && uv pip install -e .               # once
uv run playwright install chromium           # once, only for --render-js
export APP_ENV=local TABLE_NAME=valuehq-local DYNAMODB_ENDPOINT=http://localhost:8000 DATA_DIR=../.data
export ANTHROPIC_API_KEY=sk-ant-...          # locally the key comes from the environment
uv run python -m valuehq_workers ingest --workspace <orgId> --url acme.com --max-pages 50
uv run python -m valuehq_workers crawl  --workspace <orgId> --url acme.com --scope /pricing
uv run python -m valuehq_workers analyze --workspace <orgId> --url acme.com
npm run test:workers                         # unit tests (no packages needed)
```

The org id is in the admin console's address bar (`/admin/orgs/<orgId>`). Crawls land in `.data/` (ignored by git). The local app doesn't start worker jobs itself: provisioning falls back to the quick in-app profile job.

### Debugging a job

- **The job page** shows each step's detail, the crawl report and the summary.
- **Step Functions console:** each job links to its execution, which shows each step's input, output and errors.
- **Logs:** CloudWatch Logs › `/valuehq/<env>/workers`. In Logs Insights, filter by job: `fields @timestamp, msg, level | filter jobId = "<jobId>" | sort @timestamp`.
- **A failed container** marks the job **Failed** with the reason. The step's detail shows the error.

### Adding a research job

1. Add a module under `workers/valuehq_workers/` with a `run_…(job, settings)` function. Use `JobProgress` for steps, `open_storage` for files and `layout.py` for paths.
2. Add a command for it in `__main__.py`.
3. Add a state machine (or a branch) in `infra/workers.yaml` that runs the container with that command.
4. Add a `start…` function in `src/server/jobs.ts`, plus a job type in `src/server/types.ts`.

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
workers/                background workers (Python): crawl/, analyze/, Dockerfile, tests/
infra/workers.yaml      the workers stack: VPC, Fargate, S3 data bucket, Step Functions, logs
infra/github-oidc.yaml  one-time GitHub → AWS deploy role
template.yaml           the app stack (SAM)
samconfig.toml          dev and prod deploy settings
.github/workflows/      CI and deploy pipelines
```

To add more shadcn/ui components: `npx shadcn@latest add dialog` (settings are in `components.json`).

## Costs

### What it costs

At demo traffic, each environment costs a few dollars a month or less:
- **Lambda, DynamoDB and Step Functions:** mostly inside the free tier.
- **CloudFront and S3:** cents.

With nobody using it, the cost is close to zero.

Workers cost only while a job runs (there's no NAT gateway or idle server):
- **Crawl:** a Fargate container with 1 vCPU and 3 GB costs roughly 5–6¢ an hour, so most sites cost a few cents to crawl. Larger sites run longer.
- **Claude summary:** usually the largest cost per company. Each run records its input and output tokens on the job.
- **S3:** fractions of a cent per crawl.
- **The daily cost snapshot:** about 4¢ a run in Cost Explorer requests per environment (turn it off with the `CostsSchedule` parameter in `infra/workers.yaml`).

### Tracking costs (Admin › Costs)

The admin console's **Costs** page shows ValueHQ's spend, refreshed daily by the workers (`python -m valuehq_workers costs`, 13:17 UTC), or on demand with **Refresh now**:

- this month so far, a month-end estimate, and last month
- the last 30 days, day by day, split into AWS and Anthropic
- AWS by service (Lambda, Fargate, S3, DynamoDB, CloudFront, Step Functions, Secrets Manager, CloudWatch, …) and by environment
- Anthropic by model
- an estimate per org: its crawl time and Claude tokens this month, with this month's Fargate and Anthropic spend split by its share (shared costs like the app servers aren't split)

**AWS:** the `personal` account runs other projects too, so only resources tagged `app=valuehq` count. Both stacks tag everything they create (`samconfig.toml` tags and `--tags` in `scripts/deploy-workers.sh`), crawl containers inherit the tags, and the deploy script tags the ECR repository and the Anthropic secrets. Cost Explorer only reports on tags you activate, once:

```bash
aws ce update-cost-allocation-tags-status --profile personal \
  --cost-allocation-tags-status TagKey=app,Status=Active TagKey=env,Status=Active
```

If that says the tag isn't found, wait a day after the first deploy (AWS has to see the tags in billing data first), or activate them in the Billing console › **Cost allocation tags**. Costs are tagged only from activation onward, and Cost Explorer lags by up to a day.

**Anthropic:** costs come from the Admin API cost report, which needs an **Admin API key** (`sk-ant-admin…`, created by an organization admin in the Anthropic Console › Settings › Admin keys). It's separate from the project's normal key. Store it once, for all environments:

```bash
read -rs KEY && aws secretsmanager create-secret --profile personal --region us-east-1 \
  --name valuehq/anthropic-admin --secret-string "$KEY" --tags Key=app,Value=valuehq && unset KEY
```

Without it, the Costs page still shows AWS and each org's tokens, and says the Anthropic figures are missing.

**Keeping Anthropic costs separate from future projects:** right now the Anthropic organization is used only by ValueHQ, so its whole bill counts. Before another project uses it, give ValueHQ its own Anthropic **workspace**:
1. In the Anthropic Console, create a workspace named ValueHQ.
2. Create an API key in it, and replace the stored key with it (`put-secret-value` for `valuehq/dev/anthropic`, and prod).
3. Deploy the workers once with its id. It's kept on later deploys:
   ```bash
   ANTHROPIC_WORKSPACE_ID=wrkspc_... npm run deploy:workers -- dev
   ```

Costs from before the switch stay under the old (default) workspace.

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
