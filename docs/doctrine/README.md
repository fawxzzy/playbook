# Atlas Engineering Doctrine Registry

Playbook owns this versioned, machine-readable registry of reusable engineering doctrine. It is a governance and knowledge-promotion surface, not a copy of repo-local instructions, runtime state, board/card state, or imported material.

`atlas-engineering-doctrine-registry.v1.json` is the data; `atlas-engineering-doctrine-registry.schema.v1.json` is its public contract. Run `node scripts/validate-doctrine-registry.mjs` before accepting a change.

## Lifecycle and provenance

Records are `candidate`, `promoted`, `retired`, or `superseded`. A promoted record must cite at least one current canonical Playbook or Atlas source. Imported material uses `imported-provenance`; it can inform candidates and history, but cannot by itself establish current truth. Retired and superseded records remain in the registry with explicit reason or successor so history is inspectable.

## Atlas adoption

Atlas discovers this registry at its Playbook-owned path, reads stable record IDs, and records its own adoption or conformance evidence locally. It must not copy these records into another canonical doctrine store. A local read-only projection is acceptable only when it links back to this registry and preserves its IDs, lifecycle, and evidence references.

The registry intentionally distinguishes `universal-doctrine`, `repo-local-instruction`, `runtime-state`, `board-card-state`, and `imported-provenance` through each record's `scope.truth_class`. Runtime and board facts belong with their owners; the imported Atlas Engineering Playbook is provenance, not current truth.
