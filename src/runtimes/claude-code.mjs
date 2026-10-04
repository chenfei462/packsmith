import {
  adapterContract,
  buildTriggerResult,
  probeRuntimeVersion,
  requireTriggerContext,
  runLiveTriggerCase
} from "./base.mjs";

/**
 * Claude Code runtime adapter (v0.2 Milestone 6, plan §14–16).
 *
 * Live trigger runtime for claude 2.1.215 (see
 * docs/plans/packsmith-v0.2-wave2-runtime-verification.md): `-p` headless
 * mode with `--output-format stream-json --verbose` streams SDK messages;
 * the prompt arrives via stdin.
 *
 * Message envelope (official Agent SDK typescript reference, 2026-10-04
 * read-only copy): SDKAssistantMessage carries `session_id`,
 * `parent_tool_use_id` and the error/aborted markers at the TOP LEVEL
 * (`error`: authentication_failed | rate_limit | overloaded | …,
 * `aborted: true`); tool_use/tool_result blocks live in
 * `message.content`; SDKResultMessage has success and error arms
 * (subtype error_during_execution / …, is_error).
 *
 * Evidence rules (conservative, no final-answer heuristics):
 *   triggered     a Skill tool_use with input.skill EXACTLY equal to the
 *                 target skill, correlated by tool_use_id within the SAME
 *                 (session_id, parent_tool_use_id) scope and AFTER the
 *                 call, to a non-error tool_result, on a successful result
 *   ambiguous     Skill tool_use without a correlated in-scope result; a
 *                 tool_result marked is_error; replayed (result before
 *                 call) or duplicate tool ids; unknown Skill input shapes
 *                 (the Skill tool's input FIELD NAME is not confirmed by
 *                 local typings — no SkillInput — so only input.skill is
 *                 matched and anything else is not guessed); aborted
 *                 messages; truncated streams; missing final result
 *   infra_error   final result error arms and assistant error markers —
 *                 the runner's spawn/nonzero/timeout classification takes
 *                 precedence
 *   not_triggered successful result with no target-skill invocation
 *                 (other skills, other tools and text mentions are decoys)
 *
 * A binary verdict requires a COMPLETE stream: error/incomplete evidence
 * takes precedence over any completed invocation.
 */

const SKILL_TOOL_NAME = "Skill";

function scopeKey(sessionId, parentToolUseId) {
  return `${sessionId ?? ""}|${parentToolUseId ?? ""}`;
}

/**
 * Parse one Claude Code stream-json trace (pure). See the module docblock
 * for the classification rules; the runner's spawn/nonzero/timeout
 * outcomes take precedence over anything computed here.
 */
