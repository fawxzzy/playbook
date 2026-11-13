// Engine test defaults.
//
// Many engine tests build real git repositories and temp-directory fixtures (git init/commit,
// release governance, changelog collection, memory/doctor diagnostics). Under full workspace
// or package-load execution (parallel workers, other packages building/testing at once) these
// legitimately exceed vitest's 5s default and flake with "Test timed out in 5000ms".
// The timeouts below are a ceiling for that heavy I/O, not a license to hang: assertions are
// unchanged and a genuinely stuck test still fails at the ceiling.
export default {
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
};
