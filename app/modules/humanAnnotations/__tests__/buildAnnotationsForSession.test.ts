import { describe, expect, it } from "vitest";
import buildAnnotationsForSession from "../helpers/buildAnnotationsForSession";

describe("buildAnnotationsForSession", () => {
  it("builds a session-level annotation keyed by slot index", () => {
    const row = { "annotator[joe][0]ON_TASK": "TRUE" };
    const headers = ["annotator[joe][0]ON_TASK"];

    const result = buildAnnotationsForSession(row, "joe", headers, {
      ON_TASK: "boolean",
    });

    expect(result).toEqual([
      { _id: "0", identifiedBy: "HUMAN", ON_TASK: true },
    ]);
  });

  it("coerces FALSE to a real boolean so it renders as a checkbox", () => {
    const row = { "annotator[joe][0]ON_TASK": "FALSE" };
    const headers = ["annotator[joe][0]ON_TASK"];

    const result = buildAnnotationsForSession(row, "joe", headers, {
      ON_TASK: "boolean",
    });

    expect(result[0].ON_TASK).toBe(false);
  });

  it("keeps raw strings when no field type is known", () => {
    const row = { "annotator[joe][0]RATING": "high" };
    const headers = ["annotator[joe][0]RATING"];

    const result = buildAnnotationsForSession(row, "joe", headers);

    expect(result).toEqual([
      { _id: "0", identifiedBy: "HUMAN", RATING: "high" },
    ]);
  });

  it("only includes the specified annotator's columns", () => {
    const row = {
      "annotator[joe][0]ON_TASK": "TRUE",
      "annotator[bob][0]ON_TASK": "FALSE",
    };
    const headers = ["annotator[joe][0]ON_TASK", "annotator[bob][0]ON_TASK"];

    const result = buildAnnotationsForSession(row, "joe", headers, {
      ON_TASK: "boolean",
    });

    expect(result).toEqual([
      { _id: "0", identifiedBy: "HUMAN", ON_TASK: true },
    ]);
  });
});