export function parseClaudeTrace(streamText, { skillName }) {
  const evidence = [];
  let sawMalformed = false;
  let sawAssistantError = false;
  let sawAborted = false;
  let sawResult = false;
  let sawResultError = false;
  let triggered = false;
  let hasAmbiguousInvocation = false;

  // Correlation state, scoped by (session_id, parent_tool_use_id):
  // `pending`/`consumed` track TARGET-skill Skill calls by tool_use_id;
  // `otherCallIds` registers EVERY other tool_use id so a duplicate id —
  // whatever tool or skill it belongs to — is caught conservatively
  // (round 2 review: register ids before filtering by tool/target).
  const pending = new Map();
  const consumed = new Map();
  const otherCallIds = new Set();
  const seenResults = new Set();
  const duplicatedIds = new Set();

  for (const line of streamText.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    let event;

    try {
      event = JSON.parse(line);
    } catch {
      sawMalformed = true;
      continue;
    }

    const sessionId = typeof event?.session_id === "string" ? event.session_id : null;
    const parentToolUseId = typeof event?.parent_tool_use_id === "string" ? event.parent_tool_use_id : null;
    const scope = scopeKey(sessionId, parentToolUseId);

    if (event?.type === "assistant") {
      if (event.error !== undefined) {
        sawAssistantError = true;
        evidence.push({
          kind: "assistant-error",
          detail: `assistant error marker (top level): ${JSON.stringify(event.error)}`
        });
      }

      if (event.aborted === true) {
        sawAborted = true;
        evidence.push({ kind: "aborted-message", detail: "assistant message was aborted/truncated mid-stream" });
      }

      const content = event.message?.content;

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type !== "tool_use" || block.name !== SKILL_TOOL_NAME) {
            continue;
          }

          const id = typeof block.id === "string" ? block.id : null;
          const inputSkill = block.input?.skill;

          if (typeof inputSkill !== "string") {
            // Unknown input shape: the Skill tool's field names are not
            // confirmed by local typings — never guess from other values.
            hasAmbiguousInvocation = true;
            evidence.push({
              kind: "unknown-skill-input",
              detail: `Skill tool_use ${JSON.stringify(id)} has an unrecognized input shape; refusing to classify it as a decoy`
            });
            continue;
          }

          if (inputSkill !== skillName) {
            // Another skill's call still REGISTERS its id: a later target
            // call reusing the same id is a duplicate, not evidence.
            if (id !== null) {
              otherCallIds.add(id);
            }
            continue;
          }

          if (id === null) {
            hasAmbiguousInvocation = true;
            evidence.push({ kind: "unknown-skill-input", detail: "target-skill Skill tool_use carries no tool_use id" });
            continue;
          }

          if (seenResults.has(id) || consumed.has(id) || pending.has(id) || otherCallIds.has(id)) {
            duplicatedIds.add(id);
            hasAmbiguousInvocation = true;
            evidence.push({
              kind: "duplicate-tool-id",
              detail: `tool_use_id ${JSON.stringify(id)} for "${skillName}" appears more than once (replay or duplicate)`
            });
            continue;
          }

          pending.set(id, scope);
        }
      }

      continue;
    }

    if (event?.type === "user") {
      const content = event.message?.content;

      if (!Array.isArray(content)) {
        continue;
      }

      for (const block of content) {
        if (block?.type !== "tool_result" || typeof block.tool_use_id !== "string") {
          continue;
        }

        const id = block.tool_use_id;

        if (pending.get(id) === scope) {
          pending.delete(id);
          consumed.set(id, { scope, isError: block.is_error === true });

          if (block.is_error === true) {
            hasAmbiguousInvocation = true;
            evidence.push({
              kind: "failed-skill-result",
              detail: `Skill invocation of "${skillName}" (${JSON.stringify(id)}) returned is_error: ${JSON.stringify(block.content ?? "")}`
            });
          } else {
            triggered = true;
            evidence.push({ kind: "skill-invocation", detail: `Skill tool invoked with exact name "${skillName}"` });
            evidence.push({ kind: "skill-result", detail: `correlated non-error tool_result for ${JSON.stringify(id)}` });
          }

          continue;
        }

        // A result that does not complete a pending in-scope call: either a
        // replay (result before the call) or a foreign tool result.
        seenResults.add(id);

        if (consumed.has(id)) {
          duplicatedIds.add(id);
          hasAmbiguousInvocation = true;
          evidence.push({
            kind: "duplicate-tool-id",
            detail: `duplicate tool_result for ${JSON.stringify(id)}`
          });
        }
      }

      continue;
    }

    if (event?.type === "result") {
      sawResult = true;

      if (event.subtype !== "success" || event.is_error === true) {
        sawResultError = true;
        evidence.push({
          kind: "result-error",
          detail: `final result error: subtype ${JSON.stringify(event.subtype)}, is_error ${JSON.stringify(event.is_error)}`
        });
      }
    }
  }

  // Calls whose in-scope result never arrived are inconclusive.
  for (const [id] of pending) {
    hasAmbiguousInvocation = true;
    evidence.push({
      kind: "missing-tool-result",
      detail: `Skill tool_use ${JSON.stringify(id)} has no correlated tool_result within its session/parent scope`
    });
  }

  if (sawMalformed) {
    return {
      status: "ambiguous",
      evidence: evidence.concat([{ kind: "malformed-stream", detail: "at least one JSONL line was truncated or unparsable" }])
    };
  }

  if (sawResultError || sawAssistantError) {
    return { status: "infra_error", evidence };
  }

  if (!sawResult || sawAborted || hasAmbiguousInvocation || duplicatedIds.size > 0) {
    return { status: "ambiguous", evidence };
  }

  if (triggered) {
    return { status: "triggered", evidence };
  }

  return { status: "not_triggered", evidence };
}

/** Claude headless argv for one trigger case: stream-json + verbose, prompt
 * via stdin. Session persistence/permissions/isolation tuning belongs to
 * Milestone 7's explicit context. */
function buildClaudeArgs() {
  return ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk"];
}

export const claudeCodeAdapter = adapterContract({
  id: "claude-code",
  versionArgs: ["--version"],

  async detect(context) {
    return (await probeRuntimeVersion(requireTriggerContext(context), this.versionArgs)) !== null;
  },

  async version(context) {
    return probeRuntimeVersion(requireTriggerContext(context), this.versionArgs);
  },

  capabilities() {
    return Object.freeze({
      staticCompatibility: true,
      liveTriggerRunner: true,
      provenance: "knowledge-base/runtimes/claude-code.json; verified protocol in docs/plans/packsmith-v0.2-wave2-runtime-verification.md"
    });
  },

  async prepareWorkspace(context) {
    // Milestone 7 builds genuinely isolated workspaces; M6 only validates
    // the explicit context shape and never defaults to the real project.
    return requireTriggerContext(context);
  },

  async runTriggerCase({ skill, prompt, context }) {
    return runLiveTriggerCase(this, {
      skill,
      prompt,
      context,
      buildArgs: buildClaudeArgs,
      parseTrace: (streamText) => parseClaudeTrace(streamText, { skillName: skill })
    });
  },

  parseTrace(streamText, { skillName } = {}) {
    return parseClaudeTrace(streamText, { skillName: String(skillName ?? "") });
  },

  buildTriggerResult
});
