# Run System Prompt Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the system prompt text(s) used at run creation time onto `run.snapshot.prompt`, and include them in the meta files emitted by run and run-set downloads.

**Architecture:** Add a generalized `getSystemPrompt(kind, annotationType)` helper that loads any of the six `workers/prompts/*.prompt.md` files via Vite `?raw` imports. Replace the existing single-purpose `getSystemPromptByAnnotationType` with this helper. In `buildRunSnapshot`, populate three new string fields on `snapshot.prompt` (`systemPrompt`, `verifySystemPrompt`, `adjudicateSystemPrompt`) — always set as `""` when not applicable. Extend the four meta exporters to emit the new keys.

**Tech Stack:** TypeScript, Mongoose, React Router v7, Vitest, Vite (`?raw` raw imports).

**Spec:** [`specs/2026-05-13-run-system-prompt-snapshot-design.md`](../specs/2026-05-13-run-system-prompt-snapshot-design.md)

**Commit conventions:** Branch is `issue/#2168` — include `Fixes #2168` in each commit message. **Never** add `Co-Authored-By: Claude` trailers.

---

## Task 1: Add the generalized `getSystemPrompt` helper

**Files:**

- Create: `app/modules/prompts/helpers/getSystemPrompt.ts`
- Create: `app/modules/prompts/__tests__/getSystemPrompt.test.ts`

### Step 1: Write the failing test

Create `app/modules/prompts/__tests__/getSystemPrompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import getSystemPrompt from "../helpers/getSystemPrompt";

describe("getSystemPrompt", () => {
  it("returns the annotation per-utterance prompt", () => {
    const prompt = getSystemPrompt("annotation", "PER_UTTERANCE");
    expect(prompt).toContain(
      'Each annotation must include an "\\_id" that exactly matches',
    );
  });

  it("returns the annotation per-session prompt", () => {
    const prompt = getSystemPrompt("annotation", "PER_SESSION");
    expect(prompt).toContain("Look over the whole session");
  });

  it("returns the verify per-utterance prompt", () => {
    const prompt = getSystemPrompt("verify", "PER_UTTERANCE");
    expect(prompt).toContain("Annotation Quality Auditor");
  });

  it("returns the verify per-session prompt", () => {
    const prompt = getSystemPrompt("verify", "PER_SESSION");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("returns the adjudicate per-utterance prompt", () => {
    const prompt = getSystemPrompt("adjudicate", "PER_UTTERANCE");
    expect(prompt).toContain("expert adjudicator");
  });

  it("returns the adjudicate per-session prompt", () => {
    const prompt = getSystemPrompt("adjudicate", "PER_SESSION");
    expect(prompt).toContain("expert adjudicator");
  });

  it("returns an empty string when annotationType is falsy", () => {
    // @ts-expect-error - intentionally testing defensive fallback
    expect(getSystemPrompt("annotation", undefined)).toBe("");
    // @ts-expect-error - intentionally testing defensive fallback
    expect(getSystemPrompt("annotation", "")).toBe("");
  });

  it("returns different content for annotation vs verify (PER_UTTERANCE)", () => {
    const annotation = getSystemPrompt("annotation", "PER_UTTERANCE");
    const verify = getSystemPrompt("verify", "PER_UTTERANCE");
    expect(annotation).not.toBe(verify);
  });
});
```

### Step 2: Run the test to verify it fails

Run: `yarn test app/modules/prompts/__tests__/getSystemPrompt.test.ts`
Expected: FAIL — module `../helpers/getSystemPrompt` does not exist.

### Step 3: Implement the helper

Create `app/modules/prompts/helpers/getSystemPrompt.ts`:

```ts
import type { AnnotationTypeOptions } from "~/modules/annotations/helpers/annotationTypes";
import adjudicatePerSession from "../../../../workers/prompts/adjudicatePerSession.prompt.md?raw";
import adjudicatePerUtterance from "../../../../workers/prompts/adjudicatePerUtterance.prompt.md?raw";
import annotatePerSession from "../../../../workers/prompts/annotatePerSession.prompt.md?raw";
import annotatePerUtterance from "../../../../workers/prompts/annotatePerUtterance.prompt.md?raw";
import verifyPerSession from "../../../../workers/prompts/verifyPerSession.prompt.md?raw";
import verifyPerUtterance from "../../../../workers/prompts/verifyPerUtterance.prompt.md?raw";

export type SystemPromptKind = "annotation" | "verify" | "adjudicate";

const SYSTEM_PROMPTS: Record<
  SystemPromptKind,
  Record<AnnotationTypeOptions, string>
> = {
  annotation: {
    PER_UTTERANCE: annotatePerUtterance,
    PER_SESSION: annotatePerSession,
  },
  verify: {
    PER_UTTERANCE: verifyPerUtterance,
    PER_SESSION: verifyPerSession,
  },
  adjudicate: {
    PER_UTTERANCE: adjudicatePerUtterance,
    PER_SESSION: adjudicatePerSession,
  },
};

export default function getSystemPrompt(
  kind: SystemPromptKind,
  annotationType: AnnotationTypeOptions,
): string {
  if (!annotationType) return "";
  return SYSTEM_PROMPTS[kind]?.[annotationType] ?? "";
}
```

### Step 4: Run the test to verify it passes

Run: `yarn test app/modules/prompts/__tests__/getSystemPrompt.test.ts`
Expected: PASS, all 8 tests green.

### Step 5: Commit

```bash
git add app/modules/prompts/helpers/getSystemPrompt.ts \
        app/modules/prompts/__tests__/getSystemPrompt.test.ts
git commit -m "Add generalized getSystemPrompt helper

Fixes #2168"
```

