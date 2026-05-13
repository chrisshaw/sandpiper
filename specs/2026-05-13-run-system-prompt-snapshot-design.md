# Run System Prompt Snapshot — Design

**Date:** 2026-05-13
**Status:** Draft for review

## Problem

When a run is created, the run captures a snapshot of the user-defined prompt (`snapshot.prompt.userPrompt`) along with model and version information. However, the **system prompt** — the operational instruction template that wraps the user prompt and is sent to the LLM as the system message — is read from `.prompt.md` files at execution time and is **not** captured anywhere on the run.

Because system prompts can change over time (the files are edited in-tree and shipped via releases), a run executed yesterday and a run executed today may have been driven by different system prompts. There is currently no archival record of which system prompt drove a given run, which undermines reproducibility and auditability of annotation results.

## Goal

Capture the exact text of the system prompt(s) used during a run, stored on the run document at creation time and surfaced in the meta export when a run or run set is downloaded.

## Non-Goals

- No backfill of existing runs.
- No change to human run creation (`isHuman: true`) — human runs do not use a system prompt and are unaffected.
- No change to how workers consume system prompts at execution time. Workers continue to read the `.prompt.md` files via `getPromptText`. The snapshot is an archival record taken at creation time, not a runtime input.
- No new snapshot section for verification or adjudication models. Only the system prompt text for those modes is captured; model identity is shared with `snapshot.model`.
- No consolidation of the dead `app/functions/annotatePer{Utterance,Session}/system.prompt.json` files. They are unreferenced and out of scope here.

## Background

There is exactly one true source of system prompts: the markdown files under `workers/prompts/`. Three pairs (one per annotation type) cover the operations a run can drive:

| Kind         | PER_UTTERANCE                                      | PER_SESSION                                      |
| ------------ | -------------------------------------------------- | ------------------------------------------------ |
| Annotation   | `workers/prompts/annotatePerUtterance.prompt.md`   | `workers/prompts/annotatePerSession.prompt.md`   |
| Verification | `workers/prompts/verifyPerUtterance.prompt.md`     | `workers/prompts/verifyPerSession.prompt.md`     |
| Adjudication | `workers/prompts/adjudicatePerUtterance.prompt.md` | `workers/prompts/adjudicatePerSession.prompt.md` |

The prompt editor displays the annotation file for the current `annotationType` via `getSystemPromptByAnnotationType` (Vite `?raw` import). Workers consume the same files at execution time via `getPromptText` (Node `readFileSync` relative to `workers/helpers/`).

The dead `app/functions/annotatePer{Utterance,Session}/app.ts` lambdas reference a separate `system.prompt.json`, but those lambdas are not invoked anywhere in the live code path.

## Design

### Source of truth and capture point

Captured at run creation time, in the app workspace, by reading the `.prompt.md` files. The app side already uses Vite `?raw` imports for this content (see `getSystemPromptByAnnotationType.ts`); we extend that pattern. Workers' `getPromptText` is not reused because:

1. `buildRunSnapshot` runs in the app's action handler, not in a worker.
2. `getPromptText` resolves files relative to `workers/helpers/`, which is brittle through Vite SSR bundling on the app side. The `?raw` import path is what app code already uses for these files.

### Schema change

`app/lib/schemas/run.schema.ts` — add three optional `String` fields under `snapshot.prompt`:

```ts
snapshot: {
  prompt: {
    // existing fields...
    name: String,
    userPrompt: String,
    annotationSchema: [Mixed],
    annotationType: String,
    version: Number,
    // new fields
    systemPrompt: String,           // annotation system prompt — set for every non-human LLM run
    verifySystemPrompt: String,     // only set when shouldRunVerification === true
    adjudicateSystemPrompt: String, // only set when isAdjudication === true
  },
  model: { ... }
}
```

All three are optional (no `required` flag). Legacy runs, human runs, and runs that didn't use verification/adjudication will have the corresponding fields unset.

### New helper: `getSystemPrompt`

Add `app/modules/prompts/helpers/getSystemPrompt.ts`:

```ts
import type { AnnotationTypeOptions } from "~/modules/annotations/helpers/annotationTypes";

import annotatePerSession from "../../../../workers/prompts/annotatePerSession.prompt.md?raw";
import annotatePerUtterance from "../../../../workers/prompts/annotatePerUtterance.prompt.md?raw";
import verifyPerSession from "../../../../workers/prompts/verifyPerSession.prompt.md?raw";
import verifyPerUtterance from "../../../../workers/prompts/verifyPerUtterance.prompt.md?raw";
import adjudicatePerSession from "../../../../workers/prompts/adjudicatePerSession.prompt.md?raw";
import adjudicatePerUtterance from "../../../../workers/prompts/adjudicatePerUtterance.prompt.md?raw";

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

The existing `getSystemPromptByAnnotationType` helper is replaced by `getSystemPrompt`. Specifically:

- `app/modules/prompts/containers/promptEditor.route.tsx` — update the import and call site to use `getSystemPrompt("annotation", prompt.data.annotationType)`.
- `app/modules/prompts/helpers/getSystemPromptByAnnotationType.ts` — delete.
- `app/modules/prompts/__tests__/getSystemPromptByAnnotationType.test.ts` — delete (coverage moves to `getSystemPrompt.test.ts`).

### `buildRunSnapshot` change

`app/modules/runs/services/buildRunSnapshot.server.ts`:

1. Extend `RunSnapshot` interface:

   ```ts
   export interface RunSnapshot {
     prompt: {
       name: string;
       userPrompt: string;
       annotationSchema: AnnotationSchemaItem[];
       annotationType: string;
       version: number;
       systemPrompt: string; // always set for new LLM runs
       verifySystemPrompt: string; // "" when shouldRunVerification === false
       adjudicateSystemPrompt: string; // "" when isAdjudication === false
     };
     model: { code: string; provider: string; name: string };
   }
   ```

2. Extend the function signature:

   ```ts
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
   }): Promise<RunSnapshot>;
   ```

3. In `buildPromptSnapshot`, after the existing fields are assembled, attach the system prompts:

   ```ts
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
   ```

   `""` is used (rather than `undefined`) so the field shape is consistent on every new run and matches the `?? ""` fallback already used in the exports.

### Caller change

`app/modules/runs/run.ts` — `RunService.create()` already has `props.annotationType`, `props.shouldRunVerification`, and `props.isAdjudication`. Pass them through to `buildRunSnapshot`:

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

No other call site of `buildRunSnapshot` exists in production code. Test files that mock the function will need to be updated only if they assert on the snapshot shape.

### Meta export changes

Add three keys to the meta record in all four exporters, placed next to `promptUserPrompt`:

```ts
promptSystemPrompt:            run.snapshot?.prompt?.systemPrompt ?? "",
promptVerifySystemPrompt:      run.snapshot?.prompt?.verifySystemPrompt ?? "",
promptAdjudicateSystemPrompt:  run.snapshot?.prompt?.adjudicateSystemPrompt ?? "",
```

Files:

- `app/functions/outputRunDataToJSON/app.ts`
- `app/functions/outputRunDataToCSV/app.ts`
- `app/functions/outputRunSetDataToJSON/app.ts`
- `app/functions/outputRunSetDataToCSV/app.ts`

For CSV exports, both `json2csv` calls derive column keys from `Object.keys(metaObject)`, so the three new columns appear automatically. Empty values render as empty cells, which is the desired behaviour for human runs and pre-existing runs that lack the new fields.

For JSON (JSONL) exports, the keys are written as part of the meta object literal and serialize as empty strings when unset — matching the existing pattern for fields like `promptUserPrompt`.

### Behaviour by run type

| Run configuration                     | systemPrompt | verifySystemPrompt | adjudicateSystemPrompt |
| ------------------------------------- | :----------: | :----------------: | :--------------------: |
| LLM, no verification, no adjudication |     set      |         ""         |           ""           |
| LLM, with verification                |     set      |        set         |           ""           |
| Adjudication run                      |     set      |         ""         |          set           |
| Human run (`isHuman: true`)           |    unset     |       unset        |         unset          |
| Pre-existing run (before deploy)      |    unset     |       unset        |         unset          |

- `""` means the field is present on the document with an empty string value (new LLM runs always set all three fields, using `""` when not applicable).
- `unset` means the field is absent on the document. The exports handle this via `run.snapshot?.prompt?.systemPrompt ?? ""`, so the meta output is `""` in both `""` and `unset` cases.

### Testing

**New unit tests:**

- `app/modules/prompts/__tests__/getSystemPrompt.test.ts` — verifies the helper returns the expected text for each (kind × annotationType) pair, and returns `""` for falsy `annotationType`.
- Add cases to `buildRunSnapshot` tests (or create one if absent) covering:
  - Plain LLM run → `systemPrompt` populated; `verifySystemPrompt` and `adjudicateSystemPrompt` are `""`.
  - With `shouldRunVerification: true` → `verifySystemPrompt` populated; `adjudicateSystemPrompt` is `""`.
  - With `isAdjudication: true` → `adjudicateSystemPrompt` populated; `verifySystemPrompt` is `""`.
  - With both flags true → all three populated.

**Updated tests:**

- `app/modules/runs/__tests__/run.route.test.ts` — its `buildRunSnapshot` mock may need to include the new fields if any assertion inspects them. Otherwise, leave the existing mock as-is.
- `app/modules/runSets/__tests__/getRunSetPrefillData.test.ts` — same review pass.
- `app/functions/outputRunDataToJSON/__tests__/app.test.ts` and counterparts — extend test fixtures with `snapshot.prompt.systemPrompt` (and verify variants where relevant) and assert the meta output contains the new keys.

### Files to change

| File                                                                    | Change                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `app/lib/schemas/run.schema.ts`                                         | Add 3 optional String fields under snapshot.prompt                               |
| `app/modules/prompts/helpers/getSystemPrompt.ts`                        | **New** — generalized loader for the 6 .prompt.md files                          |
| `app/modules/prompts/helpers/getSystemPromptByAnnotationType.ts`        | **Delete** — replaced by `getSystemPrompt`                                       |
| `app/modules/prompts/__tests__/getSystemPromptByAnnotationType.test.ts` | **Delete** — coverage moves to getSystemPrompt.test.ts                           |
| `app/modules/prompts/containers/promptEditor.route.tsx`                 | Switch to `getSystemPrompt("annotation", annotationType)`                        |
| `app/modules/runs/services/buildRunSnapshot.server.ts`                  | Extend RunSnapshot type; extend function inputs; populate new fields             |
| `app/modules/runs/run.ts`                                               | Pass annotationType, shouldRunVerification, isAdjudication into buildRunSnapshot |
| `app/functions/outputRunDataToJSON/app.ts`                              | Add 3 new meta keys                                                              |
| `app/functions/outputRunDataToCSV/app.ts`                               | Add 3 new meta keys                                                              |
| `app/functions/outputRunSetDataToJSON/app.ts`                           | Add 3 new meta keys                                                              |
| `app/functions/outputRunSetDataToCSV/app.ts`                            | Add 3 new meta keys                                                              |
| `app/modules/prompts/__tests__/getSystemPrompt.test.ts`                 | **New** — unit tests for helper                                                  |
| `app/modules/runs/__tests__/buildRunSnapshot.*.test.ts`                 | New / extended tests for snapshot variants                                       |
| `app/functions/outputRun*/__tests__/app.test.ts` (×4)                   | Extend fixtures + assert new meta keys present                                   |

## Risks and edge cases

- **`annotationType` falsy on snapshot input.** `getSystemPrompt` returns `""` defensively. This shouldn't happen for LLM runs (annotationType is required on the run schema), but a defensive default avoids crashing snapshot creation on malformed input.
- **In-flight runs at deploy.** Runs already created before deploy will not have the new fields. The exports tolerate this via the `?? ""` fallback.
- **File size.** The annotation system prompts are ~1–2 KB of text. Multiplied across runs over time, storage impact is negligible.
- **System prompt edits between create and execute.** If a user edits a `.prompt.md` file _after_ a run is created but _before_ its workers execute, the snapshot will capture the _creation-time_ version while the worker will execute against the _current_ version. This is acceptable for the goal (capturing what the user intended at creation time), and would be a pre-existing problem anyway. If perfectly accurate "what the LLM saw" is needed later, the snapshot capture can be moved into the workers as a follow-up.

## Open questions

None.

## Out of scope (potential follow-ups)

- Removing dead `app/functions/annotatePer{Utterance,Session}/` lambdas and their `system.prompt.json` files.
- Moving system-prompt capture into workers for runtime-accurate snapshots.
- Versioning system prompts (e.g. git-style hash on the snapshot to detect post-edit drift).
