# Configuration Reference

Playbook loads configuration from:

- `playbook.config.json` at the repository root.

## Missing config behavior

If `playbook.config.json` is missing, Playbook loads defaults and emits a warning:

- Loader warning: `playbook.config.json not found; using defaults (this is not an error). Add playbook.config.json for explicit settings and .playbookignore to tune scan scope.`
- `pnpm playbook doctor` surfaces this as a warning (but does not fail solely for warnings).

## Schema

```json
{
  "version": 1,
  "docs": {
    "notesPath": "string",
    "architecturePath": "string",
    "governancePath": "string",
    "checklistPath": "string"
  },
  "analyze": {
    "detectors": ["string"]
  },
  "plugins": ["string"],
  "verify": {
    "policy": {
      "rules": ["rule-id"]
    },
    "local": {
      "enabled": true,
      "scriptName": "verify:local",
      "fallbackScriptName": null,
      "command": null
    },
    "rules": {
      "requireNotesOnChanges": [
        {
          "whenChanged": ["glob"],
          "mustTouch": ["path-or-glob"]
        }
      ]
    }
  },
  "memory": {
    "pressurePolicy": {
      "budgetBytes": 52428800,
      "budgetFiles": 2000,
      "budgetEvents": 5000,
      "watermarks": { "warm": 0.65, "pressure": 0.85, "critical": 1 },
      "hysteresis": 0.05
    }
  }
}
```

Every key is optional: the loader merges your file over the built-in defaults section by section, so an omitted key keeps its default. The default `verify.policy.rules` is `["protected-doc.governance"]`; `verify.local` and `memory.pressurePolicy` default to the values shown in the schema above; the remaining defaults match the minimal example below.

## Local verification

`pnpm playbook verify --local` and `--local-only` run one repo-defined command and write `.playbook/local-verification-receipt.json`. The command is resolved in this order:

1. `verify.local.command` in `playbook.config.json` (when set and non-empty).
2. `package.json#scripts.<verify.local.scriptName>` (default `verify:local`), run through the detected package manager (`pnpm run`, `yarn run`, `bun run` or `npm run`).
3. `package.json#scripts.<verify.local.fallbackScriptName>`, when configured.

Setting `verify.local.enabled` to `false` disables the resolution. When no command can be resolved, `verify --local` fails with an error asking you to add `package.json#scripts.verify:local` or `verify.local.command`.

## Minimal example

```json
{
  "version": 1,
  "docs": {
    "notesPath": "docs/PLAYBOOK_NOTES.md",
    "architecturePath": "docs/ARCHITECTURE.md",
    "governancePath": "docs/PROJECT_GOVERNANCE.md",
    "checklistPath": "docs/PLAYBOOK_CHECKLIST.md"
  },
  "analyze": {
    "detectors": ["nextjs", "supabase", "tailwind"]
  },
  "plugins": [],
  "verify": {
    "policy": {
      "rules": ["requireNotesOnChanges"]
    },
    "rules": {
      "requireNotesOnChanges": [
        {
          "whenChanged": ["src/**", "app/**", "server/**", "supabase/**"],
          "mustTouch": ["docs/PLAYBOOK_NOTES.md"]
        }
      ]
    }
  }
}
```
