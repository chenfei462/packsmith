/**
 * Terminal reporter for packsmith doctor (plan §12 output example).
 *
 * Pure: report in → output string out. No colors (the ✓/✗ marks are the
 * signal), no IO, deterministic line order so the output is diff-stable.
 *
 * Shape per skill (plan §12):
 *
 *   review-pr
 *
 *   ✓ Agent Skills specification
 *   ✓ Claude Code
 *   ✗ Codex
 *
 *   WARNING PS-ACT-002
 *   skills/review-pr/SKILL.md:3
 *
 *   <message lines>
 *
 * Followed by the count line and the overall PASS/FAIL verdict.
 */

function severityLabel(severity) {
  return severity === "error" ? "ERROR" : severity === "warning" ? "WARNING" : "INFO";
}

function locationLine(diagnostic) {
  if (typeof diagnostic.file !== "string") {
    return null;
  }

  return diagnostic.line === null ? diagnostic.file : `${diagnostic.file}:${diagnostic.line}`;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function diagnosticLines(diagnostic) {
  const lines = [`${severityLabel(diagnostic.severity)} ${diagnostic.id}`];
  const location = locationLine(diagnostic);

  if (location) {
    lines.push(location);
  }

  lines.push("");
  lines.push(...diagnostic.message.split("\n"));

  return lines;
}

function skillSectionLines(skill) {
  const lines = [skill.name, ""];

  for (const section of skill.sections) {
    lines.push(`${section.ok ? "\u2713" : "\u2717"} ${section.label}`);
  }

  lines.push("");

  for (const diagnostic of skill.diagnostics) {
    lines.push(...diagnosticLines(diagnostic), "");
  }

  return lines;
}

/**
 * Render the doctor report as the plan §12 terminal report. Returns the
 * whole report as one string (no trailing newline; the caller prints it).
 */
export function renderDoctorTerminal(report) {
  const lines = ["Packsmith Doctor", ""];

  for (const skill of report.skills) {
    lines.push(...skillSectionLines(skill));
  }

  for (const diagnostic of report.workspaceDiagnostics) {
    lines.push(...diagnosticLines(diagnostic), "");
  }

  const counts = [pluralize(report.counts.warnings, "warning"), pluralize(report.counts.errors, "error")];

  if (report.counts.infos > 0) {
    counts.push(pluralize(report.counts.infos, "info"));
  }

  lines.push(counts.join(" \u00b7 "));
  lines.push("");
  lines.push(report.status === "pass" ? "PASS" : "FAIL");

  return lines.join("\n");
}