---

## Task 2: Replace the old helper and delete it

**Files:**

- Modify: `app/modules/prompts/containers/promptEditor.route.tsx`
- Delete: `app/modules/prompts/helpers/getSystemPromptByAnnotationType.ts`
- Delete: `app/modules/prompts/__tests__/getSystemPromptByAnnotationType.test.ts`

### Step 1: Update the import in `promptEditor.route.tsx`

Open `app/modules/prompts/containers/promptEditor.route.tsx`.

Change line 16 from:

```ts
import getSystemPromptByAnnotationType from "../helpers/getSystemPromptByAnnotationType";
```

to:

```ts
import getSystemPrompt from "../helpers/getSystemPrompt";
```

### Step 2: Update the call site

In the same file, locate the existing call (around line 211):

```ts
const systemPrompt = getSystemPromptByAnnotationType(
  prompt.data.annotationType,
);
```

Replace it with:

```ts
const systemPrompt = getSystemPrompt("annotation", prompt.data.annotationType);
```

### Step 3: Delete the old helper and its test

Run:

```bash
rm app/modules/prompts/helpers/getSystemPromptByAnnotationType.ts \
   app/modules/prompts/__tests__/getSystemPromptByAnnotationType.test.ts
```

### Step 4: Verify nothing else imports the deleted helper

Run: `grep -rn "getSystemPromptByAnnotationType" app/ workers/`
Expected: no matches.

### Step 5: Typecheck and run prompt tests

Run: `yarn typecheck`
Expected: passes.

Run: `yarn test app/modules/prompts/`
Expected: passes (the new `getSystemPrompt.test.ts` covers what the deleted test covered).

### Step 6: Commit

```bash
git add app/modules/prompts/containers/promptEditor.route.tsx \
        app/modules/prompts/helpers/getSystemPromptByAnnotationType.ts \
        app/modules/prompts/__tests__/getSystemPromptByAnnotationType.test.ts
git commit -m "Replace getSystemPromptByAnnotationType with getSystemPrompt

Fixes #2168"
```

---

## Task 3: Add the three new String fields to the run schema

**Files:**

- Modify: `app/lib/schemas/run.schema.ts`

### Step 1: Update the schema

Open `app/lib/schemas/run.schema.ts`. Locate the `snapshot.prompt` block (lines 37–44):

```ts
  snapshot: {
    prompt: {
      name: { type: String },
      userPrompt: { type: String },
      annotationSchema: [mongoose.Schema.Types.Mixed],
      annotationType: { type: String },
      version: { type: Number },
    },
```

Replace with:

```ts
  snapshot: {
    prompt: {
      name: { type: String },
      userPrompt: { type: String },
      annotationSchema: [mongoose.Schema.Types.Mixed],
      annotationType: { type: String },
      version: { type: Number },
      systemPrompt: { type: String },
      verifySystemPrompt: { type: String },
      adjudicateSystemPrompt: { type: String },
    },
```

### Step 2: Typecheck

Run: `yarn typecheck`
Expected: passes (this change adds optional Mongoose fields only; nothing else depends on them yet).

### Step 3: Commit

```bash
git add app/lib/schemas/run.schema.ts
git commit -m "Add system prompt fields to run snapshot schema

Fixes #2168"
```

---

## Task 4: Extend `buildRunSnapshot` to capture system prompts (TDD)

**Files:**

- Modify: `app/modules/runs/services/buildRunSnapshot.server.ts`
- Create: `app/modules/runs/__tests__/buildRunSnapshot.test.ts`

### Step 1: Write the failing tests

