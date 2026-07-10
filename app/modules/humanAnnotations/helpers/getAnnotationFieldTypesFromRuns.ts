import type { Run } from "~/modules/runs/runs.types";

// Fork-only. Maps fieldKey -> fieldType from the runs' schema snapshots (first
// run that declares a type for a field wins). Kept separate from upstream's
// getAnnotationFieldsFromRuns so that file stays pristine.
export default function getAnnotationFieldTypesFromRuns(
  runs: Run[],
): Record<string, string> {
  const fieldTypes: Record<string, string> = {};

  for (const run of runs) {
    const schema = run.snapshot?.prompt?.annotationSchema;
    if (!schema) continue;

    for (const item of schema) {
      if (item.isSystem) continue;
      if (item.fieldType && !fieldTypes[item.fieldKey]) {
        fieldTypes[item.fieldKey] = item.fieldType;
      }
    }
  }

  return fieldTypes;
}
