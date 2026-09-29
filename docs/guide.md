# CLI and authoring

Place global `--repo`, `--config`, `--format text|json`, `--quiet`, and `--no-color` before the command. Configuration paths are repository-relative. Commands never require terminal interaction.

Read commands: `validate`, `list`, `search --query TEXT`, `show UUID`, `document show PATH`, `history UUID`, `trace`, `impact --base A --head B`, `diff --base A --head B`, `baseline list`, `baseline show NAME`, and `doctor`. Inventory filters include specification, lifecycle, disposition, status, currency and scope. Select the evaluated artifact with `--artifact-repository ID --artifact-revision REVISION`.

`--ref` defaults to WORKTREE. Commit references are resolved once and read without checkout. `baseline:NAME` resolves current working-tree manifests to their exact target; bare repositories require explicit commit refs. `INDEX` is unsupported. `diff --merge-base` requires a unique merge base. History compares available parents and is bounded to 200 commits, labeling missing/truncated analysis incomplete.

Mutation inputs use `--input FILE.json`. They preview unless `--apply` is present. `--dry-run` wins over apply. `--plan-output FILE` saves an exact replayable plan; it contains source bytes and should be protected as project data. Replay with `apply-plan --input FILE --apply`. UUIDs and timestamps are generated at preview creation, so separate previews need not produce identical new record IDs.

| Operation | Input |
|---|---|
| `init` | Optional `name` |
| `document add` | `path`, optional document `metadata` |
| `requirement add` | `id`, `title`, `statement`, optional `document` and `metadata`; alternatively complete `markdown` |
| `requirement edit UUID` | `markdown` and/or `metadata`; optional `fileToken` from show |
| `requirement renumber UUID` | New `id` |
| `requirement move UUID` | Destination `document` path |
| `requirement clone UUID` | New `id`, optional destination; new UUID and no inherited decisions |
| `requirement retire UUID` | Nonempty `reason` |
| `requirement split UUID` | `reason`, two or more `successors` with `metadata.id` and `markdown` |
| `requirement consolidate UUID` | `sources` references, `reason`, `successors` definitions |
| `review create UUID` | `actor`, `rationale`, `decision`, optional `role`, `supersedes` |
| `assess create UUID` | `actor`, `rationale`, `category`, `decision`, artifact/evidence/obligations as applicable |
| `verification create UUID` | `actor`, `rationale` (procedure), `title`, `method` |
| `evidence create UUID` | `actor`, `rationale`, `artifact`, `result`, `method`, `location`, `obligations` |
| `change create UUID` | `actor`, `rationale`, optional exact revision pairs/references in `details` |
| `baseline create` | `name`, committed `target`, `actor`, optional description/selection/supersedes |

Bulk decisions provide `subjects: [UUID, ...]` instead of a positional target. Reconciliation names all resolved records in `supersedes`. Timestamps never select the winning decision. Claims of actor identity are not independently authenticated.

Review decisions: approved, changes_requested, rejected, revoked. Assessment categories: implementation (not_started, partial, implemented) and verification (planned, passed, failed, blocked, inconclusive). Lifecycle and disposition follow the SRS, including required reasons and transfer targets.

Relations use `{ "type": "depends_on", "target": "UUID" }`. Requirement and verification links use UUIDs. Implementation references use http/https, git:, or path:. Creating a verification definition does not silently add a relation; edit the requirement's `verified_by` links explicitly.

## Baseline sequence

Commit the intended definitions and decisions with Git. Create a baseline at that commit. Commit the resulting manifest separately. Baseline targets never move with tags/branches, and objects are never automatically fetched. Preserve target objects through your Git retention process.

## Machine interface

JSON stdout contains one object with schema_version, tool_version, operation, complete, snapshot, data, diagnostics, exit_code. Diagnostic fields include severity, code, file, line, column, subject when available, explanation and remediation. Many schema locations currently identify block starts; exact YAML-key columns are a release gap.

Exit codes: 0 success, 1 validation findings, 2 invalid invocation/configuration/unsupported format, 3 operational or incomplete analysis, 4 edit/decision conflict, 130 cancellation. CLI help/version and long-running serve startup are outside the operation envelope. Session keys appear only in explicit serve startup output, never reports or repository data.
