import coerceAnnotationValue from "./coerceAnnotationValue";
import parseAnnotationColumn from "./parseAnnotationColumns";

interface AnnotationObject {
  _id: string;
  identifiedBy: "HUMAN";
  [key: string]: unknown;
}

// Session-level counterpart to buildAnnotationsForUtterance. Produces annotation
// objects stored on the session root (mirroring AI per-session output), so the
// `_id` is the slot index rather than an utterance id. Values are coerced to
// the field's declared type (boolean/number) when known.
export default function buildAnnotationsForSession(
  row: Record<string, string>,
  annotator: string,
  headers: string[],
  fieldTypes: Record<string, string> = {},
): AnnotationObject[] {
  // Group columns by index — each index produces one annotation object
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

  const annotations: AnnotationObject[] = [];
  const sortedIndices = [...groups.keys()].sort((a, b) => a - b);

  for (const index of sortedIndices) {
    const fields = groups.get(index)!;
    if (Object.keys(fields).length === 0) continue;

    annotations.push({
      _id: String(index),
      identifiedBy: "HUMAN",
      ...fields,
    });
  }

  return annotations;
}
