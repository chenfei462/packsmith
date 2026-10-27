import path from "node:path";

import {
  adapterContract,
  buildTriggerResult,
  probeRuntimeVersion,
  requireTriggerContext,
  runLiveTriggerCase
} from "./base.mjs";

/**
 * Codex runtime adapter (v0.2 Milestone 6, plan §14–16).
 *
 * Live trigger runtime for codex-cli 0.148.0 (see
 * docs/plans/packsmith-v0.2-wave2-runtime-verification.md): `codex exec
 * --json` streams thread/turn/item/error JSONL events, the prompt arrives
 * via stdin (`-`), and CommandExecutionItem carries
 * command/aggregated_output/exit_code/status. This version has NO
 * skill-invoked item type — the ONLY activation evidence is a completed,
 * exit-code-0 execution whose actual file operand IS the exact installed
 * SKILL.md path.
 *
 * Evidence classification (conservative, no final-answer heuristics):
 *   read attempt    a known content-display command with the exact target
 *                   as its file operand (bare `type`/`cat`/…, or a single
 *                   PowerShell Get-Content statement with -LiteralPath/-Path
 *                   and at most -Raw)
 *   inconclusive    search/process tools over the target (grep -q returns
 *                   no body), option-bearing or compound/wrapper syntax the
 *                   pre-capture parser does not understand, failed/declined/
 *                   in-progress/null-exit executions, started-but-never-
 *                   completed items
 *   decoy           producer/metadata commands mentioning the path (echo,
 *                   Test-Path, Get-Item, …), reads of OTHER skills, paths
 *                   that merely extend the target (SKILL.md.bak)
 * Terminal state decides (plan review round 2): malformed streams →
 * ambiguous; error/turn.failed events → infra_error; missing
 * turn.completed → ambiguous — these take precedence over any completed
 * read, because only a COMPLETE successful stream earns a binary verdict.
 *
 * The `--ignore-user-config`/`--ignore-rules` flags are NOT isolation
 * evidence and are deliberately not used here; real workspace/home/state
 * isolation is Milestone 7's explicit context.
 */

/** Commands that display file content. Windows `type` is a cmd builtin;
 * the POSIX/PowerShell entries share the operand semantics used here. */
const READ_TOOL_TOKENS = new Set(["type", "cat", "more", "less", "head", "tail", "bat", "get-content", "gc"]);

/** Commands that only SEARCH/process content — even with the target as an
 * operand they do not prove the body was loaded (grep -q prints nothing). */
const SEARCH_TOOL_TOKENS = new Set(["grep", "rg", "findstr", "sed", "awk", "select-string"]);

/** Commands that produce, inspect or manage — a path in their arguments is
 * a mention/decoy, never a read attempt. */
const PRODUCER_TOOL_TOKENS = new Set([
  "echo",
  "printf",
  "write-output",
  "write-host",
  "test-path",
  "get-item",
  "get-childitem",
  "gci",
  "ls",
  "dir",
  "remove-item",
  "del",
  "copy",
  "cp",
  "move",
  "mv",
  "new-item",
  "out-file",
  "out-null",
  "set",
  "set-variable",
  "mkdir",
  "md",
  "rmdir"
]);

/** PowerShell Get-Content switches that do not change "the body was shown". */
const PS_READ_SWITCHES = new Set(["-raw"]);

/** PowerShell Get-Content parameters that carry the file operand. */
const PS_PATH_PARAMETERS = new Set(["-literalpath", "-path"]);

const PS_SHELL_TOKENS = new Set(["powershell", "powershell.exe", "pwsh", "pwsh.exe"]);

function canonicalizePathValue(value, workspaceDir) {
  const stripped = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  // Retained traces can be reviewed on a different OS from their producer.
  // Choose path semantics from the recorded workspace/operand, preserving
  // case-sensitive POSIX paths instead of using the reviewer's platform.
  const windowsPath = /^(?:[a-z]:[\\/]|\\\\)/i;
  if (windowsPath.test(workspaceDir) || windowsPath.test(stripped)) {
    return path.win32.resolve(workspaceDir, stripped).toLowerCase();
  }
  return path.posix.resolve(workspaceDir, stripped);
}