Create `app/modules/runs/__tests__/buildRunSnapshot.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/modules/prompts/prompt", () => ({
  PromptService: {
    findById: vi.fn(async () => ({
      _id: "prompt1",
      name: "Test Prompt",
      annotationType: "PER_UTTERANCE",
    })),
  },
}));

vi.mock("~/modules/prompts/promptVersion", () => ({
  PromptVersionService: {
    findOne: vi.fn(async () => ({
      _id: "promptVersion1",
      version: 3,
      userPrompt: "Some user prompt text",
      annotationSchema: [{ field: "foo" }],
    })),
  },
}));

vi.mock("~/modules/llm/modelRegistry", () => ({
  findModelByCode: vi.fn(() => ({
    name: "GPT-4o",
    provider: "openai",
  })),
}));

vi.mock("~/modules/prompts/helpers/getSystemPrompt", () => ({
  default: vi.fn(
    (kind: string, annotationType: string) =>
      `SYSTEM PROMPT (${kind}, ${annotationType})`,
  ),
}));

import buildRunSnapshot from "../services/buildRunSnapshot.server";

describe("buildRunSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseArgs = {
    promptId: "prompt1",
    promptVersionNumber: 3,
    modelCode: "gpt-4o",
    annotationType: "PER_UTTERANCE" as const,
    shouldRunVerification: false,
    isAdjudication: false,
  };

  it("captures the annotation system prompt", async () => {
    const snapshot = await buildRunSnapshot(baseArgs);
    expect(snapshot.prompt.systemPrompt).toBe(
      "SYSTEM PROMPT (annotation, PER_UTTERANCE)",
    );
  });

  it('leaves verifySystemPrompt as "" when shouldRunVerification is false', async () => {
    const snapshot = await buildRunSnapshot(baseArgs);
    expect(snapshot.prompt.verifySystemPrompt).toBe("");
  });

  it('leaves adjudicateSystemPrompt as "" when isAdjudication is false', async () => {
    const snapshot = await buildRunSnapshot(baseArgs);
    expect(snapshot.prompt.adjudicateSystemPrompt).toBe("");
  });

  it("captures the verify system prompt when shouldRunVerification is true", async () => {
    const snapshot = await buildRunSnapshot({
      ...baseArgs,
      shouldRunVerification: true,
    });
    expect(snapshot.prompt.verifySystemPrompt).toBe(
      "SYSTEM PROMPT (verify, PER_UTTERANCE)",
    );
    expect(snapshot.prompt.adjudicateSystemPrompt).toBe("");
  });

  it("captures the adjudicate system prompt when isAdjudication is true", async () => {
    const snapshot = await buildRunSnapshot({
      ...baseArgs,
      isAdjudication: true,
    });
    expect(snapshot.prompt.adjudicateSystemPrompt).toBe(
      "SYSTEM PROMPT (adjudicate, PER_UTTERANCE)",
    );
    expect(snapshot.prompt.verifySystemPrompt).toBe("");
  });

  it("captures all three system prompts when both flags are true", async () => {
    const snapshot = await buildRunSnapshot({
      ...baseArgs,
      shouldRunVerification: true,
      isAdjudication: true,
    });
    expect(snapshot.prompt.systemPrompt).toBe(
      "SYSTEM PROMPT (annotation, PER_UTTERANCE)",
    );
    expect(snapshot.prompt.verifySystemPrompt).toBe(
      "SYSTEM PROMPT (verify, PER_UTTERANCE)",
    );
    expect(snapshot.prompt.adjudicateSystemPrompt).toBe(
      "SYSTEM PROMPT (adjudicate, PER_UTTERANCE)",
    );
  });

  it("uses the provided annotationType for system prompt lookups", async () => {
    const snapshot = await buildRunSnapshot({
      ...baseArgs,
      annotationType: "PER_SESSION",
      shouldRunVerification: true,
    });
    expect(snapshot.prompt.systemPrompt).toBe(
      "SYSTEM PROMPT (annotation, PER_SESSION)",
    );
    expect(snapshot.prompt.verifySystemPrompt).toBe(
      "SYSTEM PROMPT (verify, PER_SESSION)",
    );
  });

  it("preserves the existing user-prompt and model fields", async () => {
    const snapshot = await buildRunSnapshot(baseArgs);
    expect(snapshot.prompt.name).toBe("Test Prompt");
    expect(snapshot.prompt.userPrompt).toBe("Some user prompt text");
    expect(snapshot.prompt.version).toBe(3);
    expect(snapshot.model).toEqual({
      code: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
    });
  });
});
```

### Step 2: Run the test to verify it fails

Run: `yarn test app/modules/runs/__tests__/buildRunSnapshot.test.ts`
Expected: FAIL — either the new args (`annotationType`, `shouldRunVerification`, `isAdjudication`) are not accepted, or `snapshot.prompt.systemPrompt` is undefined.

### Step 3: Update `buildRunSnapshot.server.ts`

Open `app/modules/runs/services/buildRunSnapshot.server.ts`. Replace the entire file with:

```ts
import type { AnnotationTypeOptions } from "~/modules/annotations/helpers/annotationTypes";
import { findModelByCode } from "~/modules/llm/modelRegistry";
import getSystemPrompt from "~/modules/prompts/helpers/getSystemPrompt";
import { PromptService } from "~/modules/prompts/prompt";
import type { AnnotationSchemaItem } from "~/modules/prompts/prompts.types";
import { PromptVersionService } from "~/modules/prompts/promptVersion";

/**
 * Snapshot sections that can be added to a run.
 * Stores complete frozen state of resources used in the run at creation time.
 */
export interface RunSnapshot {
  prompt: {
    name: string;
    userPrompt: string;
    annotationSchema: AnnotationSchemaItem[];
    annotationType: string;
    version: number;
    systemPrompt: string;
    verifySystemPrompt: string;
    adjudicateSystemPrompt: string;
  };
  model: {
    code: string;
    provider: string;
    name: string;
  };
}

interface BuildPromptSnapshotProps {
  promptId: string;
  promptVersionNumber: number;
  annotationType: AnnotationTypeOptions;
  shouldRunVerification: boolean;
  isAdjudication: boolean;
}

interface BuildModelSnapshotProps {
  modelCode: string;
}

async function buildPromptSnapshot({
  promptId,
  promptVersionNumber,
  annotationType,
  shouldRunVerification,
  isAdjudication,
}: BuildPromptSnapshotProps) {
  const prompt = await PromptService.findById(promptId);
  const promptVersion = await PromptVersionService.findOne({
    prompt: promptId,
    version: promptVersionNumber,
  });

  if (!promptVersion) {
    throw new Error(
      `Prompt version not found: ${promptId} v${promptVersionNumber}`,
    );
  }

  if (!prompt) {
    throw new Error(`Prompt not found: ${promptId}`);
  }

  return {
    name: prompt.name,
    userPrompt: promptVersion.userPrompt,
    annotationSchema: promptVersion.annotationSchema,
    annotationType: prompt.annotationType,
    version: promptVersion.version,
    systemPrompt: getSystemPrompt("annotation", annotationType),
    verifySystemPrompt: shouldRunVerification
      ? getSystemPrompt("verify", annotationType)
      : "",
    adjudicateSystemPrompt: isAdjudication
      ? getSystemPrompt("adjudicate", annotationType)
      : "",
  };
}

async function buildModelSnapshot({ modelCode }: BuildModelSnapshotProps) {
  const modelInfo = findModelByCode(modelCode);
  if (!modelInfo) {
    throw new Error(`Model not found: ${modelCode}`);
  }
  return {
    code: modelCode,
    provider: modelInfo.provider,
    name: modelInfo.name,
  };
}

export async function buildRunSnapshot({
  promptId,
  promptVersionNumber,
  modelCode,
  annotationType,
  shouldRunVerification,
  isAdjudication,
}: {
  promptId: string;
  promptVersionNumber: number;
  modelCode: string;
  annotationType: AnnotationTypeOptions;
  shouldRunVerification: boolean;
  isAdjudication: boolean;
}): Promise<RunSnapshot> {
  const snapshot: RunSnapshot = {
    prompt: await buildPromptSnapshot({
      promptId,
      promptVersionNumber,
      annotationType,
      shouldRunVerification,
      isAdjudication,
    }),
    model: await buildModelSnapshot({ modelCode }),
  };

  return snapshot;
}

export default buildRunSnapshot;
```

