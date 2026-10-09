# Implementation status and SRS traceability

This is an executable **preview**, not an accepted V1 release. The original SRS is unchanged; every Must requirement remains in scope. Group-level tests do not establish every clause's release acceptance.

## Verification

- Windows 11 x64, Node 22.17.1, npm 11.11.0, Git 2.49.0.windows.1.
- TypeScript check, production build and 60 automated tests pass.
- Core/server statement coverage is 81.44%; worker subprocesses and React UI are verified separately.
- npm audit reports zero known vulnerabilities at the recorded check.
- Tests cover exact impact/change applicability, reconciliation, expiry/waivers, baseline gates/subsets, native evidence, overlays/labeled blocks, portable integrity/restore, binary attachments, filtered reports, index captures, API cancellation and every recovery journal phase.
- Browser verification uses synthetic data. No adopter sources or credentials appear in screenshots.
- Windows/Linux/macOS CI validates generated schemas, conformance, tests and package artifacts on each PR. Refer to the exact PR run for execution results.
- Raw scale samples and methodology are in [performance.md](performance.md). Final p95: cold 14.69s, query 33.8ms, incremental edit 0.34s, comparison 13.65s; inventory peak 666MiB.

## Before accepting or publishing V1

1. Complete the manual screen-reader, zoom/reflow and WCAG 2.2 AA evidence in accessibility.md.
2. Review physical power-loss limits and acceptance evidence on the supported filesystem/platform matrix.
3. Enable GitHub private vulnerability reporting, choose a support period, and publish clean-source package/checksum/provenance artifacts through the owner's release process.
4. Review full conformance and the benchmark environment before freezing format 1 and rms-c14n-1. Expanded preview policies conservatively invalidate older governance-bound decisions; compatibility is documented in release.md.

These acceptance/distribution obligations do not drop SRS clauses. The product provides policy, authoring, history, baseline, trace, evidence, validation, migration, restore, reporting and recovery workflows. Some advanced metadata/mappings use explicit JSON. No imported status or actor claim becomes authenticated approval.

