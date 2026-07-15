# Playbook Project-Board Owner Export

Playbook publishes its non-complete roadmap work through
`atlas.project-board.owner-export.v1` at:

- `exports/playbook.project-board.owner-export.v1.json`

The canonical source remains `docs/roadmap/ROADMAP.json`. The export is a
deterministic projection for Atlas and DiscordOS; it is not a second roadmap.

## Status mapping

| Roadmap status | Export status | Board lifecycle |
| --- | --- | --- |
| `in-progress` | `active` | `in-progress` |
| `planned` | `active` | `planning` |
| `planned-later` | `candidate` | `intake` |
| `dependency-blocked` | `active` | `blocked` |
| `directional` | `candidate` | `intake` |
| `architecture-defined` | `active` | `planning` |

Completed and implemented statuses are excluded. The adapter preserves roadmap
feature IDs as card IDs, keeps priority `null` when the roadmap does not define
one, maps dependencies without inference, and derives the source revision from
the roadmap's canonical UTF-8 bytes with line endings normalized to LF. This
keeps the revision stable when Git checks out the same JSON with CRLF on Windows
and LF in CI.

Generate and verify the export with:

```text
pnpm board:export
pnpm board:export:check
```

Atlas Contracts performs the interoperability validation before DiscordOS may
admit or seed the export. Forum creation, card creation, or any Discord write is
outside this adapter's authority.