### Step 4: Run the test to verify it passes

Run: `yarn test app/modules/runs/__tests__/buildRunSnapshot.test.ts`
Expected: PASS, all 8 tests green.

### Step 5: Commit

```bash
git add app/modules/runs/services/buildRunSnapshot.server.ts \
        app/modules/runs/__tests__/buildRunSnapshot.test.ts
git commit -m "Capture system prompts in run snapshot

Fixes #2168"
```

---

## Task 5: Pass new args through `RunService.create`

**Files:**

- Modify: `app/modules/runs/run.ts`

### Step 1: Update the `buildRunSnapshot` call

Open `app/modules/runs/run.ts`. Locate the snapshot call inside `RunService.create` (lines 80–84):

```ts
const snapshot = await buildRunSnapshot({
  promptId: props.prompt,
  promptVersionNumber: props.promptVersion,
  modelCode: props.modelCode,
});
```

Replace with:

```ts
const snapshot = await buildRunSnapshot({
  promptId: props.prompt,
  promptVersionNumber: props.promptVersion,
  modelCode: props.modelCode,
  annotationType: props.annotationType,
  shouldRunVerification: !!props.shouldRunVerification,
  isAdjudication: !!props.isAdjudication,
});
```

### Step 2: Typecheck

Run: `yarn typecheck`
Expected: passes — `props.annotationType` is already `RunAnnotationType` and the other two are already booleans (or coerced via `!!`).

### Step 3: Commit

```bash
git add app/modules/runs/run.ts
git commit -m "Pass annotationType and verification flags into buildRunSnapshot

Fixes #2168"
```

---

## Task 6: Update existing `buildRunSnapshot` test mocks

The two existing test files that mock `buildRunSnapshot` use a stricter input type that no longer matches the new signature, and their return value omits the new fields. Update them so they remain consistent with the new shape.

**Files:**

- Modify: `app/modules/runs/__tests__/run.route.test.ts`
- Modify: `app/modules/runSets/__tests__/getRunSetPrefillData.test.ts`

### Step 1: Update the mock in `run.route.test.ts`

Open `app/modules/runs/__tests__/run.route.test.ts`. Locate the mock block (lines 27–39):

```ts
vi.mock("~/modules/runs/services/buildRunSnapshot.server", () => ({
  default: vi.fn(async ({ promptVersionNumber, modelCode }: any) => ({
    prompt: {
      name: "Mock Prompt",
      userPrompt: "Mock",
      annotationSchema: [],
      annotationType: "PER_UTTERANCE",
      version: promptVersionNumber,
    },
    model: { code: modelCode, provider: "openai", name: modelCode },
  })),
  buildRunSnapshot: vi.fn(),
}));
```

Replace with:

```ts
vi.mock("~/modules/runs/services/buildRunSnapshot.server", () => ({
  default: vi.fn(async ({ promptVersionNumber, modelCode }: any) => ({
    prompt: {
      name: "Mock Prompt",
      userPrompt: "Mock",
      annotationSchema: [],
      annotationType: "PER_UTTERANCE",
      version: promptVersionNumber,
      systemPrompt: "Mock annotation system prompt",
      verifySystemPrompt: "",
      adjudicateSystemPrompt: "",
    },
    model: { code: modelCode, provider: "openai", name: modelCode },
  })),
  buildRunSnapshot: vi.fn(),
}));
```

### Step 2: Update the mock in `getRunSetPrefillData.test.ts`

Open `app/modules/runSets/__tests__/getRunSetPrefillData.test.ts`. Locate the mock block (lines 14–33):

```ts
vi.mock("~/modules/runs/services/buildRunSnapshot.server", () => ({
  default: vi.fn(
    async ({
      promptVersionNumber,
      modelCode,
    }: {
      promptVersionNumber: number;
      modelCode: string;
    }) => ({
      prompt: {
        name: "Mock Prompt",
        userPrompt: "Mock",
        annotationSchema: [],
        annotationType: "PER_UTTERANCE",
        version: promptVersionNumber,
      },
      model: { code: modelCode, provider: "openai", name: modelCode },
    }),
  ),
}));
```

Replace with:

```ts
vi.mock("~/modules/runs/services/buildRunSnapshot.server", () => ({
  default: vi.fn(
    async ({
      promptVersionNumber,
      modelCode,
    }: {
      promptVersionNumber: number;
      modelCode: string;
      annotationType: string;
      shouldRunVerification: boolean;
      isAdjudication: boolean;
    }) => ({
      prompt: {
        name: "Mock Prompt",
        userPrompt: "Mock",
        annotationSchema: [],
        annotationType: "PER_UTTERANCE",
        version: promptVersionNumber,
        systemPrompt: "Mock annotation system prompt",
        verifySystemPrompt: "",
        adjudicateSystemPrompt: "",
      },
      model: { code: modelCode, provider: "openai", name: modelCode },
    }),
  ),
}));
```

### Step 3: Run the affected tests