/** Quote-aware tokenizer. Operators (`;`, `|`, `&&`, `||`, `&`, newlines)
 * are emitted as separate tokens even when GLUED to adjacent text
 * (`...SKILL.md';Write-Output ...`), so compound detection cannot be
 * defeated by tight punctuation. `unterminated` flags untrustworthy
 * streams; `compoundOperators` records whether any conditional/pipe
 * operator appeared outside quotes. */
function tokenize(script) {
  const tokens = [];
  let current = "";
  let quote = null;
  let unterminated = false;
  let compoundOperators = false;
  let sawNewline = false;

  const flush = () => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (const character of script) {
    if (quote !== null) {
      // Quoted characters — including newlines — stay inside the token;
      // only UNQUOTED newlines are statement separators.
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "\n") {
      flush();
      tokens.push(";");
      sawNewline = true;
      continue;
    }

    if (character === '"' || character === "'") {
      flush();
      quote = character;
      continue;
    }

    if (character === ";" || character === "|" || character === "&") {
      flush();
      if ((character === "&" || character === "|") && tokens.length > 0 && tokens[tokens.length - 1] === character) {
        tokens[tokens.length - 1] = character + character;
      } else {
        tokens.push(character);
      }
      compoundOperators = true;
      continue;
    }

    if (/\s/.test(character)) {
      flush();
      continue;
    }

    current += character;
  }

  if (quote !== null) {
    unterminated = true;
  }
  flush();

  return { tokens, unterminated, compoundOperators, sawNewline };
}

