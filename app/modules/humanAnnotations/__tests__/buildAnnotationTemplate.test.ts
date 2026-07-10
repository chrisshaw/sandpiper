import { describe, expect, it } from "vitest";
import buildAnnotationTemplate from "../helpers/buildAnnotationTemplate";

const SESSIONS = [
  {
    sessionName: "session_001.json",
    transcript: [
      { sequence_id: "1", role: "Tutor", content: "Hello!" },
      { sequence_id: "2", role: "Student", content: "Hi!" },
    ],
  },
  {
    sessionName: "session_002.json",
    transcript: [{ sequence_id: "1", role: "Tutor", content: "Yo" }],
  },
];

describe("buildAnnotationTemplate", () => {
  it("delegates to upstream's per-utterance template for PER_UTTERANCE", () => {
    const { columns, rows } = buildAnnotationTemplate(
      {
        annotators: ["joe"],
        fields: [{ fieldKey: "ON_TASK", slots: 1 }],
      },
      SESSIONS,
      "PER_UTTERANCE",
    );

    expect(columns).toEqual([
      "session_id",
      "sequence_id",
      "role",
      "content",
      "annotator[joe][0]ON_TASK",
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].session_id).toBe("session_001.json");
    expect(rows[0].sequence_id).toBe("1");
  });

  it("uses session-level context columns for PER_SESSION", () => {
    const { columns } = buildAnnotationTemplate(
      {
        annotators: ["joe"],
        fields: [{ fieldKey: "ON_TASK", slots: 1 }],
      },
      SESSIONS,
      "PER_SESSION",
    );

    expect(columns).toEqual([
      "session_id",
      "content",
      "annotator[joe][0]ON_TASK",
    ]);
  });

  it("emits one row per session with the joined transcript as content", () => {
    const { rows } = buildAnnotationTemplate(
      {
        annotators: ["joe"],
        fields: [{ fieldKey: "ON_TASK", slots: 1 }],
      },
      SESSIONS,
      "PER_SESSION",
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      session_id: "session_001.json",
      content: "Tutor: Hello!\nStudent: Hi!",
      "annotator[joe][0]ON_TASK": "",
    });
    expect(rows[1].session_id).toBe("session_002.json");
  });

  it("keeps annotator columns for multiple annotators and slots", () => {
    const { columns } = buildAnnotationTemplate(
      {
        annotators: ["joe", "josephine"],
        fields: [{ fieldKey: "TUTOR_MOVE", slots: 2 }],
      },
      [],
      "PER_SESSION",
    );

    expect(columns).toEqual([
      "session_id",
      "content",
      "annotator[joe][0]TUTOR_MOVE",
      "annotator[joe][1]TUTOR_MOVE",
      "annotator[josephine][0]TUTOR_MOVE",
      "annotator[josephine][1]TUTOR_MOVE",
    ]);
  });
});