Run: `yarn test app/modules/runs/__tests__/run.route.test.ts app/modules/runSets/__tests__/getRunSetPrefillData.test.ts`
Expected: both files pass.

### Step 4: Commit

```bash
git add app/modules/runs/__tests__/run.route.test.ts \
        app/modules/runSets/__tests__/getRunSetPrefillData.test.ts
git commit -m "Update buildRunSnapshot mocks for new system prompt fields

Fixes #2168"
```

---

## Task 7: Add system prompt keys to the run JSON exporter

**Files:**

- Modify: `app/functions/outputRunDataToJSON/app.ts`
- Modify: `app/functions/outputRunDataToJSON/__tests__/app.test.ts`

### Step 1: Write the failing test additions

Open `app/functions/outputRunDataToJSON/__tests__/app.test.ts`. Locate the `makeRun` helper (lines 20–42). Replace it with:

```ts
const makeRun = (overrides: Record<string, any> = {}) => ({
  _id: "run1",
  project: "proj1",
  name: "Test Run",
  annotationType: "PER_UTTERANCE",
  prompt: "prompt1",
  promptVersion: 1,
  sessions: [
    { sessionId: "session-abc", name: "session-abc.json" },
    { sessionId: "session-def", name: "session-def.json" },
  ],
  snapshot: {
    prompt: {
      name: "Test Prompt",
      userPrompt: "Annotate this",
      annotationType: "PER_UTTERANCE",
      annotationSchema: [],
      version: 1,
      systemPrompt: "ANNOTATION SYSTEM PROMPT",
      verifySystemPrompt: "VERIFY SYSTEM PROMPT",
      adjudicateSystemPrompt: "",
    },
    model: { code: "gpt-4", name: "GPT-4", provider: "openai" },
  },
  ...overrides,
});
```

Add a new test at the bottom of the file, before the final `});` that closes the `describe`:

```ts
it("includes system prompts in the meta JSONL", async () => {
  const run = makeRun();

  let callIndex = 0;
  vi.mocked(fse.readJSON).mockImplementation(async () => {
    const sessionId = run.sessions[callIndex].sessionId;
    callIndex++;
    return makeTranscript(sessionId);
  });

  await handler({
    body: {
      run: run as any,
      teamId: "team1",
      inputFolder: "storage/proj1/runs/run1",
      outputFolder: "storage/proj1/runs/run1/exports",
    },
  });

  const metaPath = Object.keys(capturedFiles).find((p) =>
    p.includes("meta.jsonl"),
  );
  expect(metaPath).toBeDefined();

  const meta = JSON.parse(capturedFiles[metaPath!]);
  expect(meta.promptSystemPrompt).toBe("ANNOTATION SYSTEM PROMPT");
  expect(meta.promptVerifySystemPrompt).toBe("VERIFY SYSTEM PROMPT");
  expect(meta.promptAdjudicateSystemPrompt).toBe("");
});
```

### Step 2: Run the test to verify it fails

Run: `yarn test app/functions/outputRunDataToJSON/__tests__/app.test.ts`
Expected: FAIL on the new test — `meta.promptSystemPrompt` is `undefined`.

### Step 3: Update the exporter

Open `app/functions/outputRunDataToJSON/app.ts`. Locate the `runObject` literal (lines 54–71):

```ts
const runObject = {
  teamId,
  projectId: run.project,
  runId: run._id,
  runName: run.name,
  annotator: getAnnotatorName(run),
  annotationType: run.annotationType,
  model: getRunModelInfo(run),
  promptName: run.snapshot?.prompt?.name ?? "",
  promptVersion: run.snapshot?.prompt?.version ?? run.promptVersion ?? "",
  promptUserPrompt: run.snapshot?.prompt?.userPrompt ?? "",
  promptAnnotationType: run.snapshot?.prompt?.annotationType ?? "",
  isHuman: run.isHuman ?? false,
  sessionsCount: run.sessions.length,
  createdAt: run.createdAt ?? "",
  startedAt: run.startedAt ?? "",
  finishedAt: run.finishedAt ?? "",
};
```

Replace with:

```ts
const runObject = {
  teamId,
  projectId: run.project,
  runId: run._id,
  runName: run.name,
  annotator: getAnnotatorName(run),
  annotationType: run.annotationType,
  model: getRunModelInfo(run),
  promptName: run.snapshot?.prompt?.name ?? "",
  promptVersion: run.snapshot?.prompt?.version ?? run.promptVersion ?? "",
  promptUserPrompt: run.snapshot?.prompt?.userPrompt ?? "",
  promptSystemPrompt: run.snapshot?.prompt?.systemPrompt ?? "",
  promptVerifySystemPrompt: run.snapshot?.prompt?.verifySystemPrompt ?? "",
  promptAdjudicateSystemPrompt:
    run.snapshot?.prompt?.adjudicateSystemPrompt ?? "",
  promptAnnotationType: run.snapshot?.prompt?.annotationType ?? "",
  isHuman: run.isHuman ?? false,
  sessionsCount: run.sessions.length,
  createdAt: run.createdAt ?? "",
  startedAt: run.startedAt ?? "",
  finishedAt: run.finishedAt ?? "",
};
```

### Step 4: Run the test to verify it passes

Run: `yarn test app/functions/outputRunDataToJSON/__tests__/app.test.ts`
Expected: PASS, all tests in this file green.

### Step 5: Commit

```bash
git add app/functions/outputRunDataToJSON/app.ts \
        app/functions/outputRunDataToJSON/__tests__/app.test.ts
git commit -m "Include system prompts in run JSON meta export

Fixes #2168"
```

---

## Task 8: Add system prompt keys to the run CSV exporter

**Files:**

