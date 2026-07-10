import type { AnnotationTemplateConfig } from "../humanAnnotations.types";
import buildAnnotationTemplateColumns from "./buildAnnotationTemplateColumns";
import buildAnnotationTemplateRows from "./buildAnnotationTemplateRows";
import parseAnnotationColumn from "./parseAnnotationColumns";

// Matches the SessionTranscript shape of upstream's buildAnnotationTemplateRows.
interface SessionTranscript {
  sessionName: string;
  transcript: Array<{
    sequence_id?: string;
    role: string;
    content: string;
  }>;
}

// Fork-only entry point for template generation. PER_UTTERANCE delegates to
// upstream's builders untouched. PER_SESSION emits one row per session with a
// read-only joined transcript as context, and stores annotations at the
// session root (mirroring AI per-session output). The annotator columns are
// recovered from upstream's column builder rather than rebuilt, so the
// annotator[<name>][<slot>]<field> format has a single source of truth.
export default function buildAnnotationTemplate(
  config: AnnotationTemplateConfig,
  sessions: SessionTranscript[],
  annotationType: string,
): { columns: string[]; rows: Array<Record<string, string>> } {
  const upstreamColumns = buildAnnotationTemplateColumns(config);

  if (annotationType !== "PER_SESSION") {
    return {
      columns: upstreamColumns,
      rows: buildAnnotationTemplateRows(sessions, upstreamColumns),
    };
  }

  const annotatorColumns = upstreamColumns.filter((column) =>
    parseAnnotationColumn(column),
  );
  const columns = ["session_id", "content", ...annotatorColumns];

  const rows = sessions.map((session) => {
    const row: Record<string, string> = {};
    for (const column of columns) {
      row[column] = "";
    }
    row.session_id = session.sessionName;
    row.content = session.transcript
      .map((utterance) => `${utterance.role}: ${utterance.content}`)
      .join("\n");
    return row;
  });

  return { columns, rows };
}
