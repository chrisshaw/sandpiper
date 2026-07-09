[![API Healthcheck](https://github.com/National-Tutoring-Observatory/sandpiper/actions/workflows/api-healthcheck.yml/badge.svg)](https://github.com/National-Tutoring-Observatory/sandpiper/actions/workflows/api-healthcheck.yml)

## Getting Started

Make sure you have followed the "Setup: Prerequisites" here: https://github.com/National-Tutoring-Observatory/RnD. You will need Node.js and Yarn.js installed first.

### Installation

Install the dependencies:

```bash
yarn
```

### Quick start (local)

From a clean checkout to a logged-in user:

```bash
yarn                                   # 1. install

cp .env.example .env                   # 2. env — set the local values (see "Environment")

# 3. database: single-node Mongo replica set with the app's root user
docker run -d --name sandpiper-mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
sleep 5 && docker exec sandpiper-mongo mongosh --quiet --eval '
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });
  sleep(2000);
  db.getSiblingDB("admin").createUser({ user: "root", pwd: "example", roles: [{ role: "root", db: "admin" }] });
'

yarn local:start                       # 4. build + run redis, server, workers
```

**5. Become a local user: open http://localhost:5173/dev/login once.**

That URL is the entire local login story. There is no password and no GitHub app locally. Visiting it creates your account (super admin, a personal workspace, all feature flags on) if it does not exist, signs you in, and drops you on the dashboard. Visit it again any time you need a fresh session. See [Becoming a local user](#becoming-a-local-user) for details.

Steps 2 and 3 are one-time. After that, becoming a user is just steps 4 and 5 (`docker start sandpiper-mongo` first if the container is stopped).

### Environment

Copy the example env file:

```bash
cp .env.example .env
```

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
LLM_PROVIDER='AI_GATEWAY'
AUTH_CALLBACK_URL='http://localhost:5173/auth/callback'
SUPER_ADMIN_GITHUB_ID='1'
```

`SUPER_ADMIN_GITHUB_ID` must be an integer even locally: the server parses it on boot to seed a super admin, and a blank value crashes startup. Any integer is fine when you are not using real GitHub OAuth. Annotation runs need a real `LLM_PROVIDER` key, but browsing and creating projects do not.

#### LLM providers

`LLM_PROVIDER` selects a provider from `app/modules/llm/providers`:

- **`AI_GATEWAY`** — an OpenAI-compatible gateway (LiteLLM in production). Set `AI_GATEWAY_BASE_URL` + `AI_GATEWAY_KEY`.
- **`BEDROCK`** — talks to **AWS Bedrock directly, no gateway or sidecar**. The model codes in `app/config/ai_gateway.json` are mapped to Bedrock inference profiles in `app/config/bedrock_models.json`. Auth, in order of precedence:
  1. `BEDROCK_API_KEY` — a Bedrock API key (bearer token), the simplest per-user option;
  2. `AWS_KEY` + `AWS_SECRET` — IAM access keys (same vars as the S3 adapter);
  3. nothing set — the default AWS credential chain (`~/.aws`, IAM role).

  Set `AWS_REGION` (defaults to the region in `bedrock_models.json`). Example local config:

  ```bash
  LLM_PROVIDER='BEDROCK'
  AWS_REGION='us-east-2'
  BEDROCK_API_KEY='...'        # or AWS_KEY/AWS_SECRET, or rely on ~/.aws
  ```

  Spend reporting works the same as any provider: cost is computed from token usage × `ai_gateway.json` pricing and written to the billing ledger — no LiteLLM required.

### Database

The app uses MongoDB transactions, which require a replica set, so a standalone `mongod` will fail. Run a single-node replica set in Docker:

```bash
docker run -d --name sandpiper-mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all

# Wait a few seconds for mongod to accept connections, then initiate the set
# and create the app user:
docker exec sandpiper-mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
docker exec sandpiper-mongo mongosh --quiet --eval 'db.getSiblingDB("admin").createUser({user:"root",pwd:"example",roles:[{role:"root",db:"admin"}]})'
```

Reuse the container later with `docker start sandpiper-mongo`.

### Running

Development, with hot reload (three terminals):

```bash
yarn local:redis     # Redis (redis-memory-server)
yarn app:dev         # App on http://localhost:5173
yarn workers:dev     # Workers (only needed for annotation jobs)
```

Prod-like, one command:

```bash
yarn local:start     # builds, then runs Redis + server + workers
```

`local:start` does not manage MongoDB, so start the container above first.

### Becoming a local user

There is one way to log in locally, and it is a single action:

```
open http://localhost:5173/dev/login
```

This dev-only route (`app/modules/authentication/containers/devLogin.route.tsx`, disabled when `NODE_ENV=production`) is idempotent and does everything in one shot:

- finds or creates the `dev@localhost` user, a `SUPER_ADMIN` with a personal workspace, onboarding already complete;
- grants every feature flag (so all gated UI is visible);
- sets the session cookie and redirects to the dashboard.

You do not seed a user, run a CLI, or set up an OAuth app. Just open the URL. Open it again whenever you want a fresh session.

Real GitHub OAuth is only needed if you want to exercise the actual sign-in flow: set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and your GitHub numeric ID as `SUPER_ADMIN_GITHUB_ID`, then use the normal sign-in page instead of `/dev/login`.