- Modify: `app/functions/outputRunDataToCSV/app.ts`
- Modify: `app/functions/outputRunDataToCSV/__tests__/app.test.ts`

### Step 1: Extend the test fixture

Open `app/functions/outputRunDataToCSV/__tests__/app.test.ts`. Locate the `makeRun` helper and its `snapshot.prompt` block (the existing block already has `name`, `userPrompt`, `annotationType`, `annotationSchema`, `version`).

Add three fields inside `snapshot.prompt`, immediately after `version: 1,`:

```ts
      systemPrompt: "ANNOTATION SYSTEM PROMPT",
      verifySystemPrompt: "VERIFY SYSTEM PROMPT",
      adjudicateSystemPrompt: "",
```

### Step 2: Add the assertion test

Add this test as a new `it(...)` block inside the existing `describe("outputRunDataToCSV", () => { ... })`. The file already defines `capturedCsvFiles`, `makeRun`, `makeTranscript` — reuse those:

```ts
it("includes system prompts in the meta CSV", async () => {
  const run = makeRun();

  let callIndex = 0;
  vi.mocked(fse.readJSON).mockImplementation(async () => {
    const sessionId = run.sessions[callIndex].sessionId;
    callIndex++;
    return makeTranscript(sessionId);
  });

  await handler({
    body: {
      run: run as any,
      teamId: "team1",
      inputFolder: "storage/proj1/runs/run1",
      outputFolder: "storage/proj1/runs/run1/exports",
    },
  });

  const metaPath = Object.keys(capturedCsvFiles).find((p) =>
    p.includes("meta.csv"),
  );
  expect(metaPath).toBeDefined();

  const csv = capturedCsvFiles[metaPath!];
  const [headerLine, valuesLine] = csv.split("\n");
  expect(headerLine).toContain("promptSystemPrompt");
  expect(headerLine).toContain("promptVerifySystemPrompt");
  expect(headerLine).toContain("promptAdjudicateSystemPrompt");
  expect(valuesLine).toContain("ANNOTATION SYSTEM PROMPT");
  expect(valuesLine).toContain("VERIFY SYSTEM PROMPT");
});
```

### Step 3: Run the test to verify it fails

Run: `yarn test app/functions/outputRunDataToCSV/__tests__/app.test.ts`
Expected: FAIL on the new test — the header doesn't contain `promptSystemPrompt`.

### Step 4: Update the exporter

Open `app/functions/outputRunDataToCSV/app.ts`. Locate the `metaObject` literal (lines 131–148):

```ts
const metaObject = {
  teamId,
  projectId: run.project,
  runId: run._id,
  runName: run.name,
  annotator: annotatorName,
  annotationType: run.annotationType,
  model: getRunModelCode(run),
  promptName: run.snapshot?.prompt?.name ?? "",
  promptVersion: run.snapshot?.prompt?.version ?? run.promptVersion ?? "",
  promptUserPrompt: run.snapshot?.prompt?.userPrompt ?? "",
  promptAnnotationType: run.snapshot?.prompt?.annotationType ?? "",
  isHuman: run.isHuman ?? false,
  sessionsCount: run.sessions.length,
  createdAt: run.createdAt ?? "",
  startedAt: run.startedAt ?? "",
  finishedAt: run.finishedAt ?? "",
};
```

Replace with:

```ts
const metaObject = {
  teamId,
  projectId: run.project,
  runId: run._id,
  runName: run.name,
  annotator: annotatorName,
  annotationType: run.annotationType,
  model: getRunModelCode(run),
  promptName: run.snapshot?.prompt?.name ?? "",
  promptVersion: run.snapshot?.prompt?.version ?? run.promptVersion ?? "",
  promptUserPrompt: run.snapshot?.prompt?.userPrompt ?? "",
  promptSystemPrompt: run.snapshot?.prompt?.systemPrompt ?? "",
  promptVerifySystemPrompt: run.snapshot?.prompt?.verifySystemPrompt ?? "",
  promptAdjudicateSystemPrompt:
    run.snapshot?.prompt?.adjudicateSystemPrompt ?? "",
  promptAnnotationType: run.snapshot?.prompt?.annotationType ?? "",
  isHuman: run.isHuman ?? false,
  sessionsCount: run.sessions.length,
  createdAt: run.createdAt ?? "",
  startedAt: run.startedAt ?? "",
  finishedAt: run.finishedAt ?? "",
};
```

The CSV writer derives columns from `Object.keys(metaObject)`, so the new columns appear automatically.

### Step 5: Run the test to verify it passes

Run: `yarn test app/functions/outputRunDataToCSV/__tests__/app.test.ts`
Expected: PASS.

### Step 6: Commit

```bash
git add app/functions/outputRunDataToCSV/app.ts \
        app/functions/outputRunDataToCSV/__tests__/app.test.ts
git commit -m "Include system prompts in run CSV meta export

Fixes #2168"
```

---

## Task 9: Add system prompt keys to the run-set JSON exporter

**Files:**

- Modify: `app/functions/outputRunSetDataToJSON/app.ts`
- Modify: `app/functions/outputRunSetDataToJSON/__tests__/app.test.ts`

### Step 1: Extend the test fixture

Open `app/functions/outputRunSetDataToJSON/__tests__/app.test.ts`. Locate the `makeRun = (index, overrides) => ({ ... })` helper.

Add three fields inside the `snapshot.prompt` block, immediately after `version: 1,`:

```ts
      systemPrompt: "ANNOTATION SYSTEM PROMPT",
      verifySystemPrompt: "",
      adjudicateSystemPrompt: "",
```

### Step 2: Add the assertion test

Inside the existing `describe("outputRunSetDataToJSON", ...)` block, add:

