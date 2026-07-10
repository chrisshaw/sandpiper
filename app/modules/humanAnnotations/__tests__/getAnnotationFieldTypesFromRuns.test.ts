import { describe, expect, it } from "vitest";
import type { Run } from "~/modules/runs/runs.types";
import getAnnotationFieldTypesFromRuns from "../helpers/getAnnotationFieldTypesFromRuns";

function mockRun(
  fields: Array<{ fieldKey: string; isSystem?: boolean; fieldType?: string }>,
): Run {
  return {
    _id: "run1",
    name: "Test Run",
    project: "project1",
    snapshot: {
      prompt: {
        _id: "prompt1",
        name: "Test Prompt",
        annotationSchema: fields.map((f) => ({
          fieldKey: f.fieldKey,
          value: "",
          isSystem: f.isSystem ?? false,
          ...(f.fieldType ? { fieldType: f.fieldType } : {}),
        })),
        annotationType: "PER_UTTERANCE",
        version: 1,
      },
    },
  } as unknown as Run;
}

describe("getAnnotationFieldTypesFromRuns", () => {
  it("maps each typed field to its type", () => {
    const runs = [
      mockRun([
        { fieldKey: "ON_TASK", fieldType: "boolean" },
        { fieldKey: "NOTES", fieldType: "string" },
        { fieldKey: "UNTYPED" },
      ]),
    ];

    expect(getAnnotationFieldTypesFromRuns(runs)).toEqual({
      ON_TASK: "boolean",
      NOTES: "string",
    });
  });

  it("keeps the first declared type when runs disagree", () => {
    const runs = [
      mockRun([{ fieldKey: "SCORE", fieldType: "number" }]),
      mockRun([{ fieldKey: "SCORE", fieldType: "string" }]),
    ];

    expect(getAnnotationFieldTypesFromRuns(runs)).toEqual({ SCORE: "number" });
  });

  it("ignores system fields and runs without a schema", () => {
    const runs = [
      mockRun([{ fieldKey: "SYS", isSystem: true, fieldType: "boolean" }]),
      { _id: "run2" } as unknown as Run,
    ];

    expect(getAnnotationFieldTypesFromRuns(runs)).toEqual({});
  });
});
