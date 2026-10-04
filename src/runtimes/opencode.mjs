import { createStaticRuntimeAdapter } from "./static-runtime.mjs";

/** OpenCode runtime adapter — static compatibility only (v0.2 plan §15).
 * Per-runtime facts live in knowledge-base/runtimes/opencode.json. */
export const opencodeAdapter = createStaticRuntimeAdapter("opencode", { label: "OpenCode" });
