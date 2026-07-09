import { describe, expect, it } from "vitest";
import { resolveModelId, toBedrockMessages } from "../bedrock";

describe("resolveModelId", () => {
  it("maps an Anthropic model code to its Bedrock inference profile", () => {
    expect(resolveModelId("anthropic.claude-4.5-sonnet")).toBe(
      "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    );
    expect(resolveModelId("claude-opus-4-8")).toBe(
      "us.anthropic.claude-opus-4-8",
    );
  });

  it("maps non-Anthropic dropdown codes to local Claude stand-ins", () => {
    expect(resolveModelId("openai.gpt-5.1")).toBe(
      "us.anthropic.claude-sonnet-4-6",
    );
    expect(resolveModelId("nto.google.gemini-3-flash-preview")).toBe(
      "us.anthropic.claude-sonnet-4-6",
    );
  });

  it("throws a clear error for an unmapped model code", () => {
    expect(() => resolveModelId("some.unknown.model")).toThrow(
      /No Bedrock mapping for model/,
    );
  });
});

describe("toBedrockMessages", () => {
  it("splits system blocks out and keeps a system+user turn", () => {
    const { system, conversation } = toBedrockMessages([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Annotate this." },
    ]);

    expect(system).toEqual([{ text: "You are helpful." }]);
    expect(conversation).toEqual([
      { role: "user", content: [{ text: "Annotate this." }] },
    ]);
  });

  it("relabels a leading assistant run to user (orchestrator path)", () => {
    const { system, conversation } = toBedrockMessages([
      { role: "assistant", content: "Orchestrator prompt." },
      { role: "assistant", content: "Score this output." },
    ]);

    // Bedrock requires the conversation to start with a user turn; the two
    // assistant priming messages merge into one user turn.
    expect(system).toEqual([]);
    expect(conversation).toEqual([
      {
        role: "user",
        content: [
          { text: "Orchestrator prompt." },
          { text: "Score this output." },
        ],
      },
    ]);
  });

  it("merges consecutive same-role turns", () => {
    const { conversation } = toBedrockMessages([
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ]);

    expect(conversation).toEqual([
      { role: "user", content: [{ text: "a" }, { text: "b" }] },
    ]);
  });
});
