import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const KNOWLEDGE_ROOT = path.resolve(fileURLToPath(new URL("../../knowledge-base/", import.meta.url)));
const EVIDENCE_ROOT = path.join(KNOWLEDGE_ROOT, "evidence");
const AUTHORITIES = new Set(["canonical", "official", "academic", "community", "product"]);
const SOURCE_TYPES = new Set(["spec", "docs", "standard", "implementation", "research", "product", "community"]);
const NORMATIVE_WORDS = new Set(["MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", "OPTIONAL", "UNKNOWN", "NOT_VERIFIED"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const validDate = (value) => nonEmpty(value) && ISO_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const unique = (values) => new Set(values).size === values.length;

const NON_NORMATIVE = new Set([false, "UNKNOWN", "NOT_VERIFIED"]);
const isNormative = (value) => !NON_NORMATIVE.has(value);

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`evidence JSON cannot be read: ${path.relative(KNOWLEDGE_ROOT, file)}: ${error.message}`, { cause: error });
  }
}

function validateSource(source, index, problems) {
  const label = `source[${index}]`;
  if (!isObject(source)) return problems.push(`${label} must be an object`);
  for (const field of ["id", "title", "sourceType", "authority", "url", "verifiedOn", "status"]) {
    if (!nonEmpty(source[field])) problems.push(`${label}.${field} must be non-empty`);
  }
  if (nonEmpty(source.sourceType) && !SOURCE_TYPES.has(source.sourceType)) problems.push(`${label}.sourceType is unknown`);
  if (nonEmpty(source.authority) && !AUTHORITIES.has(source.authority)) problems.push(`${label}.authority is unknown`);
  if (nonEmpty(source.url) && !source.url.startsWith("https://")) problems.push(`${label}.url must be https`);
  if (source.verifiedOn !== undefined && !validDate(source.verifiedOn)) problems.push(`${label}.verifiedOn must be a real ISO date`);
  if (source.retrievedOn !== undefined && !validDate(source.retrievedOn)) problems.push(`${label}.retrievedOn must be a real ISO date`);
}

function validateClaim(claim, index, sourceIds, sourceById, problems) {
  const label = `claim[${index}]`;
  if (!isObject(claim)) return problems.push(`${label} must be an object`);
  for (const field of ["claimId", "claim", "category", "sourceId", "sourceType", "authority", "verifiedOn", "appliesTo", "confidence", "consumers"]) {
    if (claim[field] === undefined || (typeof claim[field] === "string" && !nonEmpty(claim[field]))) problems.push(`${label}.${field} is required`);
  }
  if (nonEmpty(claim.sourceId) && !sourceIds.has(claim.sourceId)) problems.push(`${label}.sourceId does not resolve`);
  if (nonEmpty(claim.sourceType) && !SOURCE_TYPES.has(claim.sourceType)) problems.push(`${label}.sourceType is unknown`);
  if (nonEmpty(claim.authority) && !AUTHORITIES.has(claim.authority)) problems.push(`${label}.authority is unknown`);
  const source = sourceById.get(claim.sourceId);
  if (source && claim.sourceType !== source.sourceType) problems.push(`${label}.sourceType does not match source ${claim.sourceId}`);
  if (source && claim.authority !== source.authority) problems.push(`${label}.authority does not match source ${claim.sourceId}`);
  if (claim.normative !== undefined && typeof claim.normative !== "boolean" && !NORMATIVE_WORDS.has(claim.normative)) problems.push(`${label}.normative must be boolean or an RFC 2119 value`);
  if (!validDate(claim.verifiedOn)) problems.push(`${label}.verifiedOn must be a real ISO date`);
  if (!isObject(claim.appliesTo) || !Array.isArray(claim.consumers)) problems.push(`${label}.appliesTo and consumers must be structured`);
}

