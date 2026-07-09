import type { RunAnnotationType } from "~/modules/runs/runs.types";

interface SessionTranscript {
  sessionName: string;
  transcript: Array<{
    sequence_id?: string;
    role: string;
    content: string;
  }>;
}

function buildTranscriptText(
  transcript: SessionTranscript["transcript"],
): string {
  return transcript.map((u) => `${u.role}: ${u.content}`).join("\n");
}

export default function buildAnnotationTemplateRows(
  sessions: SessionTranscript[],
  columns: string[],
  annotationType: RunAnnotationType = "PER_UTTERANCE",
): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];

  for (const session of sessions) {
    if (annotationType === "PER_SESSION") {
      const row: Record<string, string> = {};
      for (const col of columns) {
        row[col] = "";
      }
      row.session_id = session.sessionName;
      row.content = buildTranscriptText(session.transcript);
      rows.push(row);
      continue;
    }

    for (let i = 0; i < session.transcript.length; i++) {
      const utterance = session.transcript[i];
      const row: Record<string, string> = {};

      for (const col of columns) {
        row[col] = "";
      }

      row.session_id = session.sessionName;
      row.sequence_id = utterance.sequence_id ?? String(i + 1);
      row.role = utterance.role;
      row.content = utterance.content;

      rows.push(row);
    }
  }

  return rows;
}