function toolBaseName(token, workspaceDir) {
  const withoutQuotes = token.replace(/^["']|["']$/g, "");
  const dialect = /^(?:[a-z]:[\\/]|\\\\)/i.test(workspaceDir) ? path.win32 : path.posix;
  return dialect.basename(withoutQuotes).toLowerCase();
}

/**
 * Classify ONE simple statement (no compound operators). Returns
 * "read" | "search" | "decoy" | "inconclusive" | "no-mention" — where
 * read/search/decoy mean the TARGET path was involved in that role.
 */
/**
 * Classify ONE simple statement (no compound operators) — tokens have
 * quotes already removed, so a path operand is a single token. Returns
 * "read" | "search" | "decoy" | "inconclusive" | "no-mention".
 */
function classifyStatementTokens(statementTokens, canonicalTarget, workspaceDir) {
  if (statementTokens.length === 0) {
    return "no-mention";
  }

  const tool = toolBaseName(statementTokens[0], workspaceDir);
  const rest = statementTokens.slice(1);

  if (PS_SHELL_TOKENS.has(tool)) {
    // Handled at classifyCodexCommand level via raw -Command extraction
    // (tokenization removes the quotes that protect inner paths with
    // spaces); reaching here means a bare PS invocation without -Command.
    return "inconclusive";
  }

  if (READ_TOOL_TOKENS.has(tool)) {
    const operands = rest.filter((token) => !token.startsWith("-"));

    if (rest.some((token) => token.startsWith("-")) || operands.length !== 1) {
      return "inconclusive";
    }

    return canonicalizePathValue(operands[0], workspaceDir) === canonicalTarget ? "read" : "decoy";
  }

  if (SEARCH_TOOL_TOKENS.has(tool)) {
    // For search tools the FIRST non-option operand is the pattern; the
    // rest are files. A target used as the PATTERN is a decoy.
    const operands = rest.filter((token) => !token.startsWith("-"));

    if (operands.length >= 2 && operands.slice(1).some((operand) => canonicalizePathValue(operand, workspaceDir) === canonicalTarget)) {
      return "search";
    }

    return "no-mention";
  }

  if (PRODUCER_TOOL_TOKENS.has(tool)) {
    const mentions = rest.some((token) => canonicalizePathValue(token, workspaceDir) === canonicalTarget);
    return mentions ? "decoy" : "no-mention";
  }

  // Unknown tool mentioning the path: cannot tell what it would do.
  const mentions = rest.some((token) => canonicalizePathValue(token, workspaceDir) === canonicalTarget);
  return mentions ? "inconclusive" : "no-mention";
}

/**
 * Classify ONE PowerShell statement (inner -Command script, single
 * statement, quotes intact in the token stream). Only the documented
 * content-reading form is supported: Get-Content (gc) with at most -Raw,
 * -LiteralPath/-Path plus the path operand. Everything else that mentions
 * the target is search/inconclusive/decoy — never "read".
 */
function classifyPowerShellSingleStatement(tokens, canonicalTarget, workspaceDir) {
  if (tokens.length === 0) {
    return "no-mention";
  }

  const cmdlet = tokens[0].toLowerCase();
  const parameters = tokens.slice(1);

  if (cmdlet === "get-content" || cmdlet === "gc") {
    const pathValues = [];
    let sawUnknownParameter = false;

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index].toLowerCase();

      if (PS_READ_SWITCHES.has(parameter)) {
        continue;
      }

      if (PS_PATH_PARAMETERS.has(parameter)) {
        if (index + 1 >= parameters.length) {
          return "inconclusive";
        }
        pathValues.push(parameters[index + 1]);
        index += 1;
        continue;
      }

      if (parameter.startsWith("-")) {
        sawUnknownParameter = true;
        continue;
      }

      pathValues.push(parameters[index]);
    }

    if (sawUnknownParameter) {
      return "inconclusive";
    }

    const targetHits = pathValues.filter((value) => canonicalizePathValue(value, workspaceDir) === canonicalTarget).length;

    if (targetHits === 1 && pathValues.length === 1) {
      return "read";
    }

    if (targetHits > 0) {
      return "inconclusive";
    }

    return "decoy";
  }

  if (SEARCH_TOOL_TOKENS.has(cmdlet)) {
    const mentions = parameters.some((token) => canonicalizePathValue(token, workspaceDir) === canonicalTarget);
    return mentions ? "inconclusive" : "no-mention";
  }

  if (PRODUCER_TOOL_TOKENS.has(cmdlet)) {
    const mentions = parameters.some((token) => canonicalizePathValue(token, workspaceDir) === canonicalTarget);
    return mentions ? "decoy" : "no-mention";
  }

  const mentions = parameters.some((token) => canonicalizePathValue(token, workspaceDir) === canonicalTarget);
  return mentions ? "inconclusive" : "no-mention";
}

function hasCompoundOperatorTokens(tokens) {
  return tokens.some((token) => token === ";" || token === "|" || token === "&" || token === "&&" || token === "||");
}

/**
 * Split a token stream into segments on the unconditional separators
 * (";" — emitted for both ";" and newlines). Used only to decide whether
 * and WHERE the target is mentioned, never to assume any segment ran.
 */
