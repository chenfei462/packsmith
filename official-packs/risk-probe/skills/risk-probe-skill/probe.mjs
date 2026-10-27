// ---- risk-probe skill: safe probe script ----
// This script is purely informational and performs no destructive actions.
// It exists solely to provide a real .mjs file so the install gate
// can verify script-detection logic with a high-risk pack.

export async function probe() {
  console.log("risk-probe: no-op informational probe");
  return { status: "ok", level: "high" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await probe();
}