```ts
it("includes system prompts in each meta JSONL row", async () => {
  const runs = [makeRun(1), makeRun(2)];
  const runSet = makeRunSet({ annotationType: "PER_SESSION" });

  vi.mocked(fse.readJSON).mockImplementation(async () =>
    makeTranscript("session-abc", { sessionAnnotations: true }),
  );

  await handler({
    body: {
      runSet: runSet as any,
      runs: runs as any,
      teamId: "team1",
      inputFolder: "storage/proj1/runs",
      outputFolder: "storage/proj1/run-sets/runset1/exports",
    },
  });

  const metaPath = Object.keys(capturedFiles).find((p) =>
    p.includes("meta.jsonl"),
  );
  expect(metaPath).toBeDefined();

  const lines = capturedFiles[metaPath!].split("\n");
  expect(lines).toHaveLength(2);
  for (const line of lines) {
    const meta = JSON.parse(line);
    expect(meta.promptSystemPrompt).toBe("ANNOTATION SYSTEM PROMPT");
    expect(meta.promptVerifySystemPrompt).toBe("");
    expect(meta.promptAdjudicateSystemPrompt).toBe("");
  }
});
```

### Step 2: Run the test to verify it fails

Run: `yarn test app/functions/outputRunSetDataToJSON/__tests__/app.test.ts`
Expected: FAIL on the new test.

### Step 3: Update the exporter

Open `app/functions/outputRunSetDataToJSON/app.ts`. Locate the `metaArray` map (lines 156–173):

```ts
const metaArray = runs.map((run, index) => ({
  teamId,
  projectId: run.project,
  runId: run._id,
  runName: run.name,
  annotator: getAnnotatorName(run, index),
  annotationType: run.annotationType,
  model: getRunModelCode(run),
  promptName: run.snapshot?.prompt?.name ?? "",
  promptVersion: run.snapshot?.prompt?.version ?? run.promptVersion ?? "",
  promptUserPrompt: run.snapshot?.prompt?.userPrompt ?? "",
  promptAnnotationType: run.snapshot?.prompt?.annotationType ?? "",
  isHuman: run.isHuman ?? false,
  sessionsCount: run.sessions.length,
  createdAt: run.createdAt ?? "",
  startedAt: run.startedAt ?? "",
  finishedAt: run.finishedAt ?? "",
}));
```

Replace with:

```ts
const metaArray = runs.map((run, index) => ({
  teamId,
  projectId: run.project,
  runId: run._id,
  runName: run.name,
  annotator: getAnnotatorName(run, index),
  annotationType: run.annotationType,
  model: getRunModelCode(run),
  promptName: run.snapshot?.prompt?.name ?? "",
  promptVersion: run.snapshot?.prompt?.version ?? run.promptVersion ?? "",
  promptUserPrompt: run.snapshot?.prompt?.userPrompt ?? "",
  promptSystemPrompt: run.snapshot?.prompt?.systemPrompt ?? "",
  promptVerifySystemPrompt: run.snapshot?.prompt?.verifySystemPrompt ?? "",
  promptAdjudicateSystemPrompt:
    run.snapshot?.prompt?.adjudicateSystemPrompt ?? "",
  promptAnnotationType: run.snapshot?.prompt?.annotationType ?? "",
  isHuman: run.isHuman ?? false,
  sessionsCount: run.sessions.length,
  createdAt: run.createdAt ?? "",
  startedAt: run.startedAt ?? "",
  finishedAt: run.finishedAt ?? "",
}));
```

### Step 4: Run the test to verify it passes

Run: `yarn test app/functions/outputRunSetDataToJSON/__tests__/app.test.ts`
Expected: PASS.

### Step 5: Commit

```bash
git add app/functions/outputRunSetDataToJSON/app.ts \
        app/functions/outputRunSetDataToJSON/__tests__/app.test.ts
git commit -m "Include system prompts in run-set JSON meta export

Fixes #2168"
```

---

## Task 10: Add system prompt keys to the run-set CSV exporter

**Files:**

- Modify: `app/functions/outputRunSetDataToCSV/app.ts`
- Modify: `app/functions/outputRunSetDataToCSV/__tests__/app.test.ts`

### Step 1: Extend the test fixture

Open `app/functions/outputRunSetDataToCSV/__tests__/app.test.ts`. Locate the `makeRun = (index, overrides) => ({ ... })` helper.

Add three fields inside the `snapshot.prompt` block, immediately after `version: 1,`:

```ts
      systemPrompt: "ANNOTATION SYSTEM PROMPT",
      verifySystemPrompt: "",
      adjudicateSystemPrompt: "",
```

### Step 2: Add the assertion test

Inside the existing `describe("outputRunSetDataToCSV", ...)` block, add. The file already defines `capturedCsvFiles`, `makeRun(index)`, `makeRunSet`, and `makeTranscript` — reuse those:

```ts
it("includes system prompts in the meta CSV", async () => {
  const runs = [makeRun(1), makeRun(2)];
  const runSet = makeRunSet();

  let callIndex = 0;
  const sessionOrder = runs.flatMap((r) => r.sessions.map((s) => s.sessionId));
  vi.mocked(fse.readJSON).mockImplementation(async () => {
    const sessionId = sessionOrder[callIndex++];
    return makeTranscript(sessionId);
  });

  await handler({
    body: {
      runSet: runSet as any,
      runs: runs as any,
      teamId: "team1",
      inputFolder: "storage/proj1/runs",
      outputFolder: "storage/proj1/run-sets/runset1/exports",
    },
  });

  const metaPath = Object.keys(capturedCsvFiles).find((p) =>
    p.includes("meta.csv"),
  );
  expect(metaPath).toBeDefined();

  const csv = capturedCsvFiles[metaPath!];
  const headerLine = csv.split("\n")[0];
  expect(headerLine).toContain("promptSystemPrompt");
  expect(headerLine).toContain("promptVerifySystemPrompt");
  expect(headerLine).toContain("promptAdjudicateSystemPrompt");
  expect(csv).toContain("ANNOTATION SYSTEM PROMPT");
});
```