function splitSegments(tokens) {
  const segments = [];
  let current = [];

  for (const token of tokens) {
    if (token === ";") {
      segments.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  segments.push(current);

  return segments.filter((segment) => segment.length > 0);
}

/**
 * Verdict for a COMPOUND command (any ";" / newline / "|" / "&" / "&&" /
 * "||"): statements after a separator are NOT assumed to execute —
 * `Write-Output 'decoy'; exit 0; Get-Content target` never reads — and
 * which parts actually ran is unknowable from the stream. The target
 * appearing in any read/search/unknown position therefore caps the verdict
 * at "inconclusive" (ambiguous, never triggered); only when every
 * mentioning segment is a producer/metadata statement does the command
 * stay a decoy.
 */
function classifyCompoundTokens(tokens, canonicalTarget, workspaceDir) {
  const segments = splitSegments(tokens);
  let sawProducerMention = false;

  for (const segment of segments) {
    const statement = classifyStatementTokens(segment, canonicalTarget, workspaceDir);

    if (statement === "decoy") {
      sawProducerMention = true;
    } else if (statement !== "no-mention") {
      // The target appears in a read/search/unknown position in some
      // segment whose execution cannot be proven — conservative cap.
      return "inconclusive";
    }
  }

  return sawProducerMention ? "decoy" : "inconclusive";
}

/**
 * Classify one raw codex command string. A "read" verdict is possible ONLY
 * for a single statement: either a bare content-display command with the
 * exact target operand, or a PowerShell wrapper whose inner -Command
 * script is exactly one supported Get-Content form (see
 * classifyPowerShellSingleStatement). The inner script is extracted from
 * the RAW token stream before quote removal destroys paths with spaces.
 */
function classifyCodexCommand(command, canonicalTarget, workspaceDir) {
  const { tokens, unterminated } = tokenize(command);

  if (unterminated) {
    return "inconclusive";
  }

  if (tokens.length === 0) {
    return "no-mention";
  }

  const tool = toolBaseName(tokens[0], workspaceDir);

  if (PS_SHELL_TOKENS.has(tool)) {
    // Only a TRUSTED wrapper prefix is understood: the shell may carry
    // explicit no-impact session options (-NoProfile/-NonInteractive/
    // -NoLogo) and then exactly one -Command/-c whose script is the FINAL
    // argument. Anything else — -File (a script file runs and the rest are
    // ITS arguments, not commands), -EncodedCommand, unknown options,
    // extra arguments — is not interpretable pre-capture and stays
    // inconclusive. No -Command at all is equally inconclusive.
    const trustedOptions = new Set(["-noprofile", "-noninteractive", "-nologo"]);
    let commandIndex = -1;

    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index];

      if (token.startsWith("-")) {
        const normalized = token.toLowerCase();

        if (normalized === "-command" || normalized === "-c") {
          commandIndex = index;
          break;
        }

        if (!trustedOptions.has(normalized)) {
          return "inconclusive";
        }

        continue;
      }

      // A non-option argument before -Command: unknown invocation shape.
      return "inconclusive";
    }

    if (commandIndex === -1 || commandIndex + 2 !== tokens.length) {
      return "inconclusive";
    }

    // tokens[commandIndex + 1] is the inner script with its outer quotes
    // removed but inner spaces preserved; strip a trailing PowerShell
    // comment and re-tokenize with the inner quotes intact.
    const inner = tokens[commandIndex + 1]
      .replace(/(?<![-\w])#.*$/, "")
      .trim();

    if (inner.length === 0) {
      return "inconclusive";
    }

    const innerTokenized = tokenize(inner);

    if (innerTokenized.unterminated) {
      return "inconclusive";
    }

    if (hasCompoundOperatorTokens(innerTokenized.tokens)) {
      return classifyCompoundTokens(innerTokenized.tokens, canonicalTarget, workspaceDir);
    }

    return classifyPowerShellSingleStatement(innerTokenized.tokens, canonicalTarget, workspaceDir);
  }

  if (hasCompoundOperatorTokens(tokens)) {
    return classifyCompoundTokens(tokens, canonicalTarget, workspaceDir);
  }

  return classifyStatementTokens(tokens, canonicalTarget, workspaceDir);
}

export function parseCodexTrace(streamText, { installedSkillPath, workspaceDir }) {
  const dialect = /^(?:[a-z]:[\\/]|\\\\)/i.test(installedSkillPath) ? path.win32 : path.posix;
  const workspace = workspaceDir ?? dialect.dirname(installedSkillPath);
  const canonicalTarget = canonicalizePathValue(installedSkillPath, workspace);
  const evidence = [];
  let sawMalformed = false;
  let sawErrorEvent = false;
  let sawTurnCompleted = false;
  let sawTurnFailed = false;
  let triggered = false;
  let hasInconclusiveAttempt = false;
  const startedIds = new Set();
  const completedIds = new Set();

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

    if (event?.type === "error") {
      sawErrorEvent = true;
      evidence.push({ kind: "stream-error", detail: String(event.message ?? "codex reported an error") });
      continue;
    }

    if (event?.type === "turn.failed") {
      sawTurnFailed = true;
      evidence.push({ kind: "turn-failed", detail: String(event.error?.message ?? "codex turn failed") });
      continue;
    }

    if (event?.type === "turn.completed") {
      sawTurnCompleted = true;
      continue;
    }

    const item = event?.item;

    if (item?.type === "command_execution" && typeof item.id === "string") {
      if (event.type === "item.started") {
        startedIds.add(item.id);
        continue;
      }

      if (event.type === "item.completed") {
        completedIds.add(item.id);
        const verdict = classifyCodexCommand(String(item.command ?? ""), canonicalTarget, workspace);

        if (verdict === "read" && item.status === "completed" && item.exit_code === 0) {
          triggered = true;
          evidence.push({
            kind: "command-execution",
            detail: `completed exit-0 read of the installed SKILL.md: ${item.command}`
          });
        } else if (verdict === "read" || verdict === "search" || verdict === "inconclusive") {
          hasInconclusiveAttempt = true;
          evidence.push({
            kind: "inconclusive-read",
            detail: `target-path execution did not prove the body was read (status ${JSON.stringify(item.status)}, exit_code ${JSON.stringify(item.exit_code)}, class ${verdict}): ${item.command}`
          });
        }
        // Decoys produce no evidence.
      }
    }
  }

  // Started-but-never-completed target executions are inconclusive.
  for (const id of startedIds) {
    if (!completedIds.has(id)) {
      hasInconclusiveAttempt = true;
      evidence.push({ kind: "inconclusive-read", detail: `execution ${id} started but never completed within the stream` });
    }
  }

  if (sawMalformed) {
    return {
      status: "ambiguous",
      evidence: evidence.concat([{ kind: "malformed-stream", detail: "at least one JSONL line was truncated or unparsable" }])
    };
  }

  if (sawErrorEvent || sawTurnFailed) {
    return { status: "infra_error", evidence };
  }

  if (!sawTurnCompleted) {
    return { status: "ambiguous", evidence };
  }

  if (triggered) {
    return { status: "triggered", evidence };
  }

  if (hasInconclusiveAttempt) {
    return { status: "ambiguous", evidence };
  }

  return { status: "not_triggered", evidence };
}

