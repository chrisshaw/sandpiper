import { describe, expect, it } from "vitest";
import coerceAnnotationValue from "../helpers/coerceAnnotationValue";

describe("coerceAnnotationValue", () => {
  it("coerces boolean spellings to real booleans", () => {
    for (const truthy of ["TRUE", "true", "True", "1", "yes", "y"]) {
      expect(coerceAnnotationValue(truthy, "boolean")).toBe(true);
    }
    for (const falsy of ["FALSE", "false", "False", "0", "no", "n"]) {
      expect(coerceAnnotationValue(falsy, "boolean")).toBe(false);
    }
  });

  it("leaves an unrecognized boolean value untouched", () => {
    expect(coerceAnnotationValue("maybe", "boolean")).toBe("maybe");
  });

  it("coerces numeric strings to numbers", () => {
    expect(coerceAnnotationValue("4", "number")).toBe(4);
    expect(coerceAnnotationValue("0", "number")).toBe(0);
    expect(coerceAnnotationValue("-2.5", "number")).toBe(-2.5);
  });

  it("leaves a non-numeric value untouched for number fields", () => {
    expect(coerceAnnotationValue("high", "number")).toBe("high");
    expect(coerceAnnotationValue("", "number")).toBe("");
  });

  it("passes through string fields and unknown/absent types", () => {
    expect(coerceAnnotationValue("EXPLAIN", "string")).toBe("EXPLAIN");
    expect(coerceAnnotationValue("TRUE")).toBe("TRUE");
  });
});
