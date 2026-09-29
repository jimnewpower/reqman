# Preview format

The parser uses CommonMark through remark-parse/mdast. Only top-level HTML comments at column one become metadata markers. Fences, indented code, quotes and list-contained examples remain literal content. Pipe tables currently remain CommonMark text; no table extension is enabled.

````markdown
<!-- rms-document
format_version: 1
uid: 342d48f9-6df8-45f1-b3ef-0c6f2b92a7db
specification: 8dabaa0f-8849-483b-9d10-d1e97a26b49d
title: Project storage
context: normative
-->

# Project storage

These requirements govern local project files.

<!-- rms-requirement
uid: 550e8400-e29b-41d4-a716-446655440000
id: SAVE-001
lifecycle: active
disposition: in_scope
-->

## Preserve an interrupted save

### Statement

The application shall preserve a recoverable original when saving is interrupted.

### Acceptance criteria

- The original remains available until replacement completes.

<!-- /rms-requirement -->
````

Declare the specification UUID in requirements.yml. Human IDs are unique per specification; machine links use UUIDs. The first heading is the title. Reserved Statement/Rationale/Acceptance criteria sections sit one level below it. Supplemental content remains normative. By default, prose outside requirement blocks is governing document context.

Schemas in `schemas/` are generated from the same Zod definitions used by the core. Cross-field checks additionally enforce disposition reasons, enum declarations, uniqueness, graph rules, complete verification and valid supersession. Unknown core keys are errors. Extensions have owner namespaces and conservatively affect governance.

Restricted YAML 1.2 accepts JSON-compatible scalars, sequences and mappings. Duplicate keys, anchors, aliases, explicit tags, fractional metadata and unsafe integers are rejected. Dates remain strings. Store measurements with units as strings. No executable configuration is accepted.

## Canonicalization

`rms-c14n-1` is a preview contract, not yet a frozen public format. Canonical JSON sorts keys by Unicode code units, uses UTF-8, and performs no Unicode normalization. Arrays preserve order; relations, tags, aliases and attachment paths are canonical sorted sets. Defaults expand before hashing. Integers must fit JavaScript's exact safe range.

Normalized Markdown nodes explicitly contain type and applicable value/children/depth/lang/meta/url/title/alt/ordered/start/checked/align/spread attributes. Parser locations and private library fields are excluded. Soft line breaks become spaces. Code whitespace, hard breaks, paragraphs, emphasis, list nesting, link destinations/titles, HTML and literal Unicode remain significant. Requirement heading depth is relative to the title. Reference links resolve destinations/titles; definition nodes are omitted from canonical children. Golden vectors live in tests/fixtures/canonicalization.json.

- Definition: relative Markdown tree, content fields, normative attachment byte digests.
- Governance: document/specification identity, specification title, governing context/mode, lifecycle/disposition/reasons/target, relations, scope fields, schema/policy and extensions.
- Record: normalized metadata plus definition/governance hashes, excluding locations and Git IDs.

Human ID changes are administrative. A move into another document changes governance. Normative outside prose affects all requirements in that document. Explicit normative_files are repository-contained byte-digested dependencies. Ordinary hyperlinks are never fetched.

## Records and writing

The serializer emits indented JSON inside YAML front matter (JSON is a YAML 1.2 subset); handwritten restricted YAML remains supported. Records use YAML front matter in UUID-named Markdown files. The writer stores rationale in metadata; a prose body is accepted when that key is absent. Reviews, assessments, evidence, verification definitions, changes and impact decisions use documented schemas. Dependency snapshots capture prerequisite/parent identities and fingerprints; Change/impact records store exact before/after subjects; impacts also retain causal relation paths. Managed attachments store paths, sizes and SHA-256 digests. The generated record schema includes all optional fields.

Edits preserve unrelated byte ranges, BOMs and existing newline convention. The selected block may be normalized. New files use LF. Missing final newlines outside the edit remain unchanged. Metadata values containing `-->` are rejected. Clones and successors receive fresh identities without copied approval/evidence state.
