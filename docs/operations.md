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

The service binds only to 127.0.0.1, validates Host/Origin, and rejects cross-site requests. By default it requires a random access key for data/mutations. With user logins enabled, it requires an individual login session and rejects the shared access key. Session tokens stay in browser session storage and are not placed in project files or exported links. Read-only mode disables repository mutations and recovery; report downloads remain available.

## User logins

Generate a password hash for each local account:

```sh
node dist/cli.js password-hash
```

The terminal prompt hides the password. Use at least 12 characters. For scripts, this command also accepts a password from standard input; avoid password arguments and shell commands that save plaintext in history. It prints only a salted scrypt hash. The implementation uses Node's [scrypt and timing-safe comparison APIs](https://nodejs.org/download/release/v22.23.3/docs/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).

Add this optional section to your repository's `requirements.yml`, replacing the placeholder with the complete generated hash:

```yaml
authentication:
  enabled: true
  session_hours: 8
  users:
    - username: jim
      display_name: Jim
      password_hash: "PASTE_GENERATED_HASH_HERE"
      roles: [reviewer]
      disabled: false
```

Usernames are unique, case-sensitive account identifiers (up to 64 characters, using letters, numbers, `.`, `_`, `@`, or `-`, starting with a letter or number). Use a stable username so past records remain attributable after a display-name change. `display_name` is optional. Roles default to an empty list; a review can claim only a role assigned to its account. At least one active account is required when logins are enabled. The lifetime defaults to eight hours and accepts 1–24 hours.

Start `reqman serve` and sign in with the configured username and password. The sidebar shows the current user and provides Sign out. Restart the server after changing login configuration: a detected change immediately blocks API access and invalidates existing sessions/previews until restart. Set `disabled: true` to disable an account, or replace its hash to reset its password, then restart. Five failed logins temporarily block further attempts for one minute. Sessions also expire at the configured lifetime and on server shutdown.

Approvals, assessments, verification definitions, evidence attachments and baselines use the signed-in username rather than a form-supplied actor. New approvals and decisions record the server's timestamp and login provenance. Imported evidence keeps producer claims distinct from the user who imported it. Each requirement addition/edit/renumber/move/clone/split/consolidation/retirement creates an append-only change record with the username, timestamp, exact before/after fingerprints, change classes and file locations. New requirements and successors record the user as their author; editing preserves the original author. Saves still require preview and explicit apply, and a preview can only be applied by the session that created it. A policy requiring a change rationale still requires a user-written rationale.

These are local browser logins. CLI actions and direct Markdown/YAML/Git edits remain local claims and bypass browser authentication; older records are not relabeled as authenticated. People who can write the repository can edit accounts and records, so this is attribution within the local application, not signed or tamper-proof audit evidence. Password hashes are stored in configuration and included in portable archives; protect both as project data. Plaintext passwords and session tokens are never stored there. Keep individual accounts and passwords distinct; sharing an account loses individual attribution.

React rendering disables raw HTML and replaces images with labels. CSP blocks remote assets, framing and executable content. Exported HTML escapes repository text. YAML/XML/Git metadata are untrusted input. Git uses argument arrays with hooks/fsmonitor/network protocols/implicit lazy fetch disabled; no diff or textconv helpers are executed.

Defaults: 10 MiB per authoritative file, 100 MiB snapshot/import, nesting depth 128, 100,000 requirements, 1,000,000 edges, 250,000 files, 100,000 impact rows and 200 history commits. CLI overrides and doctor expose effective limits; no silent truncation is treated as complete. Analysis and import parsing run in a cancellable worker; prepared plans apply in the main process with source guards and an explicit atomic phase. Derived parsed documents/records and search/graph indexes are in-memory and disposable. Recovery journals remain separate operational safety data. See guide.md and performance.md.

Core use is offline after dependency installation. There is no telemetry, self-update, remote account, hosted service or adopter build integration. Dependencies are locked; npm audit is an advisory check, not a security certification.

Local evidence is Windows 11 x64 / Node 22.17.1 / npm 11.11.0 and the installed Git version recorded in status.md. The browser smoke test uses Codex's in-app browser. Linux/macOS CI is configured but has not run from this checkout. No released platform guarantee is claimed.

The private-reporting setting is a pre-distribution gate documented in ../SECURITY.md. Package provenance/checksums and licensing are documented in release.md. Never publish project data or session keys in public issues.
