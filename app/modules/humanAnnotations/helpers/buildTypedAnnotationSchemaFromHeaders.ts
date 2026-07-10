import type { AnnotationSchemaItem } from "~/modules/prompts/prompts.types";
import buildAnnotationSchemaFromHeaders from "./buildAnnotationSchemaFromHeaders";

function defaultValueForType(fieldType: string): unknown {
  if (fieldType === "boolean") return false;
  if (fieldType === "number") return 0;
  return "";
}

// Fork-only wrapper around upstream's buildAnnotationSchemaFromHeaders. When a
// field's type is known (from the run set's existing runs), it is carried into
// the human run's schema snapshot so imported values can be coerced and the
// schema viewer renders the field correctly.
export default function buildTypedAnnotationSchemaFromHeaders(
  headers: string[],
  fieldTypes: Record<string, string>,
): AnnotationSchemaItem[] {
  return buildAnnotationSchemaFromHeaders(headers).map((item) => {
    const fieldType = fieldTypes[item.fieldKey];
    if (!fieldType) return item;
    return { ...item, fieldType, value: defaultValueForType(fieldType) };
  });
}
