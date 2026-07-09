import type { RunAnnotationType } from "~/modules/runs/runs.types";
import type { AnnotationTemplateConfig } from "../humanAnnotations.types";

const UTTERANCE_CONTEXT_COLUMNS = [
  "session_id",
  "sequence_id",
  "role",
  "content",
];
const SESSION_CONTEXT_COLUMNS = ["session_id", "content"];

export default function buildAnnotationTemplateColumns(
  config: AnnotationTemplateConfig,
  annotationType: RunAnnotationType = "PER_UTTERANCE",
): string[] {
  const columns =
    annotationType === "PER_SESSION"
      ? [...SESSION_CONTEXT_COLUMNS]
      : [...UTTERANCE_CONTEXT_COLUMNS];

  for (const annotator of config.annotators) {
    for (const field of config.fields) {
      for (let i = 0; i < field.slots; i++) {
        columns.push(`annotator[${annotator}][${i}]${field.fieldKey}`);
      }
    }
  }

  return columns;
}
