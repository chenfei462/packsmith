import test from "node:test";
import assert from "node:assert/strict";

import { loadEvidenceGraph, validateEvidenceGraph } from "../../src/knowledge/evidence.mjs";

test("expanded evidence graph loads with measured families and no orphan references", async () => {
  const graph = await loadEvidenceGraph();
  assert.equal(graph.sources.length, 28);
  assert.equal(graph.claims.length, 17);
  assert.equal(graph.research.length, 5);
  assert.equal(graph.implementations.length, 11);
  assert.equal(graph.incidents.length, 10);
  assert.equal(graph.product.length, 9);
  assert.equal(graph.rules.length, 20);
  assert.equal(graph.runtimes.length, 6);
  assert.deepEqual(validateEvidenceGraph(graph), []);
  assert.ok(Object.isFrozen(graph));
  assert.ok(Object.isFrozen(graph.sources));
  assert.ok(Object.isFrozen(graph.claims));
  assert.equal(graph.research.every((finding) => finding.normative === false), true);
  assert.equal(graph.rules.every((rule) => rule.evidenceIds.length > 0), true);
  assert.equal(graph.runtimes.every((runtime) => runtime.evidenceIds.length > 0), true);
});

test("evidence integrity rejects duplicate IDs, missing sources, and normative research", async () => {
  const graph = structuredClone(await loadEvidenceGraph());
  graph.sources[1].id = graph.sources[0].id;
  graph.claims[0].sourceId = "missing-source";
  graph.research[0].normative = true;
  const problems = validateEvidenceGraph(graph);
  assert.match(problems.join("\n"), /duplicate or missing ids/);
  assert.match(problems.join("\n"), /sourceId does not resolve/);
  assert.match(problems.join("\n"), /normative must be false/);
});

test("evidence integrity rejects dangling claim consumers and non-primary normative authority", async () => {
  const graph = structuredClone(await loadEvidenceGraph());
  graph.claims[0].consumers = ["missing-consumer"];
  graph.claims.find((claim) => claim.claimId === "CLAIM-PRODUCT-SECURITY-BASELINE").normative = "MUST";
  const problems = validateEvidenceGraph(graph);
  assert.match(problems.join("\n"), /consumer "missing-consumer" does not resolve/);
  assert.match(problems.join("\n"), /CLAIM-PRODUCT-SECURITY-BASELINE normative source/);
});

test("evidence integrity rejects dangling rule and runtime claim references", async () => {
  const graph = structuredClone(await loadEvidenceGraph());
  graph.rules[0].evidenceIds = ["missing-claim"];
  graph.runtimes[0].evidenceIds = ["missing-claim"];
  const problems = validateEvidenceGraph(graph);
  assert.match(problems.join("\n"), /rule PS-SPEC-001\.evidenceIds reference "missing-claim" does not resolve/);
  assert.match(problems.join("\n"), /runtime agent-skills\.evidenceIds reference "missing-claim" does not resolve/);
});
