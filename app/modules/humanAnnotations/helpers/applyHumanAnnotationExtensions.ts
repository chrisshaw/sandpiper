import type { Run } from "~/modules/runs/runs.types";
import buildAnnotationsForSession from "./buildAnnotationsForSession";
import coerceAnnotationValue from "./coerceAnnotationValue";

interface SessionJSON {
  annotations?: Array<Record<string, unknown>>;
  transcript?: Array<{
    annotations?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }>;
}

// Fork-only post-pass for processUploadHumanAnnotations, called after
// upstream's per-utterance loop so that loop stays pristine:
//
// - PER_SESSION runs: upstream's loop is a no-op for these rows (they have no
//   sequence_id to match an utterance), so this writes the session-level
//   annotations the loop never produced.
// - PER_UTTERANCE runs: coerces the string values the loop wrote to each
//   field's declared type (a spreadsheet exports a checkbox as "TRUE", but
//   evaluations compare via String(value), so an uncoerced "TRUE" never
//   matches an AI boolean true). Idempotent, and it also repairs values from
//   earlier untyped uploads accumulated in the same run file.
export default function applyHumanAnnotationExtensions({
  originalJSON,
  sessionRows,
  annotator,
  headers,
  run,
}: {
  originalJSON: SessionJSON;
  sessionRows: Array<Record<string, string>>;
  annotator: string;
  headers: string[];
  run: Run | null;
}): void {
  const prompt = run?.snapshot?.prompt;

  const fieldTypes: Record<string, string> = {};
  for (const item of prompt?.annotationSchema ?? []) {
    if (item.fieldType && !item.isSystem) {
      fieldTypes[item.fieldKey] = item.fieldType;
    }
  }

  if (prompt?.annotationType === "PER_SESSION") {
    for (const row of sessionRows) {
      const annotations = buildAnnotationsForSession(
        row,
        annotator,
        headers,
        fieldTypes,
      );
      originalJSON.annotations = [
        ...(originalJSON.annotations || []),
        ...annotations,
      ];
    }
    return;
  }

  if (Object.keys(fieldTypes).length === 0) return;

  for (const utterance of originalJSON.transcript ?? []) {
    for (const annotation of utterance.annotations ?? []) {
      if (annotation.identifiedBy !== "HUMAN") continue;
      for (const [key, value] of Object.entries(annotation)) {
        if (fieldTypes[key] && typeof value === "string") {
          annotation[key] = coerceAnnotationValue(value, fieldTypes[key]);
        }
      }
    }
  }
}
