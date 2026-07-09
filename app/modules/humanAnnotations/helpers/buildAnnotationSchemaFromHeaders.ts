import type { AnnotationSchemaItem } from "~/modules/prompts/prompts.types";
import parseAnnotationColumn from "./parseAnnotationColumns";

function defaultValueForType(fieldType?: string): unknown {
  if (fieldType === "boolean") return false;
  if (fieldType === "number") return 0;
  return "";
}

// Reconstructs the human run's annotation schema from the CSV headers. When the
// field's type is known (from the run set's existing runs), it is carried through
// so the run snapshot records the type and the schema viewer renders it correctly.
export default function buildAnnotationSchemaFromHeaders(
  headers: string[],
  fieldTypes: Record<string, string> = {},
): AnnotationSchemaItem[] {
  const fieldSet = new Set<string>();

  for (const header of headers) {
    const parsed = parseAnnotationColumn(header);
    if (!parsed) continue;
    fieldSet.add(parsed.field);
  }

  return Array.from(fieldSet).map((fieldKey) => {
    const fieldType = fieldTypes[fieldKey];
    return {
      fieldKey,
      value: defaultValueForType(fieldType),
      isSystem: false,
      ...(fieldType ? { fieldType } : {}),
    };
  });
}
