import coerceAnnotationValue from "./coerceAnnotationValue";
import parseAnnotationColumn from "./parseAnnotationColumns";

// Groups an annotator's `annotator[<name>][<index>]<field>` columns by slot index.
// Each index becomes one annotation object. Values are coerced to the field's
// declared type (boolean/number) when known. Shared by the utterance-level and
// session-level annotation builders.
export default function groupAnnotationColumns(
  row: Record<string, string>,
  annotator: string,
  headers: string[],
  fieldTypes: Record<string, string>,
): Map<number, Record<string, unknown>> {
  const groups = new Map<number, Record<string, unknown>>();

  for (const header of headers) {
    const parsed = parseAnnotationColumn(header);
    if (!parsed || parsed.annotator !== annotator) continue;

    const value = row[header];
    if (value === undefined || value === "") continue;

    if (!groups.has(parsed.index)) {
      groups.set(parsed.index, {});
    }

    groups.get(parsed.index)![parsed.field] = coerceAnnotationValue(
      value,
      fieldTypes[parsed.field],
    );
  }

  return groups;
}
