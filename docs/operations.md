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

Noncooperating external editors can still race in the narrow final-check/rename interval. Tests inject interruptions at locked, preflight, prepared, applying, each replacement, completed and cleaned phases, for complete and rollback recovery. Directory entries are synced on POSIX; Node does not expose equivalent Windows directory sync. Physical power-loss durability at every filesystem boundary has not been certified. Retain independent backups during preview use.

## Local boundary

The service binds only to 127.0.0.1, validates Host/Origin, rejects cross-site requests, and requires a random per-session bearer key for data/mutations. The key appears at explicit CLI startup and stays in browser session storage. It is not placed in project files or exported links. Read-only mode disables repository mutations and recovery; report downloads remain available.

React rendering disables raw HTML and replaces images with labels. CSP blocks remote assets, framing and executable content. Exported HTML escapes repository text. YAML/XML/Git metadata are untrusted input. Git uses argument arrays with hooks/fsmonitor/network protocols/implicit lazy fetch disabled; no diff or textconv helpers are executed.

Defaults: 10 MiB per authoritative file, 100 MiB snapshot/import, nesting depth 128, 100,000 requirements, 1,000,000 edges, 250,000 files, 100,000 impact rows and 200 history commits. CLI overrides and doctor expose effective limits; no silent truncation is treated as complete. Analysis and import parsing run in a cancellable worker; prepared plans apply in the main process with source guards and an explicit atomic phase. Derived parsed documents/records and search/graph indexes are in-memory and disposable. Recovery journals remain separate operational safety data. See guide.md and performance.md.

Core use is offline after dependency installation. There is no telemetry, self-update, remote account, hosted service or adopter build integration. Dependencies are locked; npm audit is an advisory check, not a security certification.

Local evidence is Windows 11 x64 / Node 22.17.1 / npm 11.11.0 and the installed Git version recorded in status.md. The browser smoke test uses Codex's in-app browser. Linux/macOS CI is configured but has not run from this checkout. No released platform guarantee is claimed.

The private-reporting setting is a pre-distribution gate documented in ../SECURITY.md. Package provenance/checksums and licensing are documented in release.md. Never publish project data or session keys in public issues.