function validateResearch(item, index, sourceIds, problems) {
  const label = `research[${index}]`;
  if (!isObject(item)) return problems.push(`${label} must be an object`);
  for (const field of ["researchId", "title", "sourceId", "researchQuestion", "method", "testedEnvironment", "mainFindings", "limitations", "packsmithImplication", "verifiedOn"]) {
    if (item[field] === undefined) problems.push(`${label}.${field} is required`);
  }
  if (!sourceIds.has(item.sourceId)) problems.push(`${label}.sourceId does not resolve`);
  if (item.normative !== false) problems.push(`${label}.normative must be false`);
  if (!validDate(item.verifiedOn)) problems.push(`${label}.verifiedOn must be a real ISO date`);
  for (const field of ["mainFindings", "limitations"]) if (!Array.isArray(item[field]) || item[field].length === 0) problems.push(`${label}.${field} must be non-empty`);
}

function validateImplementation(item, index, sourceIds, problems) {
  const label = `implementation[${index}]`;
  if (!isObject(item)) return problems.push(`${label} must be an object`);
  for (const field of ["profileId", "project", "sourceId", "category", "solves", "learn", "doNotDuplicate", "revision", "license", "verifiedOn"]) if (item[field] === undefined) problems.push(`${label}.${field} is required`);
  if (!sourceIds.has(item.sourceId)) problems.push(`${label}.sourceId does not resolve`);
  if (!Array.isArray(item.learn) || !Array.isArray(item.doNotDuplicate)) problems.push(`${label}.learn and doNotDuplicate must be arrays`);
  if (!validDate(item.verifiedOn)) problems.push(`${label}.verifiedOn must be a real ISO date`);
}

function validateIncident(item, index, sourceIds, problems) {
  const label = `incident[${index}]`;
  if (!isObject(item)) return problems.push(`${label} must be an object`);
  for (const field of ["incidentId", "category", "summary", "sourceId", "authority", "verifiedOn", "packsmithUse"]) if (item[field] === undefined) problems.push(`${label}.${field} is required`);
  if (!sourceIds.has(item.sourceId)) problems.push(`${label}.sourceId does not resolve`);
  if (!AUTHORITIES.has(item.authority)) problems.push(`${label}.authority is unknown`);
  if (!validDate(item.verifiedOn)) problems.push(`${label}.verifiedOn must be a real ISO date`);
  if (!Array.isArray(item.packsmithUse) || item.packsmithUse.length === 0) problems.push(`${label}.packsmithUse must be non-empty`);
}

function validateProduct(item, index, sourceIds, problems) {
  const label = `product[${index}]`;
  if (!isObject(item)) return problems.push(`${label} must be an object`);
  for (const field of ["evidenceId", "sourceId", "claim", "adopted", "boundary", "verifiedOn"]) if (item[field] === undefined) problems.push(`${label}.${field} is required`);
  if (!sourceIds.has(item.sourceId)) problems.push(`${label}.sourceId does not resolve`);
  if (!validDate(item.verifiedOn)) problems.push(`${label}.verifiedOn must be a real ISO date`);
}

function validateReferenceList(value, label, knownIds, problems) {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`${label} must be a non-empty array`);
    return;
  }
  if (!unique(value)) problems.push(`${label} contains duplicate references`);
  for (const id of value) {
    if (!nonEmpty(id)) problems.push(`${label} entries must be non-empty strings`);
    else if (!knownIds.has(id)) problems.push(`${label} reference "${id}" does not resolve`);
  }
}

