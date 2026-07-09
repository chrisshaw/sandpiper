import type { Run } from "~/modules/runs/runs.types";

export interface AvailableAnnotationField {
  fieldKey: string;
  runCount: number;
  fieldType?: string;
}

export default function getAnnotationFieldsFromRuns(
  runs: Run[],
): AvailableAnnotationField[] {
  const fieldCounts = new Map<string, number>();
  const fieldTypes = new Map<string, string>();

  for (const run of runs) {
    const schema = run.snapshot?.prompt?.annotationSchema;
    if (!schema) continue;

    for (const item of schema) {
      if (item.isSystem) continue;
      fieldCounts.set(item.fieldKey, (fieldCounts.get(item.fieldKey) ?? 0) + 1);
      if (item.fieldType && !fieldTypes.has(item.fieldKey)) {
        fieldTypes.set(item.fieldKey, item.fieldType);
      }
    }
  }

  return Array.from(fieldCounts.entries()).map(([fieldKey, runCount]) => ({
    fieldKey,
    runCount,
    fieldType: fieldTypes.get(fieldKey),
  }));
}
