import groupAnnotationColumns from "./groupAnnotationColumns";

interface AnnotationObject {
  _id: string;
  identifiedBy: "HUMAN";
  [key: string]: unknown;
}

// Session-level counterpart to buildAnnotationsForUtterance. Produces annotation
// objects stored on the session root (mirroring AI per-session output), so the
// `_id` is the slot index rather than an utterance id.
export default function buildAnnotationsForSession(
  row: Record<string, string>,
  annotator: string,
  headers: string[],
  fieldTypes: Record<string, string> = {},
): AnnotationObject[] {
  const groups = groupAnnotationColumns(row, annotator, headers, fieldTypes);

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
