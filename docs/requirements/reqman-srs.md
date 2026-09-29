# Git- and Markdown-Native Requirements Management System

Software Requirements Specification

| Document control | Value |
|---|---|
| Specification ID | RMS-SRS-001 |
| Version | 0.1 |
| Status | Draft for product review; not an approved implementation baseline |
| Date | 2026-09-29 |
| Product name | To be selected; “RMS” is a descriptive abbreviation |
| Intended home | The new, independent open-source product repository |
| Intended readers | Product owner, contributors, implementers, reviewers, and adopters |
| Initial reference adopter | Meridian; an integration example, not a dependency |

This is a self-contained product specification. Its present location is a staging
location for transfer into the new repository. It does not amend Meridian's
requirements registry, release scope, or engineering policies. Product name,
implementation stack, license selection, and package names remain decisions for
the new project. All command names and data formats below are proposed contracts,
not claims that a product or package already exists.

## Contents

1. [Purpose and product outcomes](#1-purpose-and-product-outcomes)
2. [Scope, releases, and conventions](#2-scope-releases-and-conventions)
3. [Users and operating environment](#3-users-and-operating-environment)
4. [System boundary and architecture constraints](#4-system-boundary-and-architecture-constraints)
5. [Domain model and invariants](#5-domain-model-and-invariants)
6. [Repository and Markdown format](#6-repository-and-markdown-format)
7. [Revision, comparison, and currency semantics](#7-revision-comparison-and-currency-semantics)
8. [Functional requirements](#8-functional-requirements)
9. [External interfaces](#9-external-interfaces)
10. [User workflows](#10-user-workflows)
11. [Security and trust boundaries](#11-security-and-trust-boundaries)
12. [Quality and operational requirements](#12-quality-and-operational-requirements)
13. [Adoption, migration, and Meridian mapping](#13-adoption-migration-and-meridian-mapping)
14. [Acceptance scenarios and verification](#14-acceptance-scenarios-and-verification)
15. [Delivery sequence and release criteria](#15-delivery-sequence-and-release-criteria)
16. [Risks and decisions](#16-risks-and-decisions)
17. [Glossary](#17-glossary)
18. [References](#18-references)

## 1. Purpose and product outcomes

### 1.1 Problem

Requirements in ordinary documents are easy to read but difficult to track as
individual obligations. Issue trackers describe work but do not reliably express
the current specification, its approved revision, or the evidence that verifies
it. Spreadsheets can track status but tend to separate it from source history.

RMS shall make requirements first-class, versioned objects inside ordinary Git
repositories while preserving useful Markdown documents and normal development
workflows. It shall answer:

- What is required, why, and for which scope?
- What changed between two revisions, and who committed that change?
- Which requirements refine or depend on other requirements?
- Which approvals, implementations, and verification results apply to this revision?
- What needs review after a requirement, dependency, or governing context changes?
- What exactly was included in a baseline or release?

### 1.2 Product outcomes

| Outcome | Observable success |
|---|---|
| Repository ownership | A fresh clone with the documented toolchain reconstructs requirements and durable records without a vendor service. |
| Usable documents | Requirements remain readable in an ordinary editor and Markdown viewer. |
| Reliable history | Moving or renumbering an item preserves its identity; changes are presented by requirement and field. |
| Honest traceability | Linked code, closed issues, approvals, and passed tests remain distinct concepts. |
| Incremental adoption | Existing documents can be assessed and migrated without overwriting their authoritative sources. |
| Low operational burden | A single developer can use the CLI and local browser UI without a server deployment, account, or application-runtime integration. |
| Portability | Project data remains documented, exportable, and usable after uninstalling RMS. |

No feature shall claim that textual similarity proves equivalent behavior, that
test linkage proves compliance, or that a Git commit identifies an authenticated
human approver.

## 2. Scope, releases, and conventions

### 2.1 Release scope

**V1** is a complete local product: documented repository format, CLI, local web
UI, requirement editing, Git-aware comparison/history, baselines, typed links,
review and assessment records, verification evidence import, validation, reports,
and controlled migration.

**Later** capabilities are explicitly outside V1 acceptance: hosted multiuser
editing, enterprise identity, real-time collaboration, cross-repository dependency
resolution, remote approval authentication, automatic provider synchronization,
editor extensions, AI assistance, ReqIF interoperability, and specialized
compliance packages. These are candidates, not committed delivery promises.

V1 is not a general issue tracker, sprint planner, source editor, Git hosting
service, test runner, document office suite, or certification authority. It does
not replace the adopter's build system, Git client, or code-review process.

### 2.2 Normative language and priorities

“Shall” denotes a testable requirement. “Should” denotes a desired property whose
omission must be documented. “May” denotes an allowed option. Examples illustrate
the stated contract and do not silently introduce additional requirements.

Every numbered requirement in sections 8, 11, and 12 is **V1 / Must**, unless
explicitly marked otherwise. Later capabilities in section 15 are not V1
requirements. Definitions and invariants in sections 5–7 and the interface
contracts in section 9 are normative constraints on those requirements.

Requirement identifiers such as `RMS-CHG-001` are stable within this SRS. They shall
not be reused for unrelated obligations in later revisions. Acceptance scenarios
in section 14 specify minimum evidence, not the complete future test suite.

### 2.3 Assumptions

- Adopters possess or can install Git and the published RMS distribution.
- Users control repository access through filesystem and hosting permissions.
- Repository history may be incomplete, rewritten, or untrusted.
- Git retains durable history only for objects the adopter preserves.
- Team collaboration in V1 occurs through branches, commits, and external review.
- Requirements may describe software, hardware, services, processes, or contracts;
  source-code and automated-test links are optional.

## 3. Users and operating environment

| Actor | Main needs |
|---|---|
| Requirements author | Write and organize requirements, preserve rationale, review changes. |
| Product owner | Control scope, priorities, baselines, and disposition. |
| Developer | Find obligations, link implementation evidence, understand impact. |
| Reviewer | Assess an exact revision, request changes, record decisions. |
| Verifier | Plan verification, record results, identify stale or missing evidence. |
| Maintainer | Configure policy, validate pull requests, manage format upgrades. |
| Reader or auditor | Browse requirements, provenance, history, and traceability without editing. |
| Automation client | Use stable noninteractive commands and machine-readable output. |

These are workflow roles, not a V1 authorization system. A local user with write
access to the repository can edit records. Organizational access control remains
external, and the UI must not imply stronger guarantees.

The initial supported operating systems are Windows, Linux, and macOS. The
release support matrix shall name tested OS, architecture, Git, runtime, and
browser versions. A native application wrapper is not required. The browser UI
shall work with a locally running service, and the CLI shall work without a GUI.

## 4. System boundary and architecture constraints

### 4.1 Logical components

```text
Markdown + YAML records + Git objects
                  |
       Repository reader / safe writer
                  |
  Parser -> Domain model -> Validation / comparison / traceability
                  |
       Rebuildable index and projections
                  |
          CLI          Local browser UI
                  |
       Optional file import/export adapters
```

The implementation language, UI framework, packaging technology, and index engine
are intentionally not selected by this SRS. Shared domain behavior is required;
a particular process decomposition is not.

### 4.2 Authority rules

1. Marked Markdown documents own requirement definitions and document context.
2. Checked-in configuration owns project schema and policy.
3. Checked-in assessment, review, change, and baseline records own durable decisions.
4. Git objects own available committed snapshots and history.
5. Indexes, dashboards, search results, and generated reports are derived views.
6. Issue trackers and test systems are external evidence sources, not implicit
   authorities over requirement definitions or approval.

Removing all generated caches shall not remove an approval, status assessment,
requirement, link, baseline, or recorded evidence. A cache may never be the only
location of a durable record.

### 4.3 Git integration boundary

RMS reads repository state and performs explicitly requested file edits. V1 does
not automatically stage, commit, reset, clean, checkout, rebase, merge, fetch,
push, install hooks, or change remote settings. Normal Git tools remain the
mechanism for those actions. A future opt-in integration must not change this
default contract.

## 5. Domain model and invariants

### 5.1 Core entities

| Entity | Identity and principal attributes |
|---|---|
| Project | Immutable UUID, display name, format version, document selection, schema and policy. |
| Specification | Immutable UUID, human code, title, descriptive version label, ordered document membership. |
| Document | Immutable UUID, specification UUID, title, Markdown path, explicitly classified surrounding context. |
| Requirement | Immutable UUID, local human ID, document membership, title, statement, rationale, acceptance criteria, metadata, typed relations. |
| Requirement revision | Requirement UUID plus versioned fingerprints and a resolvable snapshot locator. |
| Change record | UUID, affected identities, before/after fingerprints, rationale, change classification, optional issue references. |
| Review record | UUID, subjects and fingerprints, decision, claimed actor, timestamp, rationale, optional superseded record. |
| Assessment record | UUID, requirement revision, scope, implementation or verification assessment, evidence references, actor and provenance. |
| Evidence record | UUID, kind, requirement revision, evaluated artifact identity, result, method, location, integrity metadata, provenance. |
| Verification definition | UUID, title, method, requirement links, procedure or stable external test identifier. |
| Baseline | UUID, unique name, exact target commit, selected identities, resolved manifest, config/format provenance. |
| Snapshot | Committed tree or frozen working-tree view, including configuration and durable records. |

### 5.2 Identity

The machine identity of a requirement is `(project_uuid, requirement_uuid)`.
Within one project, the requirement UUID must be unique. A document's filename,
human ID, specification code, displayed version, and current Git commit are not
identity components.

Human references use `specification_code:local_id`, for example `MAP:VIEW-014`.
Local IDs must be unique within a specification. Unqualified IDs are accepted by
interactive commands only when they resolve uniquely; machine interfaces should
use UUIDs or qualified references. Durable requirement-to-requirement links store
UUIDs; human labels are presentation hints only.

Specification codes and local IDs use a documented, case-sensitive portable ASCII
subset: letters, digits, hyphen, underscore, and period; the first character must
be alphanumeric. Colons are reserved for qualified references. UUIDs use canonical
lowercase hyphenated notation. Titles and prose support Unicode.

A rename changes a label. A move changes membership. A clone creates a new UUID.
A split or consolidation creates explicitly related successor requirements;
identity must not be inferred from text similarity. A former label may be retained
as an alias, but collisions remain errors and never silently redirect references.

### 5.3 Independent status dimensions

| Dimension | V1 values | Authority |
|---|---|---|
| Definition lifecycle | `draft`, `active`, `retired` | Requirement metadata |
| Disposition | `in_scope`, `deferred`, `not_applicable`, `transferred` | Requirement metadata and reason |
| Approval | `unreviewed`, `approved`, `changes_requested`, `rejected`, `conflicted` | Review projection for the current revision and policy |
| Implementation | `not_assessed`, `not_started`, `partial`, `implemented`, `conflicted` | Explicit assessment records |
| Verification result | `not_assessed`, `planned`, `passed`, `failed`, `blocked`, `inconclusive`, `conflicted` | Assessment and evidence records |
| Currency | `current`, `needs_review`, `unknown` | Comparison of recorded subjects against the selected snapshot |

Approval is derived and shall not be an editable `approved: true` field in a
requirement. Retiring or deferring an obligation does not erase its previous
implementation or verification history. Historical results remain visible when
their currency changes.

`transferred` requires a target; `deferred` and `not_applicable` require a reason.
`retired` requires a retirement reason and may identify successors. Scope filters
must never present excluded requirements as satisfied requirements.

An assessment identifies a scope such as a release target or named configuration.
The default is `project`; results from different scopes are not combined into one
apparently universal result. Arbitrary user-facing labels may map to core values,
but V1 does not support replacing core state semantics with executable workflows.

### 5.4 Typed relations

| Relation | Direction | V1 constraints and impact meaning |
|---|---|---|
| `refines` | Detailed requirement -> higher-level requirement | No self-edge or cycle; parent change potentially affects descendants. |
| `depends_on` | Dependent -> prerequisite | No self-edge or cycle in V1; prerequisite change potentially affects dependents. |
| `related_to` | Requirement <-> requirement | Informational and undirected; does not propagate impact by default. |
| `supersedes` | Successor -> predecessor | Acyclic; historical succession, not proof of equivalent coverage. |
| `verified_by` | Requirement -> verification definition | Indicates intended coverage, not a passing result. |
| `implemented_by` | Requirement -> implementation reference | Indicates claimed implementation linkage, not verified compliance. |

Requirement-to-requirement links resolve within the current project in V1.
External URLs may be retained as references but do not create a resolved
cross-repository graph. References to retired requirements remain resolvable and
are labeled as historical. Custom descriptive link types are permitted if their
direction and validation rules are declarative; executable traversal plugins are
outside V1.

### 5.5 Append-only records and concurrent decisions

Reviews, assessments, evidence, and change records are append-only through product
interfaces. Corrections create a new record with explicit supersession links.
Timestamps describe when actors report an action; they do not decide precedence.

For a subject, scope, and decision category, independent unsuperseded conflicting
records yield `conflicted`. An explicit reconciliation record names every record
it resolves. Git merge order and a later timestamp do not silently select a winner.
Multiple agreeing reviews may coexist; the configured approval policy determines
whether their claimed roles and counts satisfy the workflow.

Git and filesystem editors can modify any file. RMS shall detect altered durable
records when comparing available snapshots, report that alteration, and avoid
claiming that local append-only conventions provide tamper-proof storage.

## 6. Repository and Markdown format

### 6.1 Default layout

```text
project/
  requirements.yml
  docs/requirements/
    map-viewer.md
    storage.md
  .requirements/
    baselines/                 # YAML manifests
    changes/                   # Markdown records with YAML front matter
    reviews/                   # Markdown records with YAML front matter
    assessments/               # Markdown records with YAML front matter
    evidence/                  # Markdown records with YAML front matter
    verification/              # Markdown verification definitions
    recovery/                  # Ignored write journals; retained until recovery completes
    cache/                     # Ignored, disposable
    reports/                   # Ignored unless deliberately published
```

All paths are configurable within the selected repository root. Relative paths
use `/` in serialized data. Tool-generated record names use UUIDs rather than
timestamps or incrementing counters to reduce branch collisions. Init may offer
a preview of ignore rules; it does not silently rewrite an existing `.gitignore`.

### 6.2 Project configuration example

```yaml
format_version: 1
project:
  uid: "2779d97e-0c19-43cb-88ce-41c927fe3ac0"
  name: "Example project"
documents:
  include: ["docs/requirements/**/*.md"]
  exclude: ["docs/requirements/archive/**"]
records_root: ".requirements"
specifications:
  - uid: "8dabaa0f-8849-483b-9d10-d1e97a26b49d"
    code: "MAP"
    title: "Map display"
    version_label: "1.0 Draft"
fields:
  priority:
    type: enum
    values: [MUST, SHOULD, COULD]
    required: true
    change_class: scope
policy:
  approval:
    minimum_reviews: 1
    require_distinct_author: false
  removal: require_retirement
  unknown_fields: error
  review_impact: conservative
```

The product shall publish a machine-readable schema defining all accepted keys,
types, defaults, and constraints before the first public format release. This
example is a minimal proposed configuration, not an exhaustive schema.

Supported custom-field types are string, boolean, integer, date string, enum, and
lists of those scalar types. Custom fields declare one change class: `content`,
`scope`, or `administrative`. User-entered numeric measurements can remain strings
with explicit units; floating-point canonicalization is not required in V1.

Unknown core keys are errors. Extension metadata lives under `extensions` with a
namespaced owner key and must be preserved by edits; unknown extensions affect
currency conservatively. Configuration is data and cannot invoke commands,
evaluate templates, import code, or define shell hooks.

### 6.3 Document and requirement blocks

Markdown uses the CommonMark 0.31.2 baseline. A bounded table extension is allowed
for readable specifications and must be documented and covered by fixtures. No
requirement syntax may depend on a hosting provider's custom renderer.

An included document contains exactly one top-level document metadata block before
its first requirement. Requirement start and end markers occur on their own
unindented lines, outside code fences, block quotes, list items, and other comments.
They cannot nest. Marker-like text in a code example is ordinary text.

````markdown
<!-- rms-document
format_version: 1
uid: 342d48f9-6df8-45f1-b3ef-0c6f2b92a7db
specification: 8dabaa0f-8849-483b-9d10-d1e97a26b49d
title: Map viewer
context: normative
-->

# Map viewer

The requirements in this document apply to spatial layers loaded into a project.

<!-- rms-requirement
uid: 550e8400-e29b-41d4-a716-446655440000
id: VIEW-014
lifecycle: active
disposition: in_scope
fields:
  priority: MUST
relations: []
-->

## Display layer coordinate systems

### Statement

The application shall display the declared coordinate system for each spatial layer.

### Rationale

Users need to distinguish source coordinates from display coordinates.

### Acceptance criteria

- A layer with a known CRS displays its identifier.
- A layer with an unknown CRS is explicitly identified as unknown.

<!-- /rms-requirement -->
````

Inside a requirement, the first heading is its title. Reserved section headings
`Statement`, `Rationale`, and `Acceptance criteria` occur exactly one level below
that title. Statement is required and nonempty. Rationale and acceptance criteria
may be required by project policy. Duplicate reserved sections are errors. Other
sections are preserved as supplemental normative content unless explicitly marked
informative by the documented format. Heading levels may vary between documents;
their relative relationship determines section structure.

Body prose, lists, links, tables, code examples, and local images are allowed.
HTML comments containing metadata must not contain the closing token `-->` inside
a value; the writer must reject or safely encode such values under a documented
round-trip rule. Invalid or ambiguous blocks produce located diagnostics and must
not be silently skipped as though the document contained no requirements.

### 6.4 Document context and external material

By default, prose outside requirement blocks is governing document context.
`context: normative` is the default; `context: informative` makes that outside
prose informational and must be shown clearly in the UI. Changing this setting is
a governing-context change. A normative context change marks all requirements in
that document potentially affected, even when their own statements are unchanged.

Additional normative files are listed explicitly by repository-relative path.
Their raw content digests become context dependencies. Ordinary hyperlinks and
remote image URLs do not automatically become normative dependencies. RMS shall
show that external content is not snapshotted; it shall never fetch such content
merely to render, compare, or validate requirements.

### 6.5 Durable record structure

Records are Markdown files with YAML front matter and a prose rationale/body.
Common required metadata includes `format_version`, `uid`, `kind`, `created_at`
(RFC 3339 with timezone), `actor`, and `subjects`. A subject contains a requirement
UUID and the fingerprint(s) being assessed. Kind-specific schemas define decision,
scope, evidence, supersession, and snapshot provenance.

Records refer to an already existing definition snapshot or content fingerprint;
they do not require the hash of the future commit that will contain the record.
Working-tree assessments store frozen subject fingerprints and are labeled
uncommitted until an enclosing committed snapshot is selected. Reproducible
verification claims additionally identify the tested artifact, not just the
requirements document.

Reviews and assessments also record the relevant upstream requirement UUIDs,
definition/governance fingerprints, and relation paths observed when the decision
was made. This dependency snapshot allows impact currency to be checked even when
a requirement's own definition is unchanged. If the necessary comparison context
was not captured and cannot be reconstructed, currency is `unknown`, not current.
Snapshot capture must report truncation or missing dependencies before a decision
can claim complete coverage.

### 6.6 Format handling

All authoritative files are UTF-8. Readers accept LF and CRLF; writers preserve
the existing file's newline convention and unrelated byte ranges. Missing final
newlines and byte-order marks receive deterministic handling documented by the
writer. An unsupported major format version is read-only or rejected with a
specific diagnostic, never automatically rewritten.

YAML uses a restricted YAML 1.2 data subset: no duplicate keys, aliases, anchors,
custom tags, executable constructors, or implicit timestamp objects. Required IDs
and timestamps are validated as strings. Resource limits apply before and during
parsing.

## 7. Revision, comparison, and currency semantics

### 7.1 Snapshots

`HEAD`, other resolvable commit references, and named baselines select committed
snapshots. Branch and tag names are resolved to object IDs at operation start.
`WORKTREE` selects a frozen inventory of included files, including untracked files
unless ignored by configured selection rules, and reports its dirty status.
`INDEX` comparisons are outside V1; the UI shall not imply staged-only semantics.

A snapshot includes its own configuration, selected documents, records, and
normative dependencies. A comparison uses each endpoint's configuration and
reports selection/policy changes. Excluding a document is a scope removal, not a
way to make removed requirements disappear from a comparison.

### 7.2 Fingerprints

The product shall expose three independently versioned SHA-256 fingerprints:

| Fingerprint | Contents and purpose |
|---|---|
| Definition | Title, parsed normative body sections, rationale, acceptance criteria, `content` custom fields, and explicit normative dependencies. |
| Governance | Specification/document context, lifecycle, disposition/reason, priority and other `scope` fields, typed relations, and applicable schema/policy. |
| Record | Full canonical requirement object excluding source locations, Git commit IDs, and derived states; detects administrative changes as well. |

A review subject binds definition and governance fingerprints. An implementation
or verification assessment binds them too, but keeps its historical result when
currency changes. Human label changes alone affect the record fingerprint;
specification moves that change governing context also affect governance.

Fingerprints shall have a format identifier, initially `rms-c14n-1`. A new
canonicalization version is an explicit compatibility event, not evidence that
every requirement's behavior changed. Unknown algorithm versions produce unknown
currency until an explicit supported conversion is available.

### 7.3 Canonicalization contract

Canonical values use a documented JSON serialization with sorted object keys,
UTF-8 encoding, no insignificant whitespace, exact integers, and no Unicode
normalization. Arrays preserve order except sets explicitly defined by schema:
relation sets, tags, and UUID selections are sorted by their canonical values.
Defaults are expanded identically whether explicitly written or omitted.

Markdown canonicalization operates on a normalized parse tree. Source offsets,
line-ending choice, heading marker style, unordered-list bullet character, and
soft line wrapping are presentation. Hard breaks, paragraph boundaries, emphasis,
ordered-list starts, list nesting, code text, link destinations/titles, tables,
images, and raw HTML content remain significant. Resolved reference-link targets
are included so changing a link definition is not invisible. Code whitespace and
literal Unicode characters are preserved. Heading depth is interpreted relative
to the requirement's title; moving an entire block deeper does not change its
meaning solely through absolute heading numbers.

The canonical tree schema and golden input/output/hash fixtures are a V1 format
deliverable. Library-specific AST serialization is not a public contract. If a
construct cannot be safely normalized, preserve it in the fingerprint and classify
the change conservatively rather than declaring it presentation-only.

### 7.4 Change classes

| Class | Examples | Default consequence |
|---|---|---|
| Addition | New UUID | Unreviewed, not assessed. |
| Definition | Statement, criterion, rationale, normative attachment | Approval and assessments need review; traverse impact links. |
| Governing context | Normative prose, policy, specification context | Affected subjects need review; show causal context. |
| Scope/governance | Priority, disposition, lifecycle | Governance review required; verification applicability needs review. |
| Relationship | Parent, prerequisite, verification mapping | Relevant graph and coverage review required. |
| Administrative | Human ID, owner, nonnormative label | Audit and display change; no automatic invalidation of behavior evidence. |
| Presentation | Rewrapping or equivalent Markdown syntax | Displayable raw diff; no fingerprint-based review invalidation. |
| Move | Same UUID at a different path | Preserve history; reassess context if membership changes. |
| Retirement | Explicit lifecycle transition | Preserve record and links; require rationale. |
| Removal | Previously selected UUID absent | Error by default until explained by approved removal/migration policy. |

Multiple classes may apply to one change. Classifying a field change is not a claim
to understand natural-language semantic equivalence. Reviewers may record that a
specific change has no behavioral impact, but that decision must bind exact before
and after subjects and remain auditable.

### 7.5 Currency and impact

Currency compares an assessment's subjects with the selected snapshot, separately
from its recorded outcome. Exact matching subjects are current unless an explicit
revocation, unresolved decision conflict, changed evaluated artifact, or unresolved
upstream impact makes applicability uncertain.

A changed prerequisite or parent creates a derived impact obligation for reachable
dependents/refinements. The record identifies the triggering revision pair and
relation path. A bounded traversal shows truncation rather than pretending the
affected set is complete. Cycles are errors where prohibited; the traversal must
still terminate when reading invalid data.

Impact decisions can require rework, require reverification, or acknowledge no
impact with rationale. A decision only resolves the named change pair and subject;
it does not exempt that relationship from future changes.

Test execution at code commit A remains a historical result at A. If a user selects
code commit B, RMS may show the old result but shall not mark it as verified at B
without new evidence or an explicit applicability assessment. The requirements
repository and evaluated artifact may be separate repositories; artifact identity
must therefore include repository/product identity as well as a commit or digest.

## 8. Functional requirements

Each row contains a normative obligation and its minimum observable behavior.

### 8.1 Initialization and configuration

| ID | Requirement |
|---|---|
| RMS-INI-001 | The system shall initialize an existing Git working tree with a previewed configuration and directory plan, refusing to overwrite existing files without an explicit file-level choice. |
| RMS-INI-002 | Initialization shall leave application code, dependency files, Git hooks, remotes, staging state, and commits unchanged. |
| RMS-INI-003 | The system shall discover configuration from the selected root or an explicit path and display the resolved repository and configuration paths before writes. |
| RMS-INI-004 | The system shall validate configuration against a versioned schema, locate invalid keys, and reject unsupported mandatory behavior before editing data. |
| RMS-INI-005 | The system shall support configurable document globs, specification membership, custom fields, record paths, and declarative review/validation policy. |
| RMS-INI-006 | Read-only commands shall operate on bare repositories at explicit commits; editing and local authoring require a working tree. |

### 8.2 Discovery, parsing, and identity

| ID | Requirement |
|---|---|
| RMS-PAR-001 | The system shall discover included documents deterministically and report unreadable, malformed, or excluded inputs without silently treating failures as an empty successful inventory. |
| RMS-PAR-002 | The parser shall implement section 6's block grammar, distinguish literal examples from real blocks, and provide file, line, column, rule code, and subject when available. |
| RMS-PAR-003 | The system shall enforce unique project, specification, document, requirement, and record identities in their defined scopes and reject ambiguous human references. |
| RMS-PAR-004 | The system shall preserve requirement identity through file moves, heading changes, renumbering, and specification relocation, reporting governance changes separately. |
| RMS-PAR-005 | The system shall retain unrelated prose and supported unknown extension metadata during edits and report constructs it cannot safely round-trip. |
| RMS-PAR-006 | The system shall detect unresolved Git conflict markers in governed files and disable writes to affected files until conflicts are resolved. |
| RMS-PAR-007 | The system shall resolve local normative context and attachments at the selected snapshot and distinguish missing content from unavailable historical objects. |

### 8.3 Requirement authoring

| ID | Requirement |
|---|---|
| RMS-AUT-001 | Users shall create a requirement with a generated UUID, explicit human ID, title, statement, and policy-required metadata in a selected document. |
| RMS-AUT-002 | Users shall edit statements, acceptance criteria, rationale, metadata, and relations through both documented file formats and supported product commands/UI. |
| RMS-AUT-003 | Users shall preview the exact affected files and field changes before applying a structural operation such as move, renumber, split, or retirement. |
| RMS-AUT-004 | Moving or renumbering a requirement shall preserve UUID-based incoming links and expose alias collisions before writing. |
| RMS-AUT-005 | Cloning shall create a new UUID and shall not copy approvals or assessment results as current evidence for the clone. |
| RMS-AUT-006 | Split and consolidation workflows shall create explicit successor identities, retain retired predecessors, and require users to resolve evidence and relationship applicability. |
| RMS-AUT-007 | Retiring, deferring, transferring, or declaring a requirement not applicable shall require the reason and target rules in section 5.3. |
| RMS-AUT-008 | Every write shall use optimistic file-version checks; changes made by an editor or another process since the read shall cause a conflict instead of overwriting that work. |
| RMS-AUT-009 | Users shall be able to capture a change rationale linked to exact before/after subjects and external work references; project policy may require such a record for material changes. |

### 8.4 Git history and comparisons

| ID | Requirement |
|---|---|
| RMS-GIT-001 | The system shall read requirements at specified commits without checking out those commits or changing the caller's working tree or index. |
| RMS-GIT-002 | The system shall support normal repositories, linked worktrees, detached HEAD, and paths containing spaces or Unicode without assuming `.git` is a directory. |
| RMS-GIT-003 | A comparison shall identify additions, removals, moves, label changes, field changes, relation changes, context changes, and configuration-selection changes by stable identity. |
| RMS-GIT-004 | The system shall distinguish endpoint comparison from changes since a merge base; the UI and reports shall state the exact resolved endpoints and mode. |
| RMS-GIT-005 | Requirement history shall show relevant commits, reported Git authors, source locations, field changes, and merge-parent comparisons without presenting Git author strings as verified identities. |
| RMS-GIT-006 | Shallow history, missing objects, unrelated histories, and ambiguous merge bases shall produce explicit incomplete/unavailable results; the system shall not silently fetch or invent ancestry. |
| RMS-GIT-007 | The system shall freeze and label dirty working-tree inputs for a comparison and refuse to produce an apparently consistent result if inputs change during capture. |
| RMS-GIT-008 | Historical reads shall use the schema and selection configuration at each endpoint; unsupported versions shall yield a compatibility diagnostic rather than a fabricated semantic diff. |
| RMS-GIT-009 | The system shall classify and display canonical versus raw presentation changes according to section 7, including linked reference definitions and normative dependencies. |
| RMS-GIT-010 | Reverts, cherry-picks, and rewritten commits shall preserve requirement identity while reporting the history actually available; repeated content may regain matching fingerprints but shall not cancel an explicit revocation or unresolved impact decision. |

### 8.5 Baselines and releases

| ID | Requirement |
|---|---|
| RMS-BAS-001 | Users shall create a named baseline targeting an existing exact commit and a resolved selection of requirement UUIDs; mutable branch or tag names alone are insufficient. |
| RMS-BAS-002 | A baseline manifest shall record project identity, target object ID and object format, selected UUIDs/fingerprints, configuration and canonicalization versions, creator claim, timestamp, and description. |
| RMS-BAS-003 | Baseline creation shall validate the target snapshot and satisfy configured eligibility policy; dirty current files shall never be silently included in a committed baseline. |
| RMS-BAS-004 | Baseline manifests shall be immutable through normal product interfaces; corrections create a new baseline with an explicit supersedes reference. |
| RMS-BAS-005 | Users shall compare any two available baselines and trace each baseline requirement back to its exact source and durable records at the target commit. |
| RMS-BAS-006 | The system shall report missing or rewritten baseline objects and document Git retention/archival procedures; it shall not silently retarget a baseline to a replacement commit. |
| RMS-BAS-007 | Baseline reports shall distinguish requirements outside the selected scope, excluded dispositions, unresolved references, and incomplete evidence from requirements delivered and verified. |

The baseline file is committed after its target commit. The target is the
definition/record snapshot being named; it is not the later commit containing the
baseline file. This ordering avoids a self-referential commit hash. A baseline
selection does not automatically claim that every selected requirement is approved
or passed: eligibility follows explicit project policy and is reported.

### 8.6 Traceability and impact

| ID | Requirement |
|---|---|
| RMS-TRC-001 | Users shall create and inspect the typed relations in section 5.4 and navigate them in both directions. |
| RMS-TRC-002 | Validation shall identify dangling targets, incompatible target types, duplicate edges, prohibited self-links, and prohibited cycles with actionable paths. |
| RMS-TRC-003 | Users shall generate requirement-to-requirement, requirement-to-verification, and requirement-to-implementation matrices filtered by specification, scope, status, and baseline. |
| RMS-TRC-004 | Impact analysis shall propagate potentially affected relationships from an exact revision comparison and explain each included subject through a causal path. |
| RMS-TRC-005 | Users shall record revision-bound impact decisions and view unresolved impacts independently from direct definition edits. |
| RMS-TRC-006 | The system shall distinguish linked, assessed, passed, failed, stale, missing, and unknown evidence in coverage views. |
| RMS-TRC-007 | Every aggregate shall show its numerator, denominator, scope, exclusions, and unknown/conflicted counts; linked-item percentages shall not be labeled compliance percentages. |

### 8.7 Reviews and approval

| ID | Requirement |
|---|---|
| RMS-REV-001 | Users shall record approval, changes-requested, rejection, or explicit revocation for exact subject fingerprints with actor claim, time, scope, and rationale. |
| RMS-REV-002 | The system shall derive approval and currency from records and configured policy, never from a manually editable approval flag or a merged-PR assumption. |
| RMS-REV-003 | Definition, governing-context, and policy changes shall make affected prior approvals visibly need review while retaining their historical decisions. |
| RMS-REV-004 | Users shall supersede or reconcile decisions through new records, and contradictory unsuperseded decisions shall remain visibly conflicted. |
| RMS-REV-005 | Review policy shall support required claimed reviewer roles, minimum counts, and optional distinct-author checks, while labeling their lack of independent identity authentication in V1. |
| RMS-REV-006 | Bulk review shall preview all subjects and bind each exact fingerprint; changed subjects at save time shall be rejected rather than included under a stale bulk approval. |

### 8.8 Implementation and verification evidence

| ID | Requirement |
|---|---|
| RMS-EVD-001 | Users shall record implementation assessments independently of verification results and disposition, with evidence and assessed subject revisions. |
| RMS-EVD-002 | Evidence shall support test, inspection, analysis, demonstration, and manual acceptance methods, including nonsoftware artifacts. |
| RMS-EVD-003 | Evidence records shall identify evaluated artifact/repository, revision or digest, execution/assessment time, method, result, source location, and requirement subjects; unknown provenance shall be explicit. |
| RMS-EVD-004 | Source links shall distinguish immutable commit/path locators from mutable branch URLs and line-number hints; line numbers alone shall not establish stable implementation identity. |
| RMS-EVD-005 | Users shall define verification obligations and stable test mappings without modifying application source code or requiring a specific test framework. |
| RMS-EVD-006 | The system shall import a documented subset of JUnit-style XML and native JSON results using explicit mappings, preserving failures, errors, skips, durations, and run provenance. |
| RMS-EVD-007 | Unsupported XML structures, duplicate ambiguous test keys, unmatched tests, and missing mappings shall be reported; names or fuzzy text similarity shall not silently create mappings. |
| RMS-EVD-008 | Import shall be idempotent for the same run identity and source digest; the same run identity with different content shall be a conflict, not an overwritten result. |
| RMS-EVD-009 | A passed aggregate verification assessment shall require all applicable required obligations to have accepted passing evidence for the selected scope and revision; skipped, missing, failed, or inconclusive obligations shall prevent automatic pass. |
| RMS-EVD-010 | The system shall preserve individual attempts and expose conflicting or later failing evidence; timestamps alone shall not choose which run satisfies a requirement. |
| RMS-EVD-011 | Requirement or evaluated-artifact changes shall update applicability/currency without rewriting historical outcomes; carrying evidence forward shall require an explicit revision-bound assessment. |
| RMS-EVD-012 | Evidence attachments shall be optional, explicitly selected, size-bounded, integrity-described, and repository-contained; the product shall not automatically commit large logs or fetch external artifacts. |

An explicit verification assessment selects accepted evidence records and required
obligations. Imports alone do not change a requirement to `passed`. If the same
accepted scope has unsuperseded conflicting assessments or contrary evidence for
the same obligation/artifact, the UI exposes a conflict needing resolution. A
manual method can satisfy an obligation when that method is defined; it is not a
backdoor for counting skipped automated checks as passing tests.

### 8.9 Validation and policy

| ID | Requirement |
|---|---|
| RMS-VAL-001 | Validation shall check schemas, identities, required fields, parsing, references, retirement/removal rules, graph constraints, records, and configured policy in deterministic order. |
| RMS-VAL-002 | Diagnostics shall have stable codes, severity, source location, subject, explanation, and remediation guidance in human and JSON output. |
| RMS-VAL-003 | Projects may configure advisory policy severities and narrow, reasoned waivers, but cannot downgrade malformed input, ambiguous identity, unsafe paths, or unsupported mandatory schemas into valid data. |
| RMS-VAL-004 | Waivers shall identify rule, subject, reason, issuer claim, and optional expiry; expired waivers shall no longer suppress findings, and reports shall show the evaluation time. |
| RMS-VAL-005 | Commands shall distinguish valid-empty selections, failed discovery, partial analysis, validation failure, and operational failure through result metadata and exit status. |
| RMS-VAL-006 | Policy changes and waivers shall be visible in comparisons and baseline provenance; lowering a gate shall not erase its historical findings. |

### 8.10 Search, reports, and export

| ID | Requirement |
|---|---|
| RMS-RPT-001 | Users shall search IDs, titles, prose, tags, and custom fields and filter by specification, lifecycle, disposition, assessment, currency, and selected snapshot. |
| RMS-RPT-002 | Each detail view shall present source location, definition, context, links, history, approvals, assessments, and evidence with their scope and currency. |
| RMS-RPT-003 | The system shall export static HTML, CSV, and versioned JSON for inventories, comparisons, matrices, and gap reports; Markdown summaries shall be available for review workflows. |
| RMS-RPT-004 | Export shall preserve stable identities and provenance, label omissions/partial results, escape destination formats, and produce self-contained offline HTML by default. |
| RMS-RPT-005 | A complete portable export shall include definitions, durable records, configuration, baseline manifests, and a documented integrity manifest; it shall state whether referenced Git history or external artifacts are absent. |
| RMS-RPT-006 | Exports shall not alter authoritative sources; an existing output path shall require an explicit overwrite option. |

### 8.11 Local browser UI

| ID | Requirement |
|---|---|
| RMS-UI-001 | The UI shall provide a requirement register, document view, detail view, comparison view, traceability matrix, baseline browser, and review/evidence work queue. |
| RMS-UI-002 | The UI shall display repository/worktree identity, selected snapshot, dirty state, and read-only/editable mode persistently enough to prevent editing the wrong project. |
| RMS-UI-003 | Authoring shall include Markdown source and rendered preview, structured metadata editing, relation selection, validation, and save conflict handling. |
| RMS-UI-004 | External edits shall refresh derived views without discarding an unsaved draft; conflicting source changes shall offer explicit reload or reconciliation. |
| RMS-UI-005 | Read-only mode shall disable all repository writes, including record creation, migration, cache placement inside the repository, and automatic format upgrades. |
| RMS-UI-006 | The UI shall support copyable local links to stable requirement identities and snapshot views without exposing the local service to a public network. |
| RMS-UI-007 | Status, confidence/provenance, currency, and conflicts shall be conveyed with text as well as color; unknown and stale states shall be visually distinct from passed states. |

### 8.12 Migration and interoperability

| ID | Requirement |
|---|---|
| RMS-MIG-001 | Import shall begin with a read-only inventory and preview mapping of source identities, text, versions, statuses, relationships, and evidence. |
| RMS-MIG-002 | V1 shall support generic CSV and native-format JSON import plus declarative mappings for Markdown tables and labeled blocks; arbitrary office-document conversion is outside V1. |
| RMS-MIG-003 | Import shall preserve source provenance and original identifiers, report duplicates and ambiguous revisions, and require explicit resolution before native records become authoritative. |
| RMS-MIG-004 | Migration shall write to an explicit destination, preserve original sources, record deterministic identity mappings, and support a repeatable dry run and idempotent re-import. |
| RMS-MIG-005 | Version/amendment overlays shall be resolved through a declared ordered mapping with field-level provenance and conflicts; missing historical material shall not imply deleted requirements. |
| RMS-MIG-006 | Unsupported status meanings, approvals, and evidence shall remain unknown or imported claims; migration shall not upgrade them into authenticated or verified facts. |
| RMS-MIG-007 | Finalization shall produce a manifest identifying the new authoritative files, generated compatibility exports, unresolved exceptions, and rollback procedure. |
| RMS-MIG-008 | Schema upgrades shall have a preview, explicit invocation, compatibility report, and recoverable write plan; normal reads shall not migrate a repository. |

## 9. External interfaces

### 9.1 CLI contract

`rms` is a placeholder executable name. The final name is a release decision.
Global options include `--repo`, `--config`, `--format text|json`, `--quiet`, and
`--no-color`. Automation commands must not require interactive terminal input.

| Command family | Minimum operations | Mutation behavior |
|---|---|---|
| `init` | Preview setup; apply explicit setup | Writes configuration/selected directories only. |
| `validate` | Working snapshot or `--ref`; optional policy gate | Read-only. |
| `list`, `show`, `search` | Inventory, detail, filtered search | Read-only. |
| `requirement` | Add, edit, move, renumber, clone, retire, split, consolidate | Explicit source edits with preview for structural operations. |
| `diff` | `--base <ref> --head <ref-or-WORKTREE>`; optional `--merge-base` | Read-only. |
| `history` | Requirement UUID/qualified ID and history range | Read-only. |
| `trace`, `impact` | Graph, matrix, affected subjects | Read-only unless separately recording an impact decision. |
| `review`, `assess`, `change` | List and create durable records | Explicit append-only record creation. |
| `baseline` | List, show, create, compare | Create writes a new manifest; reads do not alter Git refs. |
| `evidence import` | Preview/import result file with mappings and artifact identity | Writes selected durable records after preview acceptance or explicit automation flags. |
| `migrate` | Inventory, preview, apply a named mapping | Explicit multi-file write plan. |
| `export` | Format, scope, output path | Writes only selected output destination. |
| `serve` | Local UI, optional `--read-only` | Repository edits only through explicit authorized UI actions. |
| `doctor` | Runtime, Git, format, cache, path diagnostics | Read-only by default. |

CLI mutation commands accept `--dry-run`. Bulk automation accepts explicit input
files and an apply flag rather than simulating confirmations. A dry run produces
the same validated write plan as apply for unchanged inputs. No command shall
interpret requirement text as shell syntax.

Exit codes are: `0` complete success; `1` completed analysis with validation/policy
failure; `2` invalid invocation/configuration or unsupported format; `3` operational
failure, missing required objects, or incomplete requested analysis; `4` edit or
decision conflict preventing the requested action; `130` user cancellation. If
multiple conditions occur, incomplete analysis outranks an ordinary findings-only
result. JSON explains every condition; scripts must not scrape console prose.

### 9.2 Machine-readable output

Every JSON command result has `schema_version`, `tool_version`, `operation`,
`complete`, `snapshot`, `data`, and `diagnostics`. Snapshot metadata contains
resolved object IDs or working-tree capture identity, project identity, dirty
state, configuration digest, and canonicalization version. Diagnostics use the
same codes as UI and text output. Progress belongs on stderr; JSON stdout contains
one complete result document. Fields may be added within a compatible minor
version; removal or semantic changes require a major output-schema version.

### 9.3 Local HTTP interface

The browser UI talks to a loopback-only local service. V1's HTTP API is an internal
interface; the CLI's versioned JSON is the supported automation boundary. Internal
requests still require input validation, origin/host checks, per-session
authorization, and optimistic concurrency tokens. An endpoint cannot bypass the
same validation or safe-write rules enforced by the CLI.

### 9.4 Test-result imports

JUnit-style XML is treated as a family of producer formats, not one universal
standard. The supported subset includes suites, cases, failure/error/skipped
outcomes, durations, and optional properties. Test keys combine declared producer,
suite/class, name, and parameter identity where available. A mapping file links
these keys to verification-definition UUIDs and requirement subjects. Ambiguous
keys are errors, not a reason to combine unrelated tests.

Native JSON evidence provides a lossless alternative with explicit run ID,
producer, artifact identity, subjects, obligation IDs, attempts, outcome, timestamps,
and integrity metadata. The published schema and sample fixtures are required V1
deliverables. The importer does not execute tests or decide which command should
be trusted as a project's quality gate.

### 9.5 Hosting and build-system integration

V1 supports immutable external URLs and Markdown/JSON summaries that existing
workflows can consume. GitHub/GitLab credentials and remote API access are not
required. Repository setup documentation may show how to invoke validation from
CI or a local script, but installation must not activate gates or change branch
protection. Provider adapters, when later added, shall be optional and separate
read operations from explicit remote mutations.

## 10. User workflows

### 10.1 Start in an existing project

1. Install RMS independently of the application's runtime dependencies.
2. Select the repository and preview `init` output.
3. Configure document locations and project-specific metadata.
4. Create one specification/document or preview an existing-source migration.
5. Validate, inspect the local UI, and review ordinary Git changes.
6. Commit with the team's existing tools and permissions.

Success: another contributor can clone the project, install a compatible RMS
version, and reconstruct the same requirements without a database transfer.

### 10.2 Change an approved requirement

1. Create a development branch using normal Git tools.
2. Edit the statement or acceptance criteria in an editor or the UI.
3. Compare against the intended base, showing changed fields and prior approvals.
4. Inspect impacted dependents and verification obligations.
5. Record the change reason, update affected definitions, and resolve impact work.
6. Record new approval/assessment evidence against exact subjects.
7. Review and commit normally; run configured checks when the project's policy authorizes them.

An approval created before the final edit cannot silently cover the later edit.

### 10.3 Establish a release baseline

1. Commit the definitions, review records, and evidence intended for the release.
2. Select that exact commit and inspect baseline eligibility and exceptions.
3. Resolve the scope to UUIDs and create a baseline manifest targeting the commit.
4. Commit the baseline manifest in a subsequent commit.
5. Preserve the target objects through the project's Git retention process.

Later requirement edits do not change the baseline. New records created after
the target commit do not retroactively change its as-of approval/evidence view.

### 10.4 Handle a concurrent edit

1. A browser editor loads a requirement and its source-file token.
2. A text editor changes that file before the browser saves.
3. RMS rejects the stale write, retains the browser draft, and shows both versions.
4. The user reloads or explicitly reconciles before saving with a fresh token.

Git merges may also introduce logical record conflicts even when files merge
cleanly. Validation surfaces both kinds of conflict.

### 10.5 Review without installing the authoring UI

A reviewer uses generated static HTML or ordinary Markdown and a change report.
The report identifies its snapshot and completeness. Offline browsing does not
phone home or fetch remote assets. Formal approval remains a revision-bound
record; merely opening a report or approving an unrelated PR does not create it.

## 11. Security and trust boundaries

RMS processes untrusted Markdown, YAML, XML, Git metadata, file paths, URLs,
attachments, and repository configuration. Local execution does not make those
inputs trustworthy. V1 does not require external inference services or analytics.

| ID | Requirement |
|---|---|
| RMS-SEC-001 | Normal parsing, search, validation, comparison, reporting, and local UI use shall operate without network access; telemetry and crash uploads shall be absent by default and never include project content without explicit consent. |
| RMS-SEC-002 | Markdown rendering shall sanitize active HTML, block script/event-handler execution and unsafe URL schemes, and prevent automatic loading of remote images, fonts, or scripts. |
| RMS-SEC-003 | YAML/XML parsers shall disable executable types and XML external entities/DTD resolution, reject restricted YAML features, and enforce size/depth/count limits before excessive allocation. |
| RMS-SEC-004 | File reads/writes selected by repository data shall remain within the chosen root after canonical path resolution; symlink/junction escapes, traversal, and case-collision hazards shall be rejected. Explicit user-selected import/export paths are separate bounded permissions. |
| RMS-SEC-005 | The local service shall bind only to loopback in V1, validate Host and Origin, require a per-session token for data access and mutations, and resist cross-site requests and DNS rebinding. |
| RMS-SEC-006 | Read-only mode and CLI read commands shall not execute repository hooks, shell snippets, external diff/textconv programs, filters, or project-defined executables. Git invocation shall use argument arrays and neutralize relevant external execution configuration. |
| RMS-SEC-007 | Credentials, session tokens, and sensitive environment values shall not be written to authoritative files, URLs in exported reports, routine logs, or command diagnostics. |
| RMS-SEC-008 | CSV exports shall provide spreadsheet-safe handling of formula-like cells without changing authoritative text; lossless JSON export shall remain available. |
| RMS-SEC-009 | Imported authors, reviewer names, timestamps, signatures, and provider claims shall retain their provenance and verification status; unauthenticated claims shall not be displayed as authenticated approvals. |
| RMS-SEC-010 | Resource exhaustion, malformed inputs, or cancelled work shall not be reported as complete success or lose existing authoritative data; any interrupted multi-file application shall be detected, labeled recovery-required, and recoverable under RMS-QUA-002–003. |
| RMS-SEC-011 | Installation and normal use shall not add remotes, alter Git trust settings, disable TLS validation, or make repositories accessible to external users. |
| RMS-SEC-012 | Public releases shall document the security reporting channel, dependency inventory, supported versions, and known limitations; no compliance certification claims shall be inferred from traceability features. |

## 12. Quality and operational requirements

### 12.1 Correctness, durability, and portability

| ID | Requirement |
|---|---|
| RMS-QUA-001 | CLI, UI, and exports shall use the same parser, domain semantics, fingerprints, validation rules, and status projections, demonstrated by shared conformance fixtures. |
| RMS-QUA-002 | Single-file saves shall use a recoverable replacement strategy; multi-file operations shall preflight every target and maintain a durable recovery journal so interruption yields a recoverable before/after state. |
| RMS-QUA-003 | After interruption, the product shall detect an unfinished write plan before subsequent mutations and offer explicit complete/rollback recovery without overwriting intervening external edits. |
| RMS-QUA-004 | Derived indexes shall be safely removable and rebuilt from authoritative inputs; cache invalidation shall include project, worktree, snapshot, format, parser, and configuration identity. |
| RMS-QUA-005 | Independent worktrees and concurrent read processes shall not share mutable state in a way that mixes branch data; coordinated writers shall fail clearly on lock contention. |
| RMS-QUA-006 | Supported platforms shall produce identical fingerprints and equivalent reports for the same logical input, including newline differences, Unicode paths, and Git object formats. |
| RMS-QUA-007 | The system shall support Git SHA-1 and SHA-256 object identifiers without fixed 40-character assumptions, and shall never confuse Git object IDs with RMS content digests. |
| RMS-QUA-008 | Historical objects unavailable through shallow clones, garbage collection, submodule state, or unresolved LFS pointers shall be explicitly unavailable; V1 shall not automatically initialize submodules or fetch LFS content. |
| RMS-QUA-009 | Deleting RMS and its caches shall leave readable authoritative documents and documented durable records; no proprietary service shall be needed to export or interpret the data format. |

Multi-file writes are not assumed to be filesystem-transactional. The recovery
protocol must distinguish prepared, applying, completed, and recovery-required
states and retain originals until completion. Git is an additional recovery tool,
not a substitute for protecting uncommitted user edits.

Recovery journals are operational safety data, not disposable indexes. They shall
be ignored by Git, excluded from normal exports, and preserved until completion
or explicit recovery. Cache cleanup shall not delete them. Read-only operations
shall detect an unfinished journal and report an inconsistent snapshot rather than
silently indexing an interrupted write as a valid project state.

### 12.2 Performance and scale

These are initial product budgets to validate during the prototype, not measured
claims. Changing them requires an explicit SRS revision with benchmark evidence.
Benchmark results shall publish OS, CPU, storage, runtime, tool version, and dataset.

| ID | Requirement |
|---|---|
| RMS-PER-001 | On the reference fixture of 10,000 requirements, 500 documents, 50,000 links, 20,000 durable records, and at most 100 MiB of text, a cold inventory plus validation shall complete within 15 seconds at the 95th percentile of 20 runs. |
| RMS-PER-002 | On that fixture, an already indexed ordinary text/filter query shall return its first page within 300 ms at the 95th percentile of 100 queries, excluding browser rendering. |
| RMS-PER-003 | A warm reindex and validation of a single document containing at most 100 requirements shall complete within 2 seconds at the 95th percentile of 20 edits. |
| RMS-PER-004 | A two-endpoint comparison with at most 1,000 changed requirements on the reference fixture shall complete within 15 seconds at the 95th percentile of 20 runs; full ancestry history scans are measured separately. |
| RMS-PER-005 | Core inventory/validation peak resident memory shall not exceed 1 GiB on the reference fixture; large imports and history scans shall expose progress and obey configurable limits. |
| RMS-PER-006 | Operations exceeding 1 second shall expose progress or an indeterminate busy state and support cancellation; cancellation shall be acknowledged within 2 seconds outside an explicitly indicated atomic replacement section. |

The reference machine is a documented 4-core or greater development machine with
16 GiB RAM and local SSD storage. Timing includes parsing and domain processing,
excludes initial installation and network activity, and separates cold from warm
caches. Supported inputs beyond the reference fixture may be slower but must not
silently truncate. Default safety limits: 10 MiB per Markdown file, 100 MiB per
result import, 100,000 requirements, 1,000,000 edges, and parser nesting depth 128.
Limit failures shall report the limit and how an explicit local override works.

### 12.3 Usability, accessibility, and distribution

| ID | Requirement |
|---|---|
| RMS-UX-001 | A developer following the quickstart shall be able to initialize a sample repository, add a requirement, inspect its diff, and export a report within 15 minutes after prerequisites are installed. |
| RMS-UX-002 | Core UI flows shall be keyboard-operable, expose programmatic names and focus states, support zoom/reflow, and meet applicable WCAG 2.2 AA criteria, with documented manual and automated evidence. |
| RMS-UX-003 | The UI shall support light, dark, and system appearance without color-only status meaning or unreadable rendered documents. |
| RMS-UX-004 | Errors shall identify the affected file/subject, explain the consequence, and provide an actionable recovery step; raw stack traces belong in opt-in diagnostics. |
| RMS-DST-001 | The project shall publish an OSI-approved open-source license selected before its first public release, source, reproducible build instructions, contribution guidance, and a documented data-format license. |
| RMS-DST-002 | Distributions shall provide pinned-version installation and offline core use, with a support matrix and no runtime dependency added to adopter application builds. |
| RMS-DST-003 | Tool, repository-format, canonicalization, and machine-output versions shall be independently reported; compatibility and upgrade behavior shall be documented for each release. |
| RMS-DST-004 | Documentation shall include quickstart, authoring reference, schema reference, CLI reference, migration guide, evidence semantics, backup/recovery, integration examples, and uninstall/data-exit instructions. |
| RMS-DST-005 | Release artifacts shall include integrity checksums and documented provenance; self-updates or background package installation shall not occur without an explicit user action. |

## 13. Adoption, migration, and Meridian mapping

### 13.1 Generic adoption modes

| Mode | Authority | Behavior |
|---|---|---|
| Evaluation | Existing project sources | Read-only inventory and generated staging output; no new authority. |
| Native authoring | Marked Markdown plus durable records | RMS edits and validates authoritative files in normal Git workflows. |
| Publishing | A selected native snapshot | Generate read-only reports for consumers without RMS. |

A project must not leave both an imported spreadsheet and native records editable
as competing authorities. Compatibility CSVs are generated outputs after cutover.
Read-only adapters may continue to inspect historical sources with explicit labels.

### 13.2 Meridian as a reference adopter

Meridian currently distinguishes authoritative Markdown definitions, source
selection/overlay metadata, and a delivery ledger. Its IDs are not globally unique
and its ledger separates implementation from verification. The mapping below is
illustrative and requires a future local migration inventory; this SRS does not
perform migration or publish any underlying project data.

| Existing concept | RMS destination | Migration rule |
|---|---|---|
| Specification ID | Specification UUID plus human code | Preserve human code; assign stable UUID once. |
| Effective specification version | Version label and baseline provenance | Do not make version part of permanent requirement identity. |
| Requirement ID within specification | Human local ID | Resolve using specification; never globally deduplicate by local ID. |
| Requirement text and priority | Markdown statement and declared custom field | Preserve authoritative wording and source location. |
| Base/revision/amendment order | Import mapping and provenance manifest | Materialize one explicit effective definition; preserve every contributing source reference. |
| Requirement disposition | Disposition plus reason/target | Map only documented meanings. |
| Implementation status | Imported implementation assessment | Preserve scope and evidence; retain uncertainty. |
| Verification status | Imported verification assessment | Do not convert “checks not run” into passing evidence. |
| Implementation/verification evidence | Evidence references and provenance | Distinguish immutable facts, mutable URLs, and unverified claims. |
| Sprint/story/issue mapping | External work references | Scheduling is not delivery proof. |
| Source drift or missing amendment | Migration exception | Require resolution or explicit retained uncertainty. |

V1 native authoring has one effective definition per UUID in a snapshot. It does
not continuously apply stacked amendment documents at runtime. Adoption converts
an explicitly selected overlay into that effective view, records provenance, and
then uses ordinary Git revisions for subsequent changes. Historic source files
remain available outside native discovery or through read-only mappings.

### 13.3 Migration acceptance

The migration report shall reconcile source and target counts, stable identity
mapping, text differences, status mappings, links, unresolved exceptions, and
excluded source versions. Repeated previews over identical inputs produce the
same proposed identities and content. Apply checks input digests against the
preview. A cutover decision names the new authorities and archived inputs.

Meridian's application modules, Java dependencies, tests, and quality-gate policy
need not change to adopt the core tool. Any future invocation from Meridian's
local gate is a separate, explicit integration change in that repository.

## 14. Acceptance scenarios and verification

Verification methods: **T** automated test, **I** inspection, **D** user-facing
demonstration, **B** reproducible benchmark. Implementers shall maintain a complete
requirement-to-test/inspection mapping before V1 release. The scenarios below are
the mandatory cross-cutting acceptance set.

| Scenario | Given / when / then | Requirements principally covered | Method |
|---|---|---|---|
| AC-01 Fresh adoption | Given a nonempty Git repository, preview and apply init; only selected setup files change, and a fresh clone reproduces the inventory. | INI-001–006, DST-002 | T, D |
| AC-02 Parse boundaries | Given fenced examples, nested headings, malformed metadata, duplicate IDs, and conflict markers, parse; real blocks resolve and invalid inputs have exact diagnostics. | PAR-001–007, VAL-001–002 | T |
| AC-03 Stable identity | Rename, move, and renumber one requirement; incoming links and history remain attached to the UUID, while context changes remain visible. | AUT-003–004, GIT-003, TRC-001 | T |
| AC-04 Clone and split | Clone/split an approved requirement; new UUIDs appear and approvals/evidence are not silently inherited. | AUT-005–007 | T, D |
| AC-05 Meaningful diff | Change statement, priority, relation, label, soft wrapping, hard break, code whitespace, and link destination independently; classifications and fingerprints follow section 7. | GIT-009, QUA-001, QUA-006 | T |
| AC-06 Context impact | Edit normative document prose or an explicit normative attachment; affected approvals/evidence need review and causal context is displayed. | PAR-007, TRC-004–005, REV-003 | T |
| AC-07 Git isolation | Read commits in a linked worktree, detached HEAD, and bare repository; branches/index remain unchanged and unavailable shallow objects are explicit. | GIT-001–008, QUA-007–008 | T |
| AC-08 Selection change | Exclude a formerly included document through config; comparison reports scope removal instead of a clean unchanged inventory. | GIT-003, GIT-008, VAL-006 | T |
| AC-09 Baseline integrity | Create a baseline at commit A, change files and tag targets, then inspect; baseline still resolves A or reports it missing, never retargets. | BAS-001–007 | T, D |
| AC-10 No self-reference | Commit definitions and reviews at A; create and commit baseline manifest at B; baseline source/evidence view remains A. | BAS-002–005 | T |
| AC-11 Graph validation | Add missing targets and prohibited cycles; diagnostics identify edges, impact traversal terminates, and incomplete traversal is labeled. | TRC-002–004 | T |
| AC-12 Honest coverage | Mix passed, failed, linked-only, stale, excluded, and unknown requirements; report displays transparent denominators and no false compliance claim. | TRC-006–007, RPT-001–004 | T, I |
| AC-13 Review currency | Approve a revision, edit it, then re-review; old approval remains historical and new approval binds the new subjects only. | REV-001–003, REV-006 | T, D |
| AC-14 Concurrent decisions | Merge contradictory records with skewed timestamps; status is conflicted until an explicit reconciliation supersedes both. | REV-004–005, EVD-010 | T |
| AC-15 Evidence truth | Import mapped passing, skipped, failing, and ambiguous tests; only an explicit complete assessment can pass, and imports never upgrade unknowns. | EVD-001–011 | T |
| AC-16 Idempotent evidence | Import the same run twice, then different data with that run ID; duplicate is a no-op and altered content is a conflict. | EVD-006–008 | T |
| AC-17 Artifact currency | Assess code commit A, select B with unchanged requirements; A's evidence remains historical and does not claim verification at B. | EVD-003, EVD-011 | T |
| AC-18 Save conflict | Modify a file externally after opening it in the UI; save fails safely and retains the unsaved draft. | AUT-008, UI-003–004 | T, D |
| AC-19 Interrupted write | Interrupt each phase of a multi-file move/migration; recovery detects state and never overwrites unrelated concurrent edits. | QUA-002–005, SEC-010 | T |
| AC-20 Rebuild and exit | Delete caches and regenerate, then uninstall RMS; authoritative data and exported records remain complete and readable. | RPT-005, QUA-004, QUA-009 | T, I |
| AC-21 Safe rendering | Open malicious HTML, remote image links, formula-like CSV text, unsafe XML, and YAML tags; no scripts, external requests, or constructors execute. | SEC-001–003, SEC-008 | T |
| AC-22 Local boundary | Attempt cross-origin access, DNS rebinding, path traversal, junction escape, and untrusted Git helpers; access/execution is rejected. | SEC-004–007, SEC-011 | T |
| AC-23 Read-only mode | Browse, search, compare, and export to a selected external directory in read-only mode; repository bytes and metadata stay unchanged. | UI-005, RPT-006, SEC-006 | T |
| AC-24 Migration fidelity | Import composite source IDs, overlays, missing amendments, and unverified statuses; preserve identities/provenance and enumerate unresolved exceptions. | MIG-001–007 | T, I |
| AC-25 Upgrade control | Read an unsupported format and preview a supported upgrade; reads do not mutate, and explicit upgrade has a recoverable plan. | MIG-008, DST-003 | T |
| AC-26 Automation contract | Exercise success, findings, invalid config, missing objects, conflicts, and cancellation; stdout JSON and exit codes match section 9. | VAL-002–005, QUA-001 | T |
| AC-27 Accessibility | Complete authoring, comparison, review, and conflict recovery by keyboard and with a screen reader in light/dark modes. | UI-001–007, UX-001–004 | D, I, T |
| AC-28 Scale | Run the declared fixtures on a documented reference machine and publish distributions and peak memory. | PER-001–006 | B |
| AC-29 Distribution | Install a pinned release on supported OSes, operate offline, and follow recovery/uninstall instructions. | DST-001–005, SEC-012 | D, I |
| AC-30 Reverted content | Approve a definition, change it, revoke approval, and revert its text; identity and matching content are recognized but the revocation remains effective. | GIT-010, REV-001–004 | T |

Abbreviated requirement references in this table carry the `RMS-` prefix. Range
notation includes every numbered requirement in that range. Not every individual
requirement is exhausted by these scenarios; the release traceability matrix must
also cover schema documentation, record preservation, limit handling, and negative
cases from the full normative text.

The test corpus shall include Windows paths, CRLF/LF, non-ASCII names, duplicate
human IDs across specifications, two worktrees, Git merges and shallow clones,
missing historical objects, partial evidence, case-colliding paths, malformed
Markdown/YAML/XML, conflicting durable records, cancelled operations, and malicious
content. Fixtures shall be synthetic or redistributable; adopter proprietary data
shall not be used as public test material without permission.

## 15. Delivery sequence and release criteria

### 15.1 V1 increments

| Increment | Deliverable | Exit condition |
|---|---|---|
| A — Format and identity | Repository schema, parser, canonicalization, identity, CLI inventory/validation | Published golden fixtures and deterministic cross-platform identity/hash behavior. |
| B — History and baselines | Snapshot reader, requirement diff/history, baseline manifests | Correct moves, removals, context changes, incomplete-history behavior, and immutable as-of views. |
| C — Traceability and decisions | Typed links, impact, review, assessment, evidence model | Honest currency/conflict/coverage projections with durable records. |
| D — Usable local product | Browser UI, safe edits, exports, migration and result import | End-to-end author/review/verify workflows and interruption recovery. |
| E — Public release | Packaging, documentation, security, accessibility, benchmark evidence | All V1 Must requirements accepted or explicitly changed through an approved SRS revision. |

Early increments can be preview releases. They must state their limitations and
must not be called full V1 while Must functionality remains incomplete.

### 15.2 Candidate later capabilities

- Optional GitHub/GitLab adapters for change summaries and authenticated metadata.
- Public programmatic library/API and editor language-server integration.
- Cross-repository requirements with pinned dependency manifests.
- ReqIF import/export, office-document import, and PDF publishing.
- Signed approvals, authenticated review identities, and compliance profiles.
- Hosted multiuser service with explicit authorization and deployment architecture.
- Visual graph layouts beyond matrices and navigable relation lists.
- Assistive requirement linting or AI suggestions with explicit data/egress controls.

These additions must preserve Git/Markdown ownership and offline core operation.
They require their own requirements and threat/compatibility analysis before
implementation; the current SRS does not authorize a hosted architecture by default.

### 15.3 V1 release gate

V1 release requires a complete requirement-to-evidence matrix, accepted mandatory
scenarios, published schemas and canonicalization fixtures, compatibility tests,
recovery tests, supported-platform evidence, accessibility findings and resolution,
benchmark results, security review, license decision, and user/contributor docs.
Known limitations must be visible. A Must may not be silently reclassified as a
future item to obtain a green release report.

## 16. Risks and decisions

### 16.1 Principal risks

| Risk | Required response |
|---|---|
| False confidence from statuses | Keep outcome, scope, provenance, and currency separate; show unknown/conflicted states. |
| Overcomplicated document grammar | Prototype real editing and round-trip cases before freezing format 1. |
| Hash drift across parser releases | Version canonicalization; publish cross-implementation golden fixtures. |
| Competing authoritative stores | Document authority and cutover; keep indexes disposable and CSVs generated. |
| Unreliable approval identity | Label local actor claims; defer authenticated approval to a separately designed feature. |
| Lost Git history | Pin object IDs, diagnose missing objects, document refs/bundles/backups. |
| Silent damage from concurrent edits | Optimistic concurrency, transactional write plans, explicit recovery. |
| Treating migration as semantic inference | Require explicit mappings; preserve ambiguous material as unresolved. |
| Product grows into general ALM | Keep V1 local; use external work references and test imports. |
| Large specification scope | Deliver increments with honest preview labels; preserve the complete target scope. |

### 16.2 Decisions already proposed by this SRS

- Local-first CLI and browser UI; no mandatory hosted service.
- Git/Markdown/YAML durable data; rebuildable indexes.
- UUID identity with specification-qualified human IDs.
- One effective native definition per requirement per snapshot.
- Explicit block syntax in ordinary Markdown.
- Separate lifecycle, disposition, approval, implementation, verification, and currency.
- Conservative revision-bound impact and evidence handling.
- Append-only product-managed decision records with conflict detection.
- No automatic staging, commits, remote mutations, or project check installation.

These are reviewable design choices for the new product, not facts about an
existing implementation. Accepting this SRS establishes them as the initial
contract; changing them later requires a documented specification revision.

### 16.3 Open decisions and when they block

| Decision | Needed by | Impact |
|---|---|---|
| Product/repository/executable/package names | Repository and package setup | Branding and command examples; does not change domain semantics. |
| OSI-approved source license and documentation/format license | Public repository publication | Legal distribution terms; requires owner selection. |
| Implementation language, runtime, UI framework, packaging | Start of implementation | Development and distribution architecture; use an ADR. |
| Minimum supported OS/architecture/Git/browser versions | First distributed preview | Concrete compatibility matrix and CI environment. |
| Final block grammar and complete JSON/YAML schemas | End of increment A | Freeze only after round-trip and authoring prototypes. |
| Exact canonical tree representation and hash vectors | End of increment A | Required before approvals/evidence depend on fingerprints. |
| Maintainer governance and contribution agreement policy | First external contribution | Contribution and release process. |
| Initial migration dataset and permitted fixtures | Migration implementation | Use synthetic/public inputs unless adopter explicitly authorizes otherwise. |

No open decision permits guessing requirement compliance. Language/library choices
are intentionally left to implementation planning rather than inheriting
Meridian's application stack merely because Meridian is the first adopter.

## 17. Glossary

| Term | Meaning |
|---|---|
| Requirement | An individually identified obligation with statement and metadata. |
| Specification | A logical collection of requirements that may span documents. |
| Snapshot | A frozen repository view used for deterministic interpretation. |
| Baseline | A named, immutable scope at an exact committed snapshot. |
| Definition fingerprint | Versioned digest of a requirement's normative definition. |
| Governance fingerprint | Digest of the context, scope, relations, and policy governing a subject. |
| Currency | Whether a recorded decision still applies to the selected subject/scope. |
| Evidence | A traceable artifact or observation supporting an assessment. |
| Verification obligation | A required check or method whose evidence contributes to verification. |
| Assessment | An explicit evaluation of implementation or verification for a revision and scope. |
| Impact obligation | A review need caused by a specific upstream change and relation path. |
| Qualified ID | Human-readable specification code plus local ID, distinct from immutable UUID. |
| Native authoring | Editing the documented RMS Markdown/record format as the authority. |
| Materialized overlay | An explicitly resolved effective definition derived from ordered source revisions/amendments. |

## 18. References

External references define terminology or syntax baselines. RMS-specific behavior,
schemas, and acceptance rules are proposed by this SRS rather than delegated to
external product documentation. References were consulted on 2026-09-29.

- [CommonMark specification index](https://spec.commonmark.org/) and
  [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/): Markdown parsing baseline.
- [YAML 1.2.2 specification](https://yaml.org/spec/1.2.2/): base serialization syntax;
  RMS intentionally accepts a restricted data subset.
- [Git worktree documentation](https://git-scm.com/docs/git-worktree): reference for
  separate working trees attached to a repository; RMS must not assume one checkout.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): accessibility criteria for the browser UI.

This document is original product requirements work. It does not reproduce a
third-party product's specification or incorporate proprietary adopter data.