Optional local username/password logins now add browser attribution: session-bound previews, assigned reviewer roles, server-bound decision actors and timestamps, and automatic append-only requirement change records. Authentication tests cover login failures, forged actors, account configuration, password hashing, expiry/logout, preview ownership, read-only mode and throttling. This extends the original preview scope; enterprise identity and signed/tamper-proof approvals remain outside it. See [setup and limits](operations.md#user-logins).

## Requirement inventory

127 numbered requirements are tracked. Implemented/group evidence identifies concrete code and test groups; it is not per-clause certification.

| Requirement | Status | Evidence or acceptance limitation |
|---|---|---|
| RMS-INI-001 | Implemented; group evidence | Initialization, config validation, explicit setup plan; core/CLI tests |
| RMS-INI-002 | Implemented; group evidence | Initialization, config validation, explicit setup plan; core/CLI tests |
| RMS-INI-003 | Implemented; group evidence | Initialization, config validation, explicit setup plan; core/CLI tests |
| RMS-INI-004 | Implemented; group evidence | Initialization, config validation, explicit setup plan; core/CLI tests |
| RMS-INI-005 | Implemented; group evidence | Initialization, config validation, explicit setup plan; core/CLI tests |
| RMS-INI-006 | Implemented; group evidence | Initialization, config validation, explicit setup plan; core/CLI tests |
| RMS-PAR-001 | Implemented; group evidence | CommonMark block parser, schema checks, canonical fixtures; core/contracts tests |
| RMS-PAR-002 | Implemented; group evidence | CommonMark block parser, schema checks, canonical fixtures; core/contracts tests |
| RMS-PAR-003 | Implemented; group evidence | CommonMark block parser, schema checks, canonical fixtures; core/contracts tests |
| RMS-PAR-004 | Implemented; group evidence | CommonMark block parser, schema checks, canonical fixtures; core/contracts tests |
| RMS-PAR-005 | Implemented; group evidence | CommonMark block parser, schema checks, canonical fixtures; core/contracts tests |
| RMS-PAR-006 | Implemented; group evidence | CommonMark block parser, schema checks, canonical fixtures; core/contracts tests |
| RMS-PAR-007 | Implemented; group evidence | CommonMark block parser, schema checks, canonical fixtures; core/contracts tests |
| RMS-AUT-001 | Implemented; group evidence | Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke |
| RMS-AUT-002 | Implemented; group evidence | Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke |
| RMS-AUT-003 | Implemented; group evidence | Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke |
| RMS-AUT-004 | Implemented; group evidence | Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke |
| RMS-AUT-005 | Implemented; group evidence | Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke |
| RMS-AUT-006 | Implemented; group evidence | Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke |
| RMS-AUT-007 | Implemented; group evidence | Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke |
| RMS-AUT-008 | Implemented; group evidence | Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke |
| RMS-AUT-009 | Implemented; group evidence | Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke |
| RMS-GIT-001 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-GIT-002 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-GIT-003 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-GIT-004 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-GIT-005 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-GIT-006 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-GIT-007 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-GIT-008 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-GIT-009 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-GIT-010 | Implemented; group evidence | Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests |
| RMS-BAS-001 | Implemented; group evidence | Exact-commit manifests, configurable gates and subset projections with complete dependencies; core/policy/index tests |
| RMS-BAS-002 | Implemented; group evidence | Exact-commit manifests, configurable gates and subset projections with complete dependencies; core/policy/index tests |
| RMS-BAS-003 | Implemented; group evidence | Exact-commit manifests, configurable gates and subset projections with complete dependencies; core/policy/index tests |
| RMS-BAS-004 | Implemented; group evidence | Exact-commit manifests, configurable gates and subset projections with complete dependencies; core/policy/index tests |
| RMS-BAS-005 | Implemented; group evidence | Exact-commit manifests, configurable gates and subset projections with complete dependencies; core/policy/index tests |
| RMS-BAS-006 | Implemented; group evidence | Exact-commit manifests, configurable gates and subset projections with complete dependencies; core/policy/index tests |
| RMS-BAS-007 | Implemented; group evidence | Exact-commit manifests, configurable gates and subset projections with complete dependencies; core/policy/index tests |
| RMS-TRC-001 | Implemented; group evidence | Graph validation, causal paths, exact impact decisions/reconciliation and filtered matrices; core/policy/workflows tests |
| RMS-TRC-002 | Implemented; group evidence | Graph validation, causal paths, exact impact decisions/reconciliation and filtered matrices; core/policy/workflows tests |
| RMS-TRC-003 | Implemented; group evidence | Graph validation, causal paths, exact impact decisions/reconciliation and filtered matrices; core/policy/workflows tests |
| RMS-TRC-004 | Implemented; group evidence | Graph validation, causal paths, exact impact decisions/reconciliation and filtered matrices; core/policy/workflows tests |
| RMS-TRC-005 | Implemented; group evidence | Graph validation, causal paths, exact impact decisions/reconciliation and filtered matrices; core/policy/workflows tests |
| RMS-TRC-006 | Implemented; group evidence | Graph validation, causal paths, exact impact decisions/reconciliation and filtered matrices; core/policy/workflows tests |
| RMS-TRC-007 | Implemented; group evidence | Graph validation, causal paths, exact impact decisions/reconciliation and filtered matrices; core/policy/workflows tests |
| RMS-REV-001 | Implemented; group evidence | Revision-bound reviews, dependency currency, explicit conflict resolution; core tests |
| RMS-REV-002 | Implemented; group evidence | Revision-bound reviews, dependency currency, explicit conflict resolution; core tests |
| RMS-REV-003 | Implemented; group evidence | Revision-bound reviews, dependency currency, explicit conflict resolution; core tests |
| RMS-REV-004 | Implemented; group evidence | Revision-bound reviews, dependency currency, explicit conflict resolution; core tests |
| RMS-REV-005 | Implemented; group evidence | Revision-bound reviews, dependency currency, explicit conflict resolution; core tests |
| RMS-REV-006 | Implemented; group evidence | Revision-bound reviews, dependency currency, explicit conflict resolution; core tests |
| RMS-EVD-001 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-002 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-003 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-004 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-005 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-006 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-007 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-008 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-009 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-010 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-011 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-EVD-012 | Implemented; group evidence | Obligations, mapped imports, explicit assessments, artifact currency; interchange tests |
| RMS-VAL-001 | Implemented; group evidence | Located findings, advisory severities, retained expiring waivers and evaluation provenance; policy/contracts tests |
| RMS-VAL-002 | Implemented; group evidence | Located findings, advisory severities, retained expiring waivers and evaluation provenance; policy/contracts tests |
| RMS-VAL-003 | Implemented; group evidence | Located findings, advisory severities, retained expiring waivers and evaluation provenance; policy/contracts tests |
| RMS-VAL-004 | Implemented; group evidence | Located findings, advisory severities, retained expiring waivers and evaluation provenance; policy/contracts tests |
| RMS-VAL-005 | Implemented; group evidence | Located findings, advisory severities, retained expiring waivers and evaluation provenance; policy/contracts tests |
| RMS-VAL-006 | Implemented; group evidence | Located findings, advisory severities, retained expiring waivers and evaluation provenance; policy/contracts tests |
| RMS-RPT-001 | Implemented; group evidence | Indexed queries, filtered inventory/comparison/matrix/gaps, portable export/restore; workflows/index tests |
| RMS-RPT-002 | Implemented; group evidence | Indexed queries, filtered inventory/comparison/matrix/gaps, portable export/restore; workflows/index tests |
| RMS-RPT-003 | Implemented; group evidence | Indexed queries, filtered inventory/comparison/matrix/gaps, portable export/restore; workflows/index tests |
| RMS-RPT-004 | Implemented; group evidence | Indexed queries, filtered inventory/comparison/matrix/gaps, portable export/restore; workflows/index tests |
| RMS-RPT-005 | Implemented; group evidence | Indexed queries, filtered inventory/comparison/matrix/gaps, portable export/restore; workflows/index tests |
| RMS-RPT-006 | Implemented; group evidence | Indexed queries, filtered inventory/comparison/matrix/gaps, portable export/restore; workflows/index tests |
| RMS-UI-001 | Implemented; group evidence | React register, editor, preview, decisions, compare, trace and baseline views; browser smoke |
| RMS-UI-002 | Implemented; group evidence | React register, editor, preview, decisions, compare, trace and baseline views; browser smoke |
| RMS-UI-003 | Implemented; group evidence | React register, editor, preview, decisions, compare, trace and baseline views; browser smoke |
| RMS-UI-004 | Implemented; group evidence | React register, editor, preview, decisions, compare, trace and baseline views; browser smoke |
| RMS-UI-005 | Implemented; group evidence | React register, editor, preview, decisions, compare, trace and baseline views; browser smoke |
| RMS-UI-006 | Implemented; group evidence | React register, editor, preview, decisions, compare, trace and baseline views; browser smoke |
| RMS-UI-007 | Implemented; group evidence | React register, editor, preview, decisions, compare, trace and baseline views; browser smoke |
| RMS-MIG-001 | Implemented; group evidence | Deterministic CSV/JSON/table/labeled-block/overlay staging, guarded replay and native restore; workflows/interchange tests |
| RMS-MIG-002 | Implemented; group evidence | Deterministic CSV/JSON/table/labeled-block/overlay staging, guarded replay and native restore; workflows/interchange tests |
| RMS-MIG-003 | Implemented; group evidence | Deterministic CSV/JSON/table/labeled-block/overlay staging, guarded replay and native restore; workflows/interchange tests |
| RMS-MIG-004 | Implemented; group evidence | Deterministic CSV/JSON/table/labeled-block/overlay staging, guarded replay and native restore; workflows/interchange tests |
| RMS-MIG-005 | Implemented; group evidence | Deterministic CSV/JSON/table/labeled-block/overlay staging, guarded replay and native restore; workflows/interchange tests |
| RMS-MIG-006 | Implemented; group evidence | Deterministic CSV/JSON/table/labeled-block/overlay staging, guarded replay and native restore; workflows/interchange tests |
| RMS-MIG-007 | Implemented; group evidence | Deterministic CSV/JSON/table/labeled-block/overlay staging, guarded replay and native restore; workflows/interchange tests |
| RMS-MIG-008 | Implemented; group evidence | Deterministic CSV/JSON/table/labeled-block/overlay staging, guarded replay and native restore; workflows/interchange tests |
| RMS-SEC-001 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-002 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-003 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-004 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-005 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-006 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-007 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-008 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-009 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-010 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-011 | Implemented; group evidence | Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests |
| RMS-SEC-012 | Acceptance limitation | Dependency/support/limitations documented; GitHub private reporting must be enabled before public distribution |
| RMS-QUA-001 | Implemented; group evidence | Shared core, digest guards, recovery journal and independent snapshots; all test suites |
| RMS-QUA-002 | Acceptance limitation | Every journal phase has complete/rollback injection tests; physical power-loss durability and Windows directory sync remain acceptance limits |
| RMS-QUA-003 | Implemented; group evidence | Shared core, digest guards, recovery journal and independent snapshots; all test suites |
| RMS-QUA-004 | Implemented; group evidence | Shared core, digest guards, recovery journal and independent snapshots; all test suites |
| RMS-QUA-005 | Implemented; group evidence | Shared core, digest guards, recovery journal and independent snapshots; all test suites |
| RMS-QUA-006 | Implemented; group evidence | Shared core, digest guards, recovery journal and independent snapshots; all test suites |
| RMS-QUA-007 | Implemented; group evidence | Shared core, digest guards, recovery journal and independent snapshots; all test suites |
| RMS-QUA-008 | Implemented; group evidence | Shared core, digest guards, recovery journal and independent snapshots; all test suites |
| RMS-QUA-009 | Implemented; group evidence | Shared core, digest guards, recovery journal and independent snapshots; all test suites |
| RMS-PER-001 | Implementation/evidence; release review required | Full-scale raw samples, p95, memory and reproducible fixture; docs/performance.md |
| RMS-PER-002 | Implementation/evidence; release review required | Full-scale raw samples, p95, memory and reproducible fixture; docs/performance.md |
| RMS-PER-003 | Implementation/evidence; release review required | Full-scale raw samples, p95, memory and reproducible fixture; docs/performance.md |
| RMS-PER-004 | Implementation/evidence; release review required | Full-scale raw samples, p95, memory and reproducible fixture; docs/performance.md |
| RMS-PER-005 | Implementation/evidence; release review required | Full-scale raw samples, p95, memory and reproducible fixture; docs/performance.md |
| RMS-PER-006 | Implementation/evidence; release review required | Full-scale raw samples, p95, memory and reproducible fixture; docs/performance.md |
| RMS-UX-001 | Implementation/evidence; release review required | Quickstart, native controls, focus styles, responsive layouts and appearance modes; browser smoke only |
| RMS-UX-002 | Acceptance limitation | Native keyboard controls, named dialogs and responsive themes verified; full screen-reader/WCAG 2.2 AA audit remains |
| RMS-UX-003 | Implementation/evidence; release review required | Quickstart, native controls, focus styles, responsive layouts and appearance modes; browser smoke only |
| RMS-UX-004 | Implementation/evidence; release review required | Quickstart, native controls, focus styles, responsive layouts and appearance modes; browser smoke only |
| RMS-DST-001 | Implementation/evidence; release review required | Pinned Node archive, checksums/source/dependency provenance, GPL source/docs/schema terms, compatibility/install guides and CI |
| RMS-DST-002 | Acceptance limitation | Independent pinned Node archive tested locally; platform evidence is scoped to the exact CI run/runtime matrix |
| RMS-DST-003 | Implementation/evidence; release review required | Pinned Node archive, checksums/source/dependency provenance, GPL source/docs/schema terms, compatibility/install guides and CI |
| RMS-DST-004 | Implementation/evidence; release review required | Pinned Node archive, checksums/source/dependency provenance, GPL source/docs/schema terms, compatibility/install guides and CI |
| RMS-DST-005 | Implementation/evidence; release review required | Pinned Node archive, checksums/source/dependency provenance, GPL source/docs/schema terms, compatibility/install guides and CI |
