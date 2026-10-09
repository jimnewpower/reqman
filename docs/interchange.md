# Evidence, migration and reports

Create verification definitions, add verified_by links, then import observations after the mapping is final. Import never creates a passing assessment. A passing assessment must explicitly name every required obligation and accepted current passing evidence for the selected artifact and scope. Skipped, missing, failing or inconclusive results cannot pass. Contrary unsuperseded evidence requires reconciliation.

Example mapping file:

```json
{
  "run_id": "build-123",
  "producer": "junit",
  "actor": "CI runner claim",
  "artifact": {
    "repository": "example/product",
    "revision": "EXACT_COMMIT_OR_DIGEST"
  },
  "mapping": {
    "junit::storage::StorageTest::preservesOriginal": {
      "requirement": "REQUIREMENT_UUID",
      "obligation": "VERIFICATION_UUID"
    }
  }
}
```

```sh
node dist/cli.js --repo /project evidence import --source results.xml --input mapping.json --plan-output evidence-plan.json
node dist/cli.js --repo /project apply-plan --input evidence-plan.json --apply
```

JUnit subset includes suites/cases, nested suites, failure/error/skipped, properties and system output. Keys are producer::suite::classname::name. Missing/duplicate keys and unsupported elements fail. Durations become integer milliseconds; failure details remain in provenance. DTD/entity declarations are forbidden. No external content is fetched.

Native JSON has a published schema in schemas/native-evidence.schema.json. The minimal form is:

```json
{
  "schema_version": 1,
  "attempts": [
    {
      "key": "native::suite::class::name",
      "outcome": "passed",
      "duration_ms": 120
    }
  ]
}
```

Mapping, artifact, source location and scope come from operation input. The full envelope additionally carries run_id, producer, artifact, created_at and provenance. Attempts may include parameters, details, exact subjects, dependencies, obligations and their own timestamps. Explicit producer/run/artifact values must agree with the mapping input; historical fingerprints are preserved rather than rebound to the current definition. Each key names one mapped requirement/obligation; encode parameter identity in the key to preserve separate attempts. Unknown fields are rejected. Native project round trips use the portable archive described below. Re-importing the same run/source/mapping/artifact/scope is a no-op; changed content conflicts. Artifact changes preserve the historical result and change currency. Without an artifact selection, verification currency is unknown.

## Migration

```json
{
  "source": "legacy-register.csv",
  "destination": "requirements/imported.md",
  "format": "csv",
  "mapping": {
    "id": "Requirement ID",
    "title": "Title",
    "statement": "Statement"
  }
}
```

Use `migrate --source FILE --input mapping.json --plan-output plan.json`, then replay the reviewed plan. CSV, JSON arrays/requirements arrays, simple Markdown pipe tables, labeled-blocks and ordered overlays are supported. The destination must match document discovery. UUIDs derive deterministically from project/specification/source identity and source ID. Original rows, IDs and source digests remain in extension metadata. Imported status values never become native approvals or passing results. Conflicting destinations are refused; unchanged repeats are idempotent.

The migration manifest records counts, identity mapping, provenance, proposed authority, uncertainties and rollback instructions. Declare cutover through the team's review process. For labeled-blocks, mapping.labels maps literal source labels to destination fields, and mapping.block_start declares a literal block prefix (default Requirement:). Multiline values are preserved. For overlays, the source is {"layers":{"base":[...],"amendment":[...]}}; mapping.order declares every layer once and mapping.overrides lists fields allowed to change. Undeclared overrides return field-level conflicts without writes. Missing rows retain prior requirements. Original rows and field provenance remain in extension metadata and the manifest.

## Grouped ledger migration

For a CSV or JSON ledger spanning several specifications, use `group_by` and
`destination_root` instead of a single `destination`. One native document is
created per distinct specification code, and missing specification declarations
are added to configuration in the same atomic plan. Codes must contain only
ASCII letters, digits, underscores, periods and hyphens, starting with a letter or digit.
Use `specification_codes` to explicitly map nonportable source labels to native
codes, for example `{ "Raster storage": "RASTER-STORAGE" }`. Source labels
remain specification titles and original row provenance; mappings cannot merge
distinct source specifications into one code.
IDs need to be unique within each specification; IDs shared across specifications
remain unchanged. Specification and requirement UUIDs are deterministic.

```json
{
  "source": "legacy-ledger.csv",
  "format": "csv",
  "group_by": "spec_id",
  "destination_root": "requirements/imported",
  "mapping": {
    "id": "requirement_id",
    "title": "requirement_id",
    "statement": "requirement_text",
    "disposition": "requirement_disposition",
    "reason": "disposition_reason",
    "dispositions": {
      "ACTIVE": "in_scope",
      "DEFERRED": "deferred",
      "NOT_APPLICABLE": "not_applicable",
      "TRANSFERRED": "transferred"
    }
  },
  "transfer_targets": {
    "SPEC-A": { "R-003": "SPEC-B R-010" }
  }
}
```

```sh
node dist/cli.js --repo /project migrate --source legacy-ledger.csv --input mapping.json --plan-output ledger-plan.json
node dist/cli.js --repo /project apply-plan --input ledger-plan.json --apply
node dist/cli.js --repo /project validate
```

Choose a title column explicitly; mapping it to the ID is a useful fallback
when the ledger has no titles. All original columns and global source row
numbers are preserved in provenance. Lifecycle remains draft. Implementation,
verification, approval and evidence columns do not create native decisions.
Disposition mapping is explicit; deferred and not-applicable rows require
reasons. Transfers require a `mapping.target` column or an explicit
`transfer_targets[specification][requirement_id]` entry. Missing reasons, targets,
or disposition mappings produce an unresolved report and no partial plan.

Destinations must match discovery. Optional `exclude_documents` lists existing
native sample documents to exclude through a reviewed configuration change;
their files remain intact. Existing destinations with different content are
refused, while unchanged repeats are idempotent. Review the manifest and
configuration changes before applying the plan.

## Export

`export --report inventory|comparison|matrix|gaps --type html|csv|json|markdown|portable --output PATH` writes only the selected destination. Existing files require --overwrite. HTML is self-contained and escaped; scripts/images/network assets are blocked. CSV prefixes formula-like cells; JSON preserves authoritative text. Markdown provides a review summary.

Portable JSON contains captured authoritative files encoded as base64, with repository paths and SHA-256 digests. Git history and external artifacts are explicitly absent. Recovery journals are excluded and must be preserved separately if needed. Reports carry resolved snapshots, endpoints where relevant, filter selection and aggregate semantics. Use --base/--head for comparison and specification/lifecycle/disposition/status/currency/query/scope filters for inventories, matrices and gaps.

Restore the complete native archive with `restore --source archive.json --plan-output restore-plan.json`, then explicit apply. Destination is an initialized empty Git working tree with the selected --config path. Every base64 payload and digest is verified, all native files are parsed/validated, identities and binary attachments are preserved, and existing destination files are refused. Baseline manifests survive, but their target objects need the separately retained Git history; the result lists missing-history obligations. It never retargets a baseline. Corrupt archives or ambiguous case paths cause no writes.
