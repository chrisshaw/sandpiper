// Not a storage adapter. app/adapters.js auto-imports every directory in
// app/storageAdapters into the generated app/modules/storage/storage.ts,
// which server.ts, app/entry.server.tsx, and workers/index.ts all load at
// startup. That auto-import is the one hook this fork has for registering
// extra LLM providers without editing upstream's app/modules/llm/llm.ts.
// Registering no storage adapter here is harmless: getStorageAdapter looks
// adapters up by the STORAGE_ADAPTER env var.
import "~/modules/llm/providers/bedrock";
