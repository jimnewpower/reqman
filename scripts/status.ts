import { readFile, writeFile } from "node:fs/promises";
const text = await readFile("docs/requirements/reqman-srs.md", "utf8");
const ids = [...text.matchAll(/^\| (RMS-[A-Z]+-\d+) \|/gm)].map((m) => m[1]);
const evidence: Record<string, string> = {
  INI: "Initialization, config validation, explicit setup plan; core/CLI tests",
  PAR: "CommonMark block parser, schema checks, canonical fixtures; core/contracts tests",
  AUT: "Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke",
  GIT: "Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests",
  BAS: "Exact-commit manifests, configurable gates and subset projections with complete dependencies; core/policy/index tests",
  TRC: "Graph validation, causal paths, exact impact decisions/reconciliation and filtered matrices; core/policy/workflows tests",
  REV: "Revision-bound reviews, dependency currency, explicit conflict resolution; core tests",
  EVD: "Obligations, mapped imports, explicit assessments, artifact currency; interchange tests",
  VAL: "Located findings, advisory severities, retained expiring waivers and evaluation provenance; policy/contracts tests",
  RPT: "Indexed queries, filtered inventory/comparison/matrix/gaps, portable export/restore; workflows/index tests",
  UI: "React register, editor, preview, decisions, compare, trace and baseline views; browser smoke",
  MIG: "Deterministic CSV/JSON/table/labeled-block/overlay staging, guarded replay and native restore; workflows/interchange tests",
  SEC: "Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests",
  QUA: "Shared core, digest guards, recovery journal and independent snapshots; all test suites",
  PER: "Full-scale raw samples, p95, memory and reproducible fixture; docs/performance.md",
  UX: "Quickstart, native controls, focus styles, responsive layouts and appearance modes; browser smoke only",
  DST: "Pinned Node archive, checksums/source/dependency provenance, GPL source/docs/schema terms, compatibility/install guides and CI",
};
let benchmark:
  | {
      p95_ms: { cold: number; query: number; edit: number; comparison: number };
      max_rss_bytes: number;
    }
  | undefined;
try {
  benchmark = JSON.parse(await readFile("docs/benchmark-final.json", "utf8"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const partial: Record<string, string> = {
  "RMS-QUA-002":
    "Every journal phase has complete/rollback injection tests; physical power-loss durability and Windows directory sync remain acceptance limits",
  "RMS-UX-002":
    "Native keyboard controls, named dialogs and responsive themes verified; full screen-reader/WCAG 2.2 AA audit remains",
  "RMS-SEC-012":
    "Dependency/support/limitations documented; GitHub private reporting must be enabled before public distribution",
  "RMS-DST-002":
    "Independent pinned Node archive tested locally; platform evidence is scoped to the exact CI run/runtime matrix",
};
const heading = `# Implementation status and SRS traceability

This is an executable **preview**, not an accepted V1 release. The original SRS is unchanged; every Must requirement remains in scope. Group-level tests do not establish every clause's release acceptance.

## Verification

- Windows 11 x64, Node 22.17.1, npm 11.11.0, Git 2.49.0.windows.1.
- TypeScript check, production build and 60 automated tests pass.
- Core/server statement coverage is 81.44%; worker subprocesses and React UI are verified separately.
- npm audit reports zero known vulnerabilities at the recorded check.
- Tests cover exact impact/change applicability, reconciliation, expiry/waivers, baseline gates/subsets, native evidence, overlays/labeled blocks, portable integrity/restore, binary attachments, filtered reports, index captures, API cancellation and every recovery journal phase.
- Browser verification uses synthetic data. No adopter sources or credentials appear in screenshots.
- Windows/Linux/macOS CI validates generated schemas, conformance, tests and package artifacts on each PR. Refer to the exact PR run for execution results.
- Raw scale samples and methodology are in [performance.md](performance.md). ${benchmark ? `Final p95: cold ${(benchmark.p95_ms.cold / 1000).toFixed(2)}s, query ${benchmark.p95_ms.query.toFixed(1)}ms, incremental edit ${(benchmark.p95_ms.edit / 1000).toFixed(2)}s, comparison ${(benchmark.p95_ms.comparison / 1000).toFixed(2)}s; inventory peak ${(benchmark.max_rss_bytes / 1048576).toFixed(0)}MiB.` : "Final measurement pending."}

## Before accepting or publishing V1

1. Complete the manual screen-reader, zoom/reflow and WCAG 2.2 AA evidence in accessibility.md.
2. Review physical power-loss limits and acceptance evidence on the supported filesystem/platform matrix.
3. Enable GitHub private vulnerability reporting, choose a support period, and publish clean-source package/checksum/provenance artifacts through the owner's release process.
4. Review full conformance and the benchmark environment before freezing format 1 and rms-c14n-1. Expanded preview policies conservatively invalidate older governance-bound decisions; compatibility is documented in release.md.

These acceptance/distribution obligations do not drop SRS clauses. The product provides policy, authoring, history, baseline, trace, evidence, validation, migration, restore, reporting and recovery workflows. Some advanced metadata/mappings use explicit JSON. No imported status or actor claim becomes authenticated approval.

## Requirement inventory

${ids.length} numbered requirements are tracked. Implemented/group evidence identifies concrete code and test groups; it is not per-clause certification.

| Requirement | Status | Evidence or acceptance limitation |
|---|---|---|
`;
const rows = ids.map((id) => {
  const family = id.split("-")[1];
  const status = partial[id]
    ? "Acceptance limitation"
    : ["PER", "UX", "DST"].includes(family)
      ? "Implementation/evidence; release review required"
      : "Implemented; group evidence";
  return `| ${id} | ${status} | ${partial[id] ?? evidence[family]} |`;
});
await writeFile("docs/status.md", heading + rows.join("\n") + "\n");