function validateCrossReferences(graph, sourceById, problems) {
  const rules = Array.isArray(graph.rules) ? graph.rules : [];
  const runtimes = Array.isArray(graph.runtimes) ? graph.runtimes : [];
  const claims = graph.claims;
  const claimById = new Map(claims.filter(isObject).map((claim) => [claim.claimId, claim]));
  const ruleIds = new Set(rules.map((rule) => rule?.id).filter(nonEmpty));
  const runtimeIds = new Set(runtimes.map((runtime) => runtime?.id).filter(nonEmpty));
  const researchIds = new Set(graph.research.map((item) => item?.researchId).filter(nonEmpty));
  const implementationIds = new Set(graph.implementations.map((item) => item?.profileId).filter(nonEmpty));
  const incidentIds = new Set(graph.incidents.map((item) => item?.incidentId).filter(nonEmpty));
  const productIds = new Set(graph.product.map((item) => item?.evidenceId).filter(nonEmpty));
  const consumerIds = new Set([...ruleIds, ...runtimeIds, ...researchIds, ...implementationIds, ...incidentIds, ...productIds]);

  if (Array.isArray(graph.rules)) {
    const seen = new Set();
    for (const rule of rules) {
      if (!isObject(rule) || !nonEmpty(rule.id)) continue;
      if (seen.has(rule.id)) problems.push(`rules contain duplicate id "${rule.id}"`);
      seen.add(rule.id);
      validateReferenceList(rule.evidenceIds, `rule ${rule.id}.evidenceIds`, claimById, problems);
      for (const claimId of rule.evidenceIds ?? []) {
        const claim = claimById.get(claimId);
        if (!claim) continue;
        if (!rule.evidence?.some((entry) => entry?.source === claim.sourceId)) {
          problems.push(`rule ${rule.id}.evidenceIds claim "${claimId}" source "${claim.sourceId}" is not cited by rule evidence`);
        }
      }
      for (const entry of rule.evidence ?? []) {
        const source = sourceById.get(entry?.source);
        if (isNormative(entry?.normative) && !["canonical", "official"].includes(source?.authority)) {
          problems.push(`rule ${rule.id} normative evidence source "${entry?.source}" must be canonical or official`);
        }
      }
    }
  }

  if (Array.isArray(graph.runtimes)) {
    const seen = new Set();
    for (const runtime of runtimes) {
      if (!isObject(runtime) || !nonEmpty(runtime.id)) continue;
      if (seen.has(runtime.id)) problems.push(`runtimes contain duplicate id "${runtime.id}"`);
      seen.add(runtime.id);
      validateReferenceList(runtime.evidenceIds, `runtime ${runtime.id}.evidenceIds`, claimById, problems);
      for (const claimId of runtime.evidenceIds ?? []) {
        const claim = claimById.get(claimId);
        if (!claim) continue;
        const source = sourceById.get(claim.sourceId);
        if (!source || !["canonical", "official"].includes(source.authority)) {
          problems.push(`runtime ${runtime.id} capability claim "${claimId}" must have official or canonical evidence`);
        }
        const appliesTo = claim.appliesTo?.runtime ?? claim.appliesTo?.runtimes ?? [];
        if (Array.isArray(appliesTo) && appliesTo.length > 0 && !appliesTo.includes("all") && !appliesTo.includes(runtime.id)) {
          problems.push(`runtime ${runtime.id} claim "${claimId}" does not apply to that runtime`);
        }
      }
    }
  }

  for (const claim of claims) {
    if (!isObject(claim) || !Array.isArray(claim.consumers)) continue;
    for (const consumer of claim.consumers) {
      if (!consumerIds.has(consumer)) problems.push(`claim ${claim.claimId}.consumer "${consumer}" does not resolve`);
    }
    const source = sourceById.get(claim.sourceId);
    if (isNormative(claim.normative) && !["canonical", "official"].includes(source?.authority)) {
      problems.push(`claim ${claim.claimId} normative source "${claim.sourceId}" must be canonical or official`);
    }
  }
}

function validateUnique(items, idField, label, problems) {
  const ids = items.map((item) => item?.[idField]).filter(nonEmpty);
  if (!unique(ids)) problems.push(`${label} contains duplicate ${idField} values`);
}

