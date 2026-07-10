# Running Sandpiper locally

This fork tracks [National-Tutoring-Observatory/sandpiper](https://github.com/National-Tutoring-Observatory/sandpiper) and pulls from it regularly. To keep merges clean, **everything local-specific lives in this file and in `localMode/`** — upstream's source, `README.md`, and `package.json` are left untouched.

There is exactly one supported way to run locally. It is deliberately opinionated: no alternatives, no branching paths, nothing to choose.

## Quick start

Three one-time steps, then one command forever after.

```bash
# 1. install
yarn

# 2. env — copy the example and fill in the local values (see Environment, below)
cp .env.example .env

# 3. database — a single-node Mongo replica set with the app's root user.
#    The app uses transactions, which a standalone mongod cannot serve.
docker run -d --name sandpiper-mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
sleep 5 && docker exec sandpiper-mongo mongosh --quiet --eval '
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });
  sleep(2000);
  db.getSiblingDB("admin").createUser({ user: "root", pwd: "example", roles: [{ role: "root", db: "admin" }] });
'
```

Then, every time:

```bash
node localMode/bin/quickstart.js
```

That starts the Mongo container, bootstraps billing, builds the app, and runs Redis, the server, and the workers.

**Finally, become a user: open <http://localhost:5173/dev/login>.**

That URL is the entire local login story — no password, no GitHub app. Visiting it creates your account (super admin, a personal workspace, every feature flag on) if it does not exist, signs you in, and drops you on the dashboard. Visit it again any time you want a fresh session.

## Billing

Sandpiper's billing system assumes a hosted deployment: a default billing plan exists, every team is assigned one, and credits are metered because UPchieve fronts the LLM bill. A local install has none of that, and upstream fails in two places — `estimateCost` throws `No billing plan found` when creating a run, and once a team's credits hit zero every model call throws `InsufficientCreditsError`.

When you point Sandpiper at your own LLM account you already pay the provider directly, so there is nothing to meter. `quickstart.js` runs [`localMode/seedBilling.ts`](localMode/seedBilling.ts), which gives each team:

- a default plan with **`markupRate: 1`**, so recorded spend equals what your provider actually charges you (upstream's seeded plan applies a 1.5× margin);
- a credit balance large enough that enforcement never fires.

It is idempotent, so re-running `quickstart.js` tops your credits back up. On a brand-new database there is no team yet, so the first run only creates the plan — your workspace picks it up when you sign in, and the next `quickstart.js` grants the credits.

You still see spend. `BILLING_ENABLED` stays unset, which hides the Stripe top-up UI, but as a super admin you can read the billing page and every cost is recorded to the ledger.

> This is why there is only one way to start the app. Running `yarn app:dev` or `yarn local:start` directly skips the billing bootstrap, and you get `No billing plan found` the first time you create a run.

## Environment

For a fully local setup (no AWS, no GitHub OAuth), the values that matter are:

```bash
STORAGE_ADAPTER='LOCAL'
DOCUMENTS_ADAPTER='LOCAL'
DOCUMENT_DB_LOCAL='true'
DOCUMENT_DB_CONNECTION_STRING='localhost:27017/sandpiper?authSource=admin&directConnection=true'
DOCUMENT_DB_USERNAME='root'
DOCUMENT_DB_PASSWORD='example'
SESSION_SECRET='<openssl rand -hex 64>'
PROJECT_ROOT='<absolute path to this repo>'
REDIS_LOCAL='true'
LLM_PROVIDER='BEDROCK'
AUTH_CALLBACK_URL='http://localhost:5173/auth/callback'
SUPER_ADMIN_GITHUB_ID='1'
```

`SUPER_ADMIN_GITHUB_ID` must be an integer even locally: the server parses it on boot to seed a super admin, and a blank value crashes startup. Any integer is fine when you are not using real GitHub OAuth. Annotation runs need a real `LLM_PROVIDER` key, but browsing and creating projects do not.

Leave `BILLING_ENABLED` unset. See [Billing](#billing).

### LLM providers

`LLM_PROVIDER` selects a provider from `app/modules/llm/providers`:

- **`BEDROCK`** — talks to **AWS Bedrock directly, no gateway or sidecar**. The model codes in `app/config/ai_gateway.json` are mapped to Bedrock inference profiles in `app/config/bedrock_models.json`. Auth, in order of precedence:
  1. `BEDROCK_API_KEY` — a Bedrock API key (bearer token), the simplest per-user option;
  2. `AWS_KEY` + `AWS_SECRET` — IAM access keys (same vars as the S3 adapter);
  3. nothing set — the default AWS credential chain (`~/.aws`, IAM role).

  Set `AWS_REGION` (defaults to the region in `bedrock_models.json`). Example:

  ```bash
  LLM_PROVIDER='BEDROCK'
  AWS_REGION='us-east-2'
  BEDROCK_API_KEY='...'        # or AWS_KEY/AWS_SECRET, or rely on ~/.aws
  ```

- **`AI_GATEWAY`** — an OpenAI-compatible gateway (LiteLLM in production). Set `AI_GATEWAY_BASE_URL` + `AI_GATEWAY_KEY`.

Spend reporting works the same for either: cost is computed from token usage × `ai_gateway.json` pricing and written to the billing ledger.

## Real GitHub OAuth

Only needed if you want to exercise the actual sign-in flow: set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and your GitHub numeric ID as `SUPER_ADMIN_GITHUB_ID`, then use the normal sign-in page instead of `/dev/login`.
