import { createStaticRuntimeAdapter } from "./static-runtime.mjs";

/** Gemini CLI runtime adapter — static compatibility only (v0.2 plan §15).
 * Per-runtime facts live in knowledge-base/runtimes/gemini-cli.json. */
export const geminiCliAdapter = createStaticRuntimeAdapter("gemini-cli", { label: "Gemini CLI" });
