import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

const schema = JSON.parse(read("packages/contracts/src/managed-surface-manifest.schema.json"));
const entryProps = schema.properties.entries.items.properties;
const schemaCategories = entryProps.category.enum;
const contract = read("docs/CONSUMER_INTEGRATION_CONTRACT.md");
const section = contract.split("### Managed-vs-local upgrade boundary")[1]?.split("\n## ")[0] ?? "";

test("consumer contract has a managed-vs-local upgrade boundary section", () => {
  assert.ok(section.length > 0, "section must exist");
});

test("documented categories equal the managed-surface manifest schema enum", () => {
  const documented = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1]);
  assert.deepEqual([...documented].sort(), [...schemaCategories].sort());
});

test("migrations source declares the same categories", () => {
  const source = read("packages/cli/src/lib/migrations.ts");
  const declared = source.match(/export type ManagedSurfaceCategory =([^;]+);/);
  assert.ok(declared, "ManagedSurfaceCategory union must exist");
  const categories = [...declared[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...categories].sort(), [...schemaCategories].sort());
});

test("seeded manifest template conforms to the schema enums and its paths are documented", () => {
  const template = JSON.parse(read("packages/cli/templates/repo/.playbook/managed-surfaces.json"));
  assert.equal(template.kind, "playbook-managed-surface-manifest");
  for (const entry of template.entries) {
    assert.ok(schemaCategories.includes(entry.category), `${entry.path} category must be in the schema enum`);
    assert.ok(entryProps.mutationScope.enum.includes(entry.mutationScope), `${entry.path} mutationScope`);
    assert.ok(entryProps.owner.enum.includes(entry.owner), `${entry.path} owner`);
  }
  for (const seeded of [".playbook/**", "AGENTS.md", "docs/CHANGELOG.md", "playbook.config.json", "Playbook/**"]) {
    assert.ok(template.entries.some((entry) => entry.path === seeded), `template must seed ${seeded}`);
    assert.ok(section.includes(`\`${seeded}\``), `section must document seeded path ${seeded}`);
  }
});

test("evidence files cited by the section exist", () => {
  const cited = [...section.matchAll(/`((?:docs|packages)\/[A-Za-z0-9_./-]+\.(?:md|ts|json))`/g)].map((match) => match[1]);
  assert.ok(cited.length >= 4, "section should cite concrete files");
  for (const evidence of new Set(cited)) {
    assert.ok(fs.existsSync(path.join(root, evidence)), `${evidence} must exist`);
  }
});

test("product roadmap no longer calls the managed-vs-local boundary a next planned slice", () => {
  const roadmap = read("docs/PLAYBOOK_PRODUCT_ROADMAP.md");
  assert.ok(!roadmap.includes("Next planned external-consumer hardening slice: **Managed-vs-Local Upgrade Boundaries**"));
  assert.match(roadmap, /Shipped external-consumer hardening slice: \*\*Managed-vs-Local Upgrade Boundaries\*\*/);
});
