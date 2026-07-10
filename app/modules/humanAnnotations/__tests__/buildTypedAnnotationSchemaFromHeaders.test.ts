import { describe, expect, it } from "vitest";
import buildTypedAnnotationSchemaFromHeaders from "../helpers/buildTypedAnnotationSchemaFromHeaders";

describe("buildTypedAnnotationSchemaFromHeaders", () => {
  it("returns upstream's untyped string schema when no types are known", () => {
    const headers = ["session_id", "annotator[joe][0]TUTOR_MOVE"];

    const result = buildTypedAnnotationSchemaFromHeaders(headers, {});

    expect(result).toEqual([
      { fieldKey: "TUTOR_MOVE", value: "", isSystem: false },
    ]);
  });

  it("carries the field type and a typed default value when known", () => {
    const headers = [
      "session_id",
      "annotator[joe][0]ON_TASK",
      "annotator[joe][0]ENGAGEMENT",
    ];

    const result = buildTypedAnnotationSchemaFromHeaders(headers, {
      ON_TASK: "boolean",
      ENGAGEMENT: "number",
    });

    expect(result).toContainEqual({
      fieldKey: "ON_TASK",
      value: false,
      isSystem: false,
      fieldType: "boolean",
    });
    expect(result).toContainEqual({
      fieldKey: "ENGAGEMENT",
      value: 0,
      isSystem: false,
      fieldType: "number",
    });
  });

  it("deduplicates fields across multiple slots", () => {
    const headers = ["annotator[joe][0]ON_TASK", "annotator[joe][1]ON_TASK"];

    const result = buildTypedAnnotationSchemaFromHeaders(headers, {
      ON_TASK: "boolean",
    });

    expect(result).toHaveLength(1);
    expect(result[0].fieldKey).toBe("ON_TASK");
  });
});
