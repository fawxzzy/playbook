import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const stableId = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const kinds = new Set(["rule", "pattern", "failure-mode", "decision"]);
const lifecycles = new Set(["candidate", "promoted", "retired", "superseded"]);
const authorities = new Set(["canonical-playbook", "canonical-atlas", "imported-provenance"]);
const truthClasses = new Set([
  "universal-doctrine",
  "repo-local-instruction",
  "runtime-state",
  "board-card-state",
  "imported-provenance"
]);

function isMachineAbsolutePath(value) {
  return typeof value === "string" && /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(value);
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function add(errors, code, message) {
  errors.push({ code, message });
}

function findAbsolutePaths(value, location, errors) {
  if (typeof value === "string") {
    if (isMachineAbsolutePath(value)) add(errors, "absolute-path", `${location} contains an absolute machine path`);
    return;
  }
  if (Array.isArray(value)) value.forEach((item, index) => findAbsolutePaths(item, `${location}[${index}]`, errors));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) findAbsolutePaths(item, `${location}.${key}`, errors);
  }
}

export function validateRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    add(errors, "registry.invalid", "Registry must be an object");
    return errors;
  }
  if (registry.schema_version !== "atlas-engineering-doctrine-registry.v1") add(errors, "schema-version", "Registry schema_version must be atlas-engineering-doctrine-registry.v1");
  if (registry.registry_id !== "atlas-engineering-doctrine-registry") add(errors, "registry-id", "Registry registry_id must be atlas-engineering-doctrine-registry");
  if (registry.owner !== "playbook") add(errors, "registry-owner", "Registry owner must be playbook");
  if (!registry.consumer_adoption || registry.consumer_adoption.atlas_role !== "adopter-and-conformance-owner" || !hasValue(registry.consumer_adoption.discovery) || !hasValue(registry.consumer_adoption.copying_rule)) add(errors, "consumer-adoption", "Consumer adoption metadata is incomplete");
  if (!Array.isArray(registry.records) || registry.records.length === 0) {
    add(errors, "records.required", "Registry must contain records");
    return errors;
  }

  const ids = new Set();
  for (const [index, record] of registry.records.entries()) {
    const at = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      add(errors, "record.invalid", `${at} must be an object`);
      continue;
    }
    if (!hasValue(record.id) || !stableId.test(record.id)) add(errors, "unstable-id", `${at}.id must be stable kebab-case`);
    else if (ids.has(record.id)) add(errors, "duplicate-id", `${at}.id duplicates ${record.id}`);
    else ids.add(record.id);
    if (!kinds.has(record.kind)) add(errors, "invalid-kind", `${at}.kind is invalid`);
    if (!lifecycles.has(record.lifecycle)) add(errors, "invalid-lifecycle", `${at}.lifecycle is invalid`);
    for (const field of ["statement", "rationale"]) if (!hasValue(record[field])) add(errors, `record.${field}.required`, `${at}.${field} is required`);

    if (!record.scope || !truthClasses.has(record.scope.truth_class) || !hasValue(record.scope.applies_to) || !Array.isArray(record.scope.excludes)) add(errors, "record.scope.required", `${at}.scope is incomplete or invalid`);
    if (!record.enforcement || !hasValue(record.enforcement.owner) || !hasValue(record.enforcement.mechanism)) add(errors, "record.enforcement.required", `${at}.enforcement requires owner and mechanism`);
    if (!Array.isArray(record.exceptions)) add(errors, "record.exceptions.required", `${at}.exceptions must be an array`);
    if (!record.review || !hasValue(record.review.last_reviewed) || !hasValue(record.review.reviewer) || !hasValue(record.review.next_review_due)) add(errors, "record.review.required", `${at}.review requires review metadata`);
    if (!record.supersession || !Array.isArray(record.supersession.supersedes) || !(record.supersession.superseded_by === null || hasValue(record.supersession.superseded_by)) || !(record.supersession.retired_reason === null || hasValue(record.supersession.retired_reason))) add(errors, "record.supersession.required", `${at}.supersession is incomplete`);

    if (!Array.isArray(record.evidence) || record.evidence.length === 0) add(errors, "missing-evidence", `${at}.evidence is required`);
    else {
      for (const [evidenceIndex, evidence] of record.evidence.entries()) {
        if (!evidence || !stableId.test(evidence.evidence_id) || !authorities.has(evidence.authority) || !hasValue(evidence.ref) || !hasValue(evidence.note)) add(errors, "invalid-evidence", `${at}.evidence[${evidenceIndex}] is incomplete or invalid`);
      }
      if (record.lifecycle === "promoted" && !record.evidence.some((evidence) => evidence?.authority === "canonical-playbook" || evidence?.authority === "canonical-atlas")) add(errors, "promoted-without-canonical-evidence", `${at} is promoted without current canonical evidence`);
    }
  }

  const knownIds = new Set(registry.records.map((record) => record?.id));
  for (const [index, record] of registry.records.entries()) {
    if (!record?.supersession) continue;
    const { superseded_by: successor, retired_reason: retiredReason } = record.supersession;
    if (record.lifecycle === "superseded" && (!hasValue(successor) || !knownIds.has(successor))) add(errors, "supersession-target", `records[${index}] requires a known superseded_by target`);
    if (record.lifecycle === "retired" && !hasValue(retiredReason)) add(errors, "retirement-reason", `records[${index}] requires a retired_reason`);
    if (record.lifecycle !== "superseded" && successor !== null) add(errors, "supersession-state", `records[${index}] may only have superseded_by when lifecycle is superseded`);
    if (record.lifecycle !== "retired" && retiredReason !== null) add(errors, "retirement-state", `records[${index}] may only have retired_reason when lifecycle is retired`);
  }
  findAbsolutePaths(registry, "registry", errors);
  return errors;
}

export function validateFile(filePath) {
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return [{ code: "json-parse", message: `Cannot read registry: ${error.message}` }];
  }
  return validateRegistry(registry);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const registryPath = process.argv[2] ?? path.resolve(path.dirname(scriptPath), "../docs/doctrine/atlas-engineering-doctrine-registry.v1.json");
  const errors = validateFile(registryPath);
  if (errors.length > 0) {
    console.error(`Doctrine registry invalid: ${registryPath}`);
    for (const error of errors) console.error(`- [${error.code}] ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Doctrine registry valid: ${registryPath}`);
  }
}
