import {
  BedrockRuntimeClient,
  type BedrockRuntimeClientConfig,
  type ContentBlock,
  ConverseCommand,
  type Message,
  type SystemContentBlock,
  type ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
import bedrockConfigRaw from "~/config/bedrock_models.json";
import registerLLM from "../helpers/registerLLM";

interface BedrockConfig {
  region: string;
  models: Record<string, string>;
}

const bedrockConfig = bedrockConfigRaw as BedrockConfig;

// Claude on Bedrock caps output well above this; big enough that annotation JSON
// is not truncated (a truncated response would fail JSON parsing).
const DEFAULT_MAX_TOKENS = 8192;
const STRUCTURED_TOOL_NAME = "structured_output";

// The gateway provider sends `response_format: { type: "json_object" }` when no
// schema is given, so callers may rely on a JSON reply while their prompt asks
// for a plain-text shape (e.g. leadRole.prompt.json). Converse has no
// response_format, so state the constraint in the system prompt instead.
const JSON_OBJECT_INSTRUCTION =
  "Reply with a single valid JSON object and nothing else. Do not wrap it in code fences or add any prose.";

// Map an ai_gateway.json model code (e.g. "anthropic.claude-4.5-sonnet") to a
// Bedrock model / inference-profile id. Base model ids require an inference
// profile, so these are the `us.` profile ids.
export function resolveModelId(code: string): string {
  const modelId = bedrockConfig.models[code];
  if (!modelId) {
    throw new Error(
      `No Bedrock mapping for model "${code}". Add it to app/config/bedrock_models.json.`,
    );
  }
  return modelId;
}

function getRegion(): string {
  return process.env.AWS_REGION || bedrockConfig.region;
}

function buildClient(): BedrockRuntimeClient {
  const config: BedrockRuntimeClientConfig = { region: getRegion() };

  const apiKey =
    process.env.BEDROCK_API_KEY || process.env.AWS_BEARER_TOKEN_BEDROCK;
  const { AWS_KEY, AWS_SECRET } = process.env;

  if (apiKey) {
    // Bedrock API key (bearer token) — lets a team member authenticate with a
    // single key instead of an IAM access key/secret pair.
    config.token = { token: apiKey };
    config.authSchemePreference = ["httpBearerAuth"];
  } else if (AWS_KEY && AWS_SECRET) {
    // Explicit IAM keys, mirroring the S3 adapter / production.
    config.credentials = { accessKeyId: AWS_KEY, secretAccessKey: AWS_SECRET };
  }
  // Otherwise fall back to the default AWS credential chain (~/.aws, IAM role)
  // so local dev needs nothing in .env.

  return new BedrockRuntimeClient(config);
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return text;
  return trimmed
    .replace(/^```[A-Za-z0-9_-]*[ \t]*\r?\n?/, "")
    .replace(/\r?\n?[ \t]*```[ \t]*$/, "")
    .trim();
}

// The app builds messages with roles system/user/assistant. Bedrock takes system
// blocks separately, requires the conversation to start with a user turn, and
// requires strict user/assistant alternation. The app never has genuine
// multi-turn dialogue (it's system+user, or assistant-only priming in the
// orchestrator path), so we relabel a leading assistant run to user and merge
// consecutive same-role turns.
export function toBedrockMessages(
  messages: Array<{ role: string; content: string }>,
): { system: SystemContentBlock[]; conversation: Message[] } {
  const system: SystemContentBlock[] = [];
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      system.push({ text: message.content });
    } else {
      turns.push({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      });
    }
  }

  let index = 0;
  while (index < turns.length && turns[index].role === "assistant") {
    turns[index].role = "user";
    index++;
  }

  const conversation: Message[] = [];
  for (const turn of turns) {
    const last = conversation[conversation.length - 1];
    if (last && last.role === turn.role) {
      last.content?.push({ text: turn.content });
    } else {
      conversation.push({ role: turn.role, content: [{ text: turn.content }] });
    }
  }

  return { system, conversation };
}

function buildToolConfig(schema: object): ToolConfiguration {
  return {
    tools: [
      {
        toolSpec: {
          name: STRUCTURED_TOOL_NAME,
          description: "Return the response as structured JSON.",
          inputSchema: { json: schema as DocumentType },
        },
      },
    ],
    toolChoice: { tool: { name: STRUCTURED_TOOL_NAME } },
  };
}

registerLLM("BEDROCK", {
  init: () => buildClient(),
  createChat: async ({
    llm,
    options,
    messages,
    schema,
  }: {
    llm: BedrockRuntimeClient;
    options: { model: string };
    messages: Array<{ role: string; content: string }>;
    schema?: object | string;
  }) => {
    const modelId = resolveModelId(options.model);
    const { system, conversation } = toBedrockMessages(messages);
    const schemaObject =
      typeof schema === "string" ? (JSON.parse(schema) as object) : schema;

    if (!schemaObject) {
      system.push({ text: JSON_OBJECT_INSTRUCTION });
    }

    const response = await llm.send(
      new ConverseCommand({
        modelId,
        system: system.length ? system : undefined,
        messages: conversation,
        inferenceConfig: { maxTokens: DEFAULT_MAX_TOKENS },
        toolConfig: schemaObject ? buildToolConfig(schemaObject) : undefined,
      }),
    );

    const blocks: ContentBlock[] = response.output?.message?.content ?? [];

    let content: unknown;
    if (schemaObject) {
      const toolBlock = blocks.find(
        (block): block is ContentBlock.ToolUseMember => "toolUse" in block,
      );
      content = toolBlock?.toolUse?.input;
      if (content === undefined) {
        throw new Error("Bedrock returned no structured tool output");
      }
    } else {
      const text = blocks
        .map((block) => ("text" in block ? block.text : ""))
        .join("");
      content = JSON.parse(stripJsonFence(text));
    }

    return {
      content,
      usage: {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
        // Actual AWS-billed cost isn't returned per-call; the billing ledger uses
        // calculateLlmCost (token counts x ai_gateway.json pricing) regardless.
        providerCost: 0,
      },
    };
  },
});
