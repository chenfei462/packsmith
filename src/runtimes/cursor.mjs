import { createStaticRuntimeAdapter } from "./static-runtime.mjs";

/** Cursor runtime adapter — static compatibility only (v0.2 plan §15).
 * Per-runtime facts live in knowledge-base/runtimes/cursor.json. */
export const cursorAdapter = createStaticRuntimeAdapter("cursor", { label: "Cursor" });