/** codex exec argv for one trigger case: JSONL on stdout, read-only sandbox,
 * prompt via stdin (`-`). Isolation flags (plan §17) come from the trigger
 * context. Global options such as `-c skills.config=…` MUST precede the
 * `exec` subcommand (Codex parses `-c` at the top level), while `exec`'s own
 * protocol flags follow it — so the flag list is split at the subcommand. */
function buildCodexArgs(isolationFlags = []) {
  const flags = Array.isArray(isolationFlags) ? isolationFlags : [];
  const globalFlags = [];
  const execFlags = [];

  for (let index = 0; index < flags.length; index += 1) {
    if (flags[index] === "-c" && index + 1 < flags.length) {
      globalFlags.push(flags[index], flags[index + 1]);
      index += 1;
      continue;
    }
    execFlags.push(flags[index]);
  }

  return [
    ...globalFlags,
    "exec",
    "--json",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    ...execFlags,
    "-"
  ];
}

export const codexAdapter = adapterContract({
  id: "codex",
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
      provenance: "knowledge-base/runtimes/codex.json; verified protocol in docs/plans/packsmith-v0.2-wave2-runtime-verification.md"
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
      buildArgs: () => buildCodexArgs(context.isolationFlags),
      parseTrace: (streamText) =>
        parseCodexTrace(streamText, {
          installedSkillPath: path.resolve(context.workspaceDir, ".agents", "skills", skill, "SKILL.md"),
          workspaceDir: context.workspaceDir
        })
    });
  },

  parseTrace(streamText, { skillName, installedSkillPath, workspaceDir } = {}) {
    return parseCodexTrace(streamText, {
      installedSkillPath: installedSkillPath ?? path.resolve("C:\\", ".agents", "skills", String(skillName ?? ""), "SKILL.md"),
      workspaceDir
    });
  },

  buildTriggerResult
});