export function validateEvidenceGraph(graph) {
  const problems = [];
  if (!isObject(graph)) return ["evidence graph must be an object"];
  const { manifest, sources, claims, research, implementations, incidents, product } = graph;
  if (!isObject(manifest) || manifest.schemaVersion !== 1) problems.push("evidence manifest schemaVersion must be 1");
  if (!Array.isArray(sources) || !Array.isArray(claims) || !Array.isArray(research) || !Array.isArray(implementations) || !Array.isArray(incidents) || !Array.isArray(product)) return problems.concat("evidence families must be arrays");
  sources.forEach((item, index) => validateSource(item, index, problems));
  const sourceIds = new Set(sources.map((item) => item?.id).filter(nonEmpty));
  if (sourceIds.size !== sources.length) problems.push("sources contain duplicate or missing ids");
  const sourceById = new Map(sources.filter(isObject).map((source) => [source.id, source]));
  claims.forEach((item, index) => validateClaim(item, index, sourceIds, sourceById, problems));
  research.forEach((item, index) => validateResearch(item, index, sourceIds, problems));
  implementations.forEach((item, index) => validateImplementation(item, index, sourceIds, problems));
  incidents.forEach((item, index) => validateIncident(item, index, sourceIds, problems));
  product.forEach((item, index) => validateProduct(item, index, sourceIds, problems));
  validateUnique(claims, "claimId", "claims", problems);
  validateUnique(research, "researchId", "research", problems);
  validateUnique(implementations, "profileId", "implementations", problems);
  validateUnique(incidents, "incidentId", "incidents", problems);
  validateUnique(product, "evidenceId", "product", problems);
  const counts = manifest?.counts ?? {};
  for (const [field, actual] of [["sources", sources.length], ["claims", claims.length], ["research", research.length], ["implementations", implementations.length], ["incidents", incidents.length], ["product", product.length]]) {
    if (counts[field] !== actual) problems.push(`manifest counts.${field} is ${counts[field]} but loaded ${actual}`);
  }
  if (Array.isArray(graph.rules) && counts.rules !== undefined && counts.rules !== graph.rules.length) {
    problems.push(`manifest counts.rules is ${counts.rules} but loaded ${graph.rules.length}`);
  }
  if (Array.isArray(graph.runtimes) && counts.runtimes !== undefined && counts.runtimes !== graph.runtimes.length) {
    problems.push(`manifest counts.runtimes is ${counts.runtimes} but loaded ${graph.runtimes.length}`);
  }
  validateCrossReferences(graph, sourceById, problems);
  return problems;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export async function loadEvidenceGraph({ root = EVIDENCE_ROOT } = {}) {
  const manifest = await readJson(path.join(root, "manifest.json"));
  const readList = async (files) => (await Promise.all(files.map((file) => readJson(path.resolve(root, file))))).flatMap((value) => Array.isArray(value) ? value : [value]);
  const baseSources = await readJson(path.resolve(root, manifest.baseSourceFile));
  const sources = baseSources.concat(await readJson(path.resolve(root, manifest.sourceFile)));
  const graph = {
    root,
    manifest,
    sources,
    claims: await readList(manifest.claimFiles),
    research: await readList(manifest.researchFiles),
    implementations: await readList(manifest.implementationFiles),
    incidents: await readList(manifest.incidentFiles),
    product: await readList(manifest.productFiles)
  };
  if (manifest.knowledgeBaseManifest) {
    const kbManifest = await readJson(path.resolve(root, manifest.knowledgeBaseManifest));
    graph.runtimes = await Promise.all((kbManifest.runtimes ?? []).map((id) => readJson(path.resolve(root, "..", "runtimes", `${id}.json`))));
    const ruleFiles = kbManifest.ruleFiles ?? [];
    const ruleLists = await Promise.all(ruleFiles.map((category) => readJson(path.resolve(root, "..", "rules", `${category}.json`))));
    graph.rules = ruleLists.flatMap((items) => Array.isArray(items) ? items : [items]);
  }
  const problems = validateEvidenceGraph(graph);
  if (problems.length > 0) throw new Error(`Evidence graph is invalid at ${root}:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  return deepFreeze(graph);
}

export const DEFAULT_EVIDENCE_ROOT = EVIDENCE_ROOT;
