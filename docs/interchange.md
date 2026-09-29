# Evidence, migration and reports

Create verification definitions, add verified_by links, then import observations after the mapping is final. Import never creates a passing assessment. A passing assessment must explicitly name every required obligation and accepted current passing evidence for the selected artifact and scope. Skipped, missing, failing or inconclusive results cannot pass. Contrary unsuperseded evidence requires reconciliation.

Example mapping file:

```json
{
  "run_id": "build-123",
  "producer": "junit",
  "actor": "CI runner claim",
  "artifact": { "repository": "example/product", "revision": "EXACT_COMMIT_OR_DIGEST" },
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

Native JSON preview subset:

```json
{"schema_version": 1, "attempts": [{"key": "native::suite::class::name", "outcome": "passed", "duration_ms": 120}]}
```

Mapping, artifact, source location and scope come from operation input. Full lossless native interchange and producer-specific parameterized attempt schemas remain V1 gaps. Re-importing the same run/source/mapping/artifact/scope is a no-op; changed content conflicts. Artifact changes preserve the historical result and change currency. Without an artifact selection, verification currency is unknown.

## Migration

```json
{
  "source": "legacy-register.csv",
  "destination": "requirements/imported.md",
  "format": "csv",
  "mapping": { "id": "Requirement ID", "title": "Title", "statement": "Statement" }
}
```

Use `migrate --source FILE --input mapping.json --plan-output plan.json`, then replay the reviewed plan. CSV, JSON arrays/requirements arrays and simple Markdown pipe tables are supported. The destination must match document discovery. UUIDs derive deterministically from project/specification/source identity and source ID. Original rows, IDs and source digests remain in extension metadata. Imported status values never become native approvals or passing results. Conflicting destinations are refused; unchanged repeats are idempotent.

The migration manifest records counts, identity mapping, provenance, proposed authority, uncertainties and rollback instructions. Declare cutover through the team's review process. Ordered overlays, labeled-block mappings, field-level amendment reconciliation and full native-project import remain unimplemented.

## Export

`export --type html|csv|json|markdown|portable --output PATH` writes only the selected destination. Existing files require --overwrite. HTML is self-contained and escaped; scripts/images/network assets are blocked. CSV prefixes formula-like cells; JSON preserves authoritative text. Markdown provides a review summary.

Portable JSON contains captured authoritative files encoded as base64, with repository paths and SHA-256 digests. Git history and external artifacts are explicitly absent. Recovery journals are excluded and must be preserved separately if needed. Rich comparison/matrix report templates and portable archive re-import remain release work.
