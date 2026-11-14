// CI wiring for the PB-V07 architecture graph contract test.
//
// `tests/contracts/*.test.ts` is not part of any package test run, so on its own that file is
// never executed by `pnpm test`. Importing it here registers its suites in the engine test run.
import '../../../tests/contracts/architecture-graph.contract.test.js';
