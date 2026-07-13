import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateRegistry } from "../../scripts/validate-doctrine-registry.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const registryPath = path.join(root, "docs/doctrine/atlas-engineering-doctrine-registry.v1.json");
const schemaPath = path.join(root, "docs/doctrine/atlas-engineering-doctrine-registry.schema.v1.json");
const validatorPath = path.join(root, "scripts/validate-doctrine-registry.mjs");
const validRegistry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const copy = () => structuredClone(validRegistry);
const codes = (registry) => validateRegistry(registry).map((error) => error.code);

test("valid registry passes the deterministic validator and CLI", () => {
  assert.deepEqual(validateRegistry(validRegistry), []);
  const output = execFileSync(process.execPath, [validatorPath], { encoding: "utf8" });
  assert.match(output, /Doctrine registry valid/);
});

test("schema declares stable governance fields", () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.properties.schema_version.const, "atlas-engineering-doctrine-registry.v1");
  for (const field of ["id", "kind", "lifecycle", "statement", "rationale", "scope", "evidence", "enforcement", "exceptions", "review", "supersession"]) assert.ok(schema.$defs.record.required.includes(field));
});

test("validator rejects duplicate and unstable IDs", () => {
  const duplicate = copy();
  duplicate.records[1].id = duplicate.records[0].id;
  assert.ok(codes(duplicate).includes("duplicate-id"));
  const unstable = copy();
  unstable.records[0].id = "Rule Evidence";
  assert.ok(codes(unstable).includes("unstable-id"));
});

test("validator rejects missing evidence and promoted records without canonical evidence", () => {
  const missing = copy();
  missing.records[0].evidence = [];
  assert.ok(codes(missing).includes("missing-evidence"));
  const importedOnly = copy();
  importedOnly.records[0].evidence = [{ evidence_id: "imported-only", authority: "imported-provenance", ref: "atlas-import:example", note: "draft" }];
  assert.ok(codes(importedOnly).includes("promoted-without-canonical-evidence"));
});

test("validator rejects absolute machine paths and malformed lifecycle values", () => {
  const absolute = copy();
  absolute.records[0].evidence[0].ref = "C:\\ATLAS\\private\\evidence.md";
  assert.ok(codes(absolute).includes("absolute-path"));
  const lifecycle = copy();
  lifecycle.records[0].lifecycle = "active";
  assert.ok(codes(lifecycle).includes("invalid-lifecycle"));
});

test("validator rejects incomplete enforcement, review, and supersession metadata", () => {
  const enforcement = copy();
  delete enforcement.records[0].enforcement.mechanism;
  assert.ok(codes(enforcement).includes("record.enforcement.required"));
  const review = copy();
  delete review.records[0].review.reviewer;
  assert.ok(codes(review).includes("record.review.required"));
  const supersession = copy();
  delete supersession.records[0].supersession.supersedes;
  assert.ok(codes(supersession).includes("record.supersession.required"));
});
