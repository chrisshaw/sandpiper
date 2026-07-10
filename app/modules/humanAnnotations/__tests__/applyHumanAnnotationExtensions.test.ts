import { describe, expect, it } from "vitest";
import type { Run } from "~/modules/runs/runs.types";
import applyHumanAnnotationExtensions from "../helpers/applyHumanAnnotationExtensions";

function mockRun(
  annotationType: string,
  fields: Array<{ fieldKey: string; fieldType?: string }>,
): Run {
  return {
    _id: "run1",
    snapshot: {
      prompt: {
        annotationType,
        annotationSchema: fields.map((f) => ({
          fieldKey: f.fieldKey,
          value: "",
          isSystem: false,
          ...(f.fieldType ? { fieldType: f.fieldType } : {}),
        })),
      },
    },
  } as unknown as Run;
}

describe("applyHumanAnnotationExtensions", () => {
  it("writes coerced session-level annotations for PER_SESSION runs", () => {
    const originalJSON = { transcript: [] };
    const headers = ["annotator[joe][0]ON_TASK"];

    applyHumanAnnotationExtensions({
      originalJSON,
      sessionRows: [{ "annotator[joe][0]ON_TASK": "TRUE" }],
      annotator: "joe",
      headers,
      run: mockRun("PER_SESSION", [
        { fieldKey: "ON_TASK", fieldType: "boolean" },
      ]),
    });

    expect(originalJSON).toMatchObject({
      annotations: [{ _id: "0", identifiedBy: "HUMAN", ON_TASK: true }],
    });
  });

  it("appends to existing session-level annotations", () => {
    const originalJSON = {
      annotations: [{ _id: "0", identifiedBy: "AI", ON_TASK: false }],
    };

    applyHumanAnnotationExtensions({
      originalJSON,
      sessionRows: [{ "annotator[joe][0]ON_TASK": "yes" }],
      annotator: "joe",
      headers: ["annotator[joe][0]ON_TASK"],
      run: mockRun("PER_SESSION", [
        { fieldKey: "ON_TASK", fieldType: "boolean" },
      ]),
    });

    expect(originalJSON.annotations).toHaveLength(2);
    expect(originalJSON.annotations[1]).toMatchObject({ ON_TASK: true });
  });

  it("coerces utterance annotations written by the upstream loop", () => {
    const originalJSON = {
      transcript: [
        {
          _id: "utt-1",
          annotations: [
            { _id: "0", identifiedBy: "HUMAN", PRAISE: "TRUE", score: "3" },
            { _id: "0", identifiedBy: "AI", PRAISE: false },
          ],
        },
      ],
    };

    applyHumanAnnotationExtensions({
      originalJSON,
      sessionRows: [],
      annotator: "joe",
      headers: [],
      run: mockRun("PER_UTTERANCE", [
        { fieldKey: "PRAISE", fieldType: "boolean" },
        { fieldKey: "score", fieldType: "number" },
      ]),
    });

    expect(originalJSON.transcript[0].annotations[0]).toEqual({
      _id: "0",
      identifiedBy: "HUMAN",
      PRAISE: true,
      score: 3,
    });
    // AI annotations are left alone
    expect(originalJSON.transcript[0].annotations[1].PRAISE).toBe(false);
  });

  it("leaves unrecognized and untyped values untouched", () => {
    const originalJSON = {
      transcript: [
        {
          _id: "utt-1",
          annotations: [
            { _id: "0", identifiedBy: "HUMAN", PRAISE: "maybe", NOTE: "TRUE" },
          ],
        },
      ],
    };

    applyHumanAnnotationExtensions({
      originalJSON,
      sessionRows: [],
      annotator: "joe",
      headers: [],
      run: mockRun("PER_UTTERANCE", [
        { fieldKey: "PRAISE", fieldType: "boolean" },
      ]),
    });

    expect(originalJSON.transcript[0].annotations[0]).toMatchObject({
      PRAISE: "maybe",
      NOTE: "TRUE",
    });
  });

  it("is a no-op for a PER_UTTERANCE run without typed fields", () => {
    const originalJSON = {
      transcript: [
        {
          _id: "utt-1",
          annotations: [{ _id: "0", identifiedBy: "HUMAN", PRAISE: "TRUE" }],
        },
      ],
    };

    applyHumanAnnotationExtensions({
      originalJSON,
      sessionRows: [],
      annotator: "joe",
      headers: [],
      run: mockRun("PER_UTTERANCE", [{ fieldKey: "PRAISE" }]),
    });

    expect(originalJSON.transcript[0].annotations[0].PRAISE).toBe("TRUE");
  });
});
