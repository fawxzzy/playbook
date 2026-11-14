# `pnpm playbook commit`

Atomically run release sync, stage all changes, and execute `git commit`.

## Usage

- `pnpm playbook commit -m "chore: update"`
- `pnpm playbook commit --help`

## Behavior

Runs three steps in order and stops at the first one that fails:

1. `pnpm playbook release sync` (see [`release.md`](./release.md)).
2. `git add -A`: **stages every change in the working tree, including unrelated and untracked files.** It does not stage by name.
3. `git commit <args>`: every argument after `commit` is passed through to `git commit` unchanged (for example `-m <message>`).

Notes:

- Exit code: `0` when all three steps succeed, `1` when any of them fails (the failing step's own output is shown). `--help` exits `0`.
- It shells out to `pnpm playbook release sync`, so it only works in a repository that defines a `playbook` script (this repository does; see [README.md](../../README.md), "Install status").
- Because step 2 stages everything, review `git status` first, or stage and commit named files with plain `git` when the working tree holds unrelated changes. `release sync` itself can rewrite `docs/CHANGELOG.md` and `packages/**/package.json` (the artifacts the help text lists as owned by this command).
- `commit` takes no `--json` output; the child processes print directly to the terminal.

See also: [`release.md`](./release.md).