### Step 3: Run the test to verify it fails

Run: `yarn test app/functions/outputRunSetDataToCSV/__tests__/app.test.ts`
Expected: FAIL on the new test.

### Step 4: Update the exporter — meta record

Open `app/functions/outputRunSetDataToCSV/app.ts`. Locate the `metaArray.map` literal (lines 160–177):

```ts
const metaArray = runs.map((run, index) => ({
  teamId,
  projectId: run.project,
  runId: run._id,
  runName: run.name,
  annotator: annotatorNames[index],
  annotationType: run.annotationType,
  model: getRunModelCode(run),
  promptName: run.snapshot?.prompt?.name ?? "",
  promptVersion: run.snapshot?.prompt?.version ?? run.promptVersion ?? "",
  promptUserPrompt: run.snapshot?.prompt?.userPrompt ?? "",
  promptAnnotationType: run.snapshot?.prompt?.annotationType ?? "",
  isHuman: run.isHuman ?? false,
  sessionsCount: run.sessions.length,
  createdAt: run.createdAt ?? "",
  startedAt: run.startedAt ?? "",
  finishedAt: run.finishedAt ?? "",
}));
```

Replace with:

```ts
const metaArray = runs.map((run, index) => ({
  teamId,
  projectId: run.project,
  runId: run._id,
  runName: run.name,
  annotator: annotatorNames[index],
  annotationType: run.annotationType,
  model: getRunModelCode(run),
  promptName: run.snapshot?.prompt?.name ?? "",
  promptVersion: run.snapshot?.prompt?.version ?? run.promptVersion ?? "",
  promptUserPrompt: run.snapshot?.prompt?.userPrompt ?? "",
  promptSystemPrompt: run.snapshot?.prompt?.systemPrompt ?? "",
  promptVerifySystemPrompt: run.snapshot?.prompt?.verifySystemPrompt ?? "",
  promptAdjudicateSystemPrompt:
    run.snapshot?.prompt?.adjudicateSystemPrompt ?? "",
  promptAnnotationType: run.snapshot?.prompt?.annotationType ?? "",
  isHuman: run.isHuman ?? false,
  sessionsCount: run.sessions.length,
  createdAt: run.createdAt ?? "",
  startedAt: run.startedAt ?? "",
  finishedAt: run.finishedAt ?? "",
}));
```

### Step 5: Update the exporter — explicit `keys` list

Still in `app/functions/outputRunSetDataToCSV/app.ts`, locate the `json2csv` call directly below the `metaArray` (lines 179–199). It uses an **explicit `keys` array**, so the new columns will not appear unless the array is updated.

Replace the `keys` array:

```ts
const metaCsv = json2csv(metaArray, {
  keys: [
    "teamId",
    "projectId",
    "runId",
    "runName",
    "annotator",
    "annotationType",
    "model",
    "promptName",
    "promptVersion",
    "promptUserPrompt",
    "promptAnnotationType",
    "isHuman",
    "sessionsCount",
    "createdAt",
    "startedAt",
    "finishedAt",
  ],
  emptyFieldValue: "",
});
```

with:

```ts
const metaCsv = json2csv(metaArray, {
  keys: [
    "teamId",
    "projectId",
    "runId",
    "runName",
    "annotator",
    "annotationType",
    "model",
    "promptName",
    "promptVersion",
    "promptUserPrompt",
    "promptSystemPrompt",
    "promptVerifySystemPrompt",
    "promptAdjudicateSystemPrompt",
    "promptAnnotationType",
    "isHuman",
    "sessionsCount",
    "createdAt",
    "startedAt",
    "finishedAt",
  ],
  emptyFieldValue: "",
});
```

### Step 6: Run the test to verify it passes

Run: `yarn test app/functions/outputRunSetDataToCSV/__tests__/app.test.ts`
Expected: PASS.

### Step 7: Commit

```bash
git add app/functions/outputRunSetDataToCSV/app.ts \
        app/functions/outputRunSetDataToCSV/__tests__/app.test.ts
git commit -m "Include system prompts in run-set CSV meta export

Fixes #2168"
```

---

## Task 11: Full verification

**Files:** none modified (verification only)

### Step 1: Typecheck

Run: `yarn typecheck`
Expected: no errors.

### Step 2: Lint

Run: `yarn lint`
Expected: no errors. If `yarn lint` reports formatting issues, run `yarn format` and re-run lint.

### Step 3: Full test suite

Run: `yarn test`
Expected: all tests pass.

### Step 4: Production build

Run: `yarn app:build`
Expected: completes successfully (this proves the Vite `?raw` imports in `getSystemPrompt.ts` bundle correctly).

### Step 5: Smoke check (optional, manual)

Start dev server (`yarn app:dev` + `yarn workers:dev` + `yarn local:redis`). Create a new run via the UI. Inspect the Mongo document for that run and confirm `snapshot.prompt.systemPrompt` contains the expected annotation system prompt text. Download the run; open the `*-meta.jsonl` file and confirm `promptSystemPrompt` is populated.

(If you can't do a manual smoke check, that's fine — the unit tests in Tasks 4, 7, 8, 9, 10 cover the wiring end to end.)

### Step 6: Final note

No further commit. The branch is ready to push and open a PR for `#2168`.
