# Running Sandpiper locally

This fork tracks [National-Tutoring-Observatory/sandpiper](https://github.com/National-Tutoring-Observatory/sandpiper) and pulls from it regularly. To keep merges clean, **everything local-specific lives in this file, in `.env.local.example`, and in `localMode/`** — upstream's source, `README.md`, `.env.example`, and `package.json` are left untouched.

There is exactly one supported way to run locally. It is deliberately opinionated: no alternatives, no branching paths, nothing to choose.

## Quick start

Three one-time steps, then one command forever after.

```bash
# 1. install
yarn

# 2. env — copy the local example, then fill in SESSION_SECRET and PROJECT_ROOT
cp .env.local.example .env

# 3. database — a single-node Mongo replica set with the app's root user.
#    The app uses transactions, which a standalone mongod cannot serve.
docker run -d --name sandpiper-mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
sleep 5 && docker exec sandpiper-mongo mongosh --quiet --eval '
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });
  sleep(2000);
  db.getSiblingDB("admin").createUser({ user: "root", pwd: "example", roles: [{ role: "root", db: "admin" }] });
  db.getSiblingDB("admin").createUser({ user: "ci_user", pwd: "ci_password", roles: [{ role: "readWriteAnyDatabase", db: "admin" }, { role: "dbAdminAnyDatabase", db: "admin" }] });
'
```

The second user is what `yarn test` authenticates as (`.env.ci`); without it every test file fails at connect with `Authentication failed`.

Then, every time:

```bash
node localMode/bin/quickstart.js
```

That starts the Mongo container, bootstraps billing, builds the app, and runs Redis, the server, and the workers.

**Finally, become a user: open <http://localhost:5173/signup> and click the GitHub sign-up button.**

That button is the entire local login story — no password, no GitHub app. While `GITHUB_CLIENT_ID` is unset, the fork registers a local strategy over the "github" name (see `app/storageAdapters/devAuth/`), so upstream's own sign-in flow creates your account (super admin, a personal workspace, every feature flag on) if it does not exist and signs you in. Click it again any time you want a fresh session.

## Billing

Sandpiper's billing system assumes a hosted deployment: a default billing plan exists, every team is assigned one, and credits are metered because UPchieve fronts the LLM bill. A local install has none of that, and upstream fails in two places — `estimateCost` throws `No billing plan found` when creating a run, and once a team's credits hit zero every model call throws `InsufficientCreditsError`.

When you point Sandpiper at your own LLM account you already pay the provider directly, so there is nothing to meter. `quickstart.js` runs [`localMode/seedBilling.ts`](localMode/seedBilling.ts), which gives each team:

- a default plan with **`markupRate: 1`**, so recorded spend equals what your provider actually charges you (upstream's seeded plan applies a 1.5× margin);
- a credit balance large enough that enforcement never fires.

It is idempotent, so re-running `quickstart.js` tops your credits back up. On a brand-new database there is no team yet, so the first run only creates the plan — your workspace picks it up when you sign in, and the next `quickstart.js` grants the credits.

You still see spend. `BILLING_ENABLED` stays unset, which hides the Stripe top-up UI, but as a super admin you can read the billing page and every cost is recorded to the ledger.

> This is why there is only one way to start the app. Running `yarn app:dev` or `yarn local:start` directly skips the billing bootstrap, and you get `No billing plan found` the first time you create a run.

## Environment

[`.env.local.example`](.env.local.example) is a complete, working local config — copy it to `.env` and fill in the two values it asks for. Upstream's `.env.example` documents the _hosted_ deployment; you do not need it.

```bash
cp .env.local.example .env
```

Only two values need filling: `SESSION_SECRET` (`openssl rand -hex 64`) and `PROJECT_ROOT` (the absolute path to this repo). No AWS keys, no GitHub OAuth app.

Two gotchas the file also calls out. `SUPER_ADMIN_GITHUB_ID` must parse as an integer even locally, because the server reads it on boot to seed a super admin and a blank value crashes startup — any integer is fine when you are not using real GitHub OAuth. And annotation runs need working Bedrock credentials, though browsing and creating projects do not.

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

## How the fork stays mergeable

The rule: an edit to an upstream source file is a load-bearing patch on someone else's private API, so anything local-specific lives in new files upstream has never heard of. The mechanisms:

- **The storage-adapters auto-import is the fork's registration hook.** `app/adapters.js` auto-imports every directory under `app/storageAdapters` into the generated `storage.ts`, loaded by both the server and the workers at startup. Two fork directories piggyback on it without registering any storage adapter: [`llmProviders`](app/storageAdapters/llmProviders/index.ts) imports the Bedrock LLM provider (instead of editing the provider list in `app/modules/llm/llm.ts`), and [`devAuth`](app/storageAdapters/devAuth/index.ts) re-registers the `"github"` auth strategy with a local dev-login bypass (remix-auth's registry is name-keyed and last-write-wins), so no dev-login route exists at all.
- **Serving session files under the LOCAL storage adapter.** The LOCAL adapter's `request()` returns a relative `/storage/...` URL that upstream has no route for (S3 returns a presigned URL, so hosted deployments never notice). Instead of patching the session viewer, the fork registers [`serveStorage.route.tsx`](app/modules/storage/containers/serveStorage.route.tsx) at `storage/*` — the single added line in `app/routes.ts` — which authorizes against the project in the path and serves the file.
- **The human-annotations feature (typed values, per-session templates) lives in fork-owned helpers.** Upstream's helpers, tests, and the worker's per-utterance loop are pristine. The feature enters through three seams: the template route calls [`buildAnnotationTemplate`](app/modules/humanAnnotations/helpers/buildAnnotationTemplate.ts) (which delegates to upstream's builders for per-utterance), the upload action calls [`buildAnnotationSchemaForRunSet`](app/modules/humanAnnotations/services/buildAnnotationSchemaForRunSet.server.ts), and the worker calls [`applyHumanAnnotationExtensions`](app/modules/humanAnnotations/helpers/applyHumanAnnotationExtensions.ts) _after_ upstream's loop — per-session rows have no `sequence_id`, so the untouched loop no-ops on them and the fork call writes the session-level annotations and coerces typed values. Docs for the feature live in [`documentation/humanAnnotationsTyped.md`](documentation/humanAnnotationsTyped.md), auto-published by the in-app docs loader.
- **Claude Code worktrees.** `vitest.config.ts` and `eslint.config.js` carry a `**/.claude/**` exclude so full repo copies under `.claude/worktrees` don't run every test twice or trip typescript-eslint. These two config edits are accepted — the files rarely churn. If you ever want worktrees out of the repo instead, `.claude/hooks/create-worktree.sh` and `cleanup-worktree.sh` are ready to wire into `.claude/settings.json` as `WorktreeCreate`/`WorktreeRemove` hooks.

What still touches upstream files, deliberately: one route line in `app/routes.ts`, six lines of call-site swaps in the two human-annotations containers and the upload worker, one cross-link line in `documentation/humanAnnotations.md`, the `@aws-sdk/client-bedrock-runtime` dependency in `package.json`/`yarn.lock`, and the two tooling excludes above.

## Real GitHub OAuth

Only needed if you want to exercise the actual sign-in flow: set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and your GitHub numeric ID as `SUPER_ADMIN_GITHUB_ID`. A non-empty `GITHUB_CLIENT_ID` automatically disables the local login bypass, so the same button talks to real GitHub.
