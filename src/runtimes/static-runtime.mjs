import {
  adapterContract,
  buildTriggerResult,
  probeRuntimeVersion,
  requireTriggerContext
} from "./base.mjs";

/**
 * Static-only runtime adapters (v0.2 Milestone 6, plan §15): Cursor, Gemini
 * CLI and OpenCode get detect/version/capabilities and static
 * compatibility metadata only. A live trigger run on them reports
 * `unsupported` — an execution state that is reported separately from every
 * binary metric, never folded into not_triggered or infra_error.
 *
 * The three adapters are identical in shape (static scope, no live runner),
 * so they share this factory; per-runtime facts stay in
 * knowledge-base/runtimes/<id>.json.
 */

export function createStaticRuntimeAdapter(id, { versionArgs = ["--version"], label } = {}) {
  return adapterContract({
    id,
    versionArgs,

    async detect(context) {
      return (await probeRuntimeVersion(requireTriggerContext(context), versionArgs)) !== null;
    },

    async version(context) {
      return probeRuntimeVersion(requireTriggerContext(context), versionArgs);
    },

    capabilities() {
      return Object.freeze({
        staticCompatibility: true,
        liveTriggerRunner: false,
        provenance: `knowledge-base/runtimes/${id}.json (plan §15: static compatibility only in v0.2)`
      });
    },

    async prepareWorkspace(context) {
      // Milestone 7 builds genuinely isolated workspaces; M6 only validates
      // the explicit context shape. Static runtimes never execute.
      return requireTriggerContext(context);
    },

    async runTriggerCase({ context }) {
      return buildTriggerResult({
        status: "unsupported",
        runtime: id,
        runtimeVersion: null,
        durationMs: null,
        evidence: [
          {
            kind: "unsupported",
            detail: `${label ?? id} is a static-compatibility runtime in v0.2 (plan §15); live trigger execution is not implemented and must not be simulated.`
          }
        ],
        tracePath: null
      });
    },

    parseTrace() {
      return {
        status: "unsupported",
        evidence: [{ kind: "unsupported", detail: `${label ?? id} traces are not parsed in v0.2 (static compatibility only).` }]
      };
    },

    buildTriggerResult
  });
}
