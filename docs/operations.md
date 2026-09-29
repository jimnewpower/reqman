# Operations, recovery and security

Markdown, configuration, records and baseline manifests are authoritative. There is no persistent database. Removing Reqman leaves all definitions and decisions readable. Before uninstalling, export portable JSON and retain the Git repository, especially baseline target objects. Preserve external artifacts separately.

## Recovery

Writes resolve inside the root, reject traversal/symlinks/junctions, acquire a writer lock, recheck source hashes and inventory, persist a prepared journal, mark it applying, then replace each file using a synced temporary file and rename. Originals stay in the journal until completion. Multi-file changes are recoverable, not a filesystem transaction.

Add the suggested `.requirements/recovery/` ignore rule before regular use. Init does not silently edit .gitignore, so the preview cannot guarantee ignored journals until the owner adds that rule.

Interrupted reads fail as inconsistent. Preserve journals, then run:

```sh
node dist/cli.js --repo /project recover --action complete
# or
node dist/cli.js --repo /project recover --action rollback
```

Recovery accepts only files matching before/after bytes. Any unrelated intervening edit blocks recovery; preserve it and reconcile manually. Live writer locks cannot be taken over. Orphan recovery checks the recorded process ID. Never delete a journal merely to make validation pass.

Noncooperating external editors can still race in the narrow final-check/rename interval. Power-loss durability and interruption injection at every filesystem boundary have not been certified. Retain independent backups during preview use.

## Local boundary

The service binds only to 127.0.0.1, validates Host/Origin, rejects cross-site requests, and requires a random per-session bearer key for data/mutations. The key appears at explicit CLI startup and stays in browser session storage. It is not placed in project files or exported links. Read-only mode disables repository mutations and recovery; report downloads remain available.

React rendering disables raw HTML and replaces images with labels. CSP blocks remote assets, framing and executable content. Exported HTML escapes repository text. YAML/XML/Git metadata are untrusted input. Git uses argument arrays with hooks/fsmonitor/network protocols/implicit lazy fetch disabled; no diff or textconv helpers are executed.

Limits: 10 MiB Markdown/YAML/HTTP requests, 100 MiB CLI imports, 110 MiB historical batch reads, depth 128, 100,000 requirements, 1,000,000 edges, 250,000 discovered files, 100,000 impact rows and 200 history commits. Limits fail explicitly. Configurable overrides, streaming cancellation and scale-optimized indexing remain release work.

Core use is offline after dependency installation. There is no telemetry, self-update, remote account, hosted service or adopter build integration. Dependencies are locked; npm audit is an advisory check, not a security certification.

Local evidence is Windows 11 x64 / Node 22.17.1 / npm 11.11.0 and the installed Git version recorded in status.md. The browser smoke test uses Codex's in-app browser. Linux/macOS CI is configured but has not run from this checkout. No released platform guarantee is claimed.

Private vulnerability reporting, supported release policy and final documentation/data-format license terms must be designated before public distribution. Do not publish project data or session keys in public issues.
