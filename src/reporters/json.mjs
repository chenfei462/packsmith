/**
 * JSON reporter for packsmith doctor (plan §12).
 *
 * Pure: report in → JSON text out. The output is a single parseable object
 * with exactly the plan §12 fields, in a stable key order, so CI consumers
 * can rely on the shape:
 *
 * {
 *   "status": "pass",          // "pass" | "fail"
 *   "skills": 1,               // number of skills examined
 *   "errors": 0,
 *   "warnings": 2,
 *   "diagnostics": [ ... ]     // all findings in the diagnostic engine's
 * }                            // canonical sort order (plan §8 shape)
 *
 * Diagnostics carry the full plan §8 object (id, severity, category, title,
 * message, file, line, runtime, evidence, fix) with POSIX-relative file
 * paths — no machine-specific absolute paths, stable across machines.
 */
export function renderDoctorJson(report) {
  return JSON.stringify(
    {
      status: report.status,
      skills: report.skills.length,
      errors: report.counts.errors,
      warnings: report.counts.warnings,
      diagnostics: report.diagnostics
    },
    null,
    2
  );
}
