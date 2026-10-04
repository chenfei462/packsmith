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
  const resolved = path.resolve(workspaceDir, stripped);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
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
    if (character === "\n") {
      flush();
      tokens.push(";");
      sawNewline = true;
      continue;
    }

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
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

function toolBaseName(token) {
  const withoutQuotes = token.replace(/^["']|["']$/g, "");
  return path.basename(withoutQuotes).toLowerCase();
}

/**
 * Classify ONE simple statement (no compound operators). Returns
 * "read" | "search" | "decoy" | "inconclusive" | "no-mention" — where
 * read/search/decoy mean the TARGET path was involved in that role.
 */
function classifyStatementTokens(statementTokens, canonicalTarget, workspaceDir) {
  if (statementTokens.length === 0) {
    return "no-mention";
  }

  const tool = toolBaseName(statementTokens[0]);
  const rest = statementTokens.slice(1);

  if (PS_SHELL_TOKENS.has(tool)) {
    return classifyPowerShellTokens(rest, canonicalTarget, workspaceDir);
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

function classifyPowerShellTokens(tokens, canonicalTarget, workspaceDir) {
  // Locate -Command / -c; the INNER script is the next token (quoted).
  const commandIndex = tokens.findIndex((token) => token.toLowerCase() === "-command" || token.toLowerCase() === "-c");

  if (commandIndex === -1 || commandIndex + 1 >= tokens.length) {
    return "inconclusive";
  }

  const innerToken = tokens[commandIndex + 1];
  const inner = innerToken.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  // Strip PowerShell end-of-line comments (naive: a # outside the target
  // path forms — the target path never contains #; pre-capture heuristic).
  const withoutComment = inner.replace(/(?<![-\w])#.*$/, "").trim();
  const { tokens: innerTokens, unterminated } = tokenize(withoutComment);

  if (unterminated || innerTokens.length === 0) {
    return "inconclusive";
  }

  return classifySegments(innerTokens, canonicalTarget, workspaceDir);
}

/**
 * Classify a token stream by splitting it into UNCONDITIONAL segments
 * (`;` and newlines both run their next statement unconditionally) and
 * CONDITIONAL/PIPE remainders (`&&`, `||`, `|` — whether the target
 * statement really ran, or what happened to the content, cannot be known
 * from the stream). A clean read in an unconditional segment is activation
 * evidence (verified with real local PowerShell: `Get-Content -LiteralPath
 * '<target>'; Write-Output 'after'` does read the body); a target mention
 * in a conditional segment is inconclusive; a pipe anywhere caps the
 * verdict at inconclusive because the body may have been transformed or
 * discarded. Unknown syntax mentioning the target stays inconclusive —
 * never triggered, never not_triggered.
 */
function classifySegments(tokens, canonicalTarget, workspaceDir) {
  const segments = [];
  let current = { conditional: false, tokens: [] };

  for (const token of tokens) {
    if (token === ";") {
      segments.push(current);
      current = { conditional: false, tokens: [] };
      continue;
    }

    if (token === "&&" || token === "||" || token === "|" || token === "&") {
      segments.push(current);
      current = { conditional: true, tokens: [] };
      continue;
    }

    current.tokens.push(token);
  }

  segments.push(current);

  let verdict = "no-mention";
  let sawPipe = false;
  let sawConditionalChain = false;

  for (const segment of segments) {
    const statement = classifyStatementTokens(segment.tokens, canonicalTarget, workspaceDir);

    if (statement === "no-mention") {
      continue;
    }

    if (segment.conditional) {
      if (verdict === "no-mention") {
        verdict = "inconclusive";
      }
      continue;
    }

    if (statement === "read") {
      verdict = "read";
      continue;
    }

    if (statement === "search" || statement === "inconclusive") {
      if (verdict === "no-mention" || verdict === "decoy") {
        verdict = "inconclusive";
      }
      continue;
    }

    if (verdict === "no-mention") {
      verdict = "decoy";
    }
  }

  // A `&&`/`||` chain makes the success of every earlier statement
  // unknowable from the stream (overall exit 0 may come from the fallback),
  // and a pipe may transform or discard the body — either caps the verdict
  // at inconclusive even when a clean read statement is present.
  if (tokens.some((token) => token === "&&" || token === "||" || token === "&")) {
    sawConditionalChain = true;
  }
  if (tokens.some((token) => token === "|")) {
    sawPipe = true;
  }
  if (verdict === "read" && (sawPipe || sawConditionalChain)) {
    verdict = "inconclusive";
  }

  return verdict;
}

/**
 * Classify one raw command string end to end.
 */
function classifyCodexCommand(command, canonicalTarget, workspaceDir) {
  const { tokens, unterminated } = tokenize(command);

  if (unterminated) {
    return "inconclusive";
  }

  return classifySegments(tokens, canonicalTarget, workspaceDir);
}

/**
 * Parse one codex exec JSONL stream (pure). See the module docblock for the
 * classification rules; the runner's spawn/nonzero/timeout outcomes take
 * precedence over anything computed here. Terminal state rules (round 2):
 * a binary verdict requires a COMPLETE stream — malformed → ambiguous,
 * error/turn.failed → infra_error, missing turn.completed → ambiguous,
 * all BEFORE any completed read counts.
 */
export function parseCodexTrace(streamText, { installedSkillPath, workspaceDir }) {
  const workspace = workspaceDir ?? path.dirname(installedSkillPath);
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
 * prompt via stdin (`-`). Isolation flags belong to Milestone 7's context. */
function buildCodexArgs() {
  return ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "-"];
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
      buildArgs: buildCodexArgs,
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
