# Reqman

<p>
  <img src="src/ui/assets/reqman-icon.png" alt="" height="64" />
  <img src="src/ui/assets/reqman-wordmark.png" alt="Reqman" height="64" />
</p>

A local requirements workspace built with **TypeScript, Node.js, and React**. Definitions live in Markdown, decisions live in checked-in YAML records, and history stays in Git.

**Working preview, not a complete V1 release.** The full target remains [the SRS](docs/requirements/reqman-srs.md). See [implementation status](docs/status.md). Policies, exact impact decisions, migration/restore, history, evidence attachments, and filtered reports are implemented. Release acceptance evidence is tracked separately.

## Run the preview

Prerequisites: Node.js 22.17 or newer, npm, and Git on PATH.

```sh
npm ci
npm run build
npm test
npm run demo
```

The demo creates an isolated temporary Git repository with synthetic requirements and starts the local UI. Open the printed loopback URL and enter the session access key. It does not initialize or change your application repository. Ctrl+C stops the server. The terminal prints the temporary repository location for inspection or later removal.

## Use your repository

From this checkout, pass the target repository explicitly:

```sh
node dist/cli.js --repo /path/to/project init --plan-output setup-plan.json
node dist/cli.js --repo /path/to/project apply-plan --input setup-plan.json --apply
node dist/cli.js --repo /path/to/project validate
node dist/cli.js --repo /path/to/project serve
```

Initialization creates `requirements.yml` and `requirements/main.md`. Discovery deliberately starts outside `docs/requirements`, so an existing SRS is not accidentally treated as native records. Existing files are not overwritten. Add the suggested ignore rules yourself; init does not edit `.gitignore`:

```gitignore
.requirements/cache/
.requirements/recovery/
.requirements/reports/
```

The browser provides a register, Markdown authoring and preview, review/assessment forms, comparison, traceability, baselines, imports, and reports. Saves require a preview and a source-version check. The product does not stage, commit, fetch, push, install hooks, or change remotes.

Optional [local user logins](docs/operations.md#user-logins) record the signed-in username on approvals, assessments, baselines, and requirement changes. Configure accounts in `requirements.yml` and generate password hashes with `node dist/cli.js password-hash`. Without login configuration, the browser uses the session access key and manually entered actor claims.

For CLI authoring, save `new-requirement.json`:

```json
{
  "id": "REQ-001",
  "title": "Preserve project data",
  "statement": "The application shall preserve the previous project when a save is interrupted."
}
```

```sh
node dist/cli.js --repo /path/to/project requirement add --input new-requirement.json --apply
node dist/cli.js --repo /path/to/project --format json list
node dist/cli.js --repo /path/to/project diff --base HEAD --head WORKTREE
node dist/cli.js --repo /path/to/project export --type html --output report.html
```

Create the initial commit with your own Git tools before comparing against HEAD. `--apply` explicitly authorizes a mutation; omit it or use `--dry-run` for a preview. Save and replay `--plan-output` when applying the exact previewed identities and timestamps matters.

## Documentation

- [Architecture](docs/architecture.md)
- [CLI and authoring guide](docs/guide.md)
- [Format and canonicalization](docs/format.md)
- [Policy and revision-bound decisions](docs/policy.md)
- [Installation and compatibility](docs/release.md)
- [Performance evidence](docs/performance.md)
- [Accessibility acceptance](docs/accessibility.md)
- [Evidence, migration, and exports](docs/interchange.md)
- [Recovery, security, and data exit](docs/operations.md)
- [SRS traceability and release status](docs/status.md)
- [Machine-readable schemas](schemas)

## Development

```sh
npm run typecheck
npm run test:coverage
npm run build
npm run schemas
npm audit
```

`src/core` is shared by the CLI and local HTTP service; React lives in `src/ui`. Tests use synthetic temporary Git repositories. No database or remote service is required. Exact dependency resolutions and integrity hashes are in `package-lock.json`.

`npm run cli -- ...` runs the CLI from TypeScript. Build the UI before `npm run dev -- --repo /path/to/project`. Use `npm run package` to build an independently installable Node archive with checksums, source provenance and dependency inventory. Node and Git remain runtime prerequisites. No package is automatically published.

The existing GPLv3 license covers the source, documentation and format schemas. See [release terms](docs/release.md) and [security reporting](SECURITY.md). No public package has been published.
