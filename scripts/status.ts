import { readFile, writeFile } from "node:fs/promises";
const text = await readFile("docs/requirements/reqman-srs.md", "utf8");
const ids = [...text.matchAll(/^\| (RMS-[A-Z]+-\d+) \|/gm)].map((m) => m[1]);
const evidence: Record<string, string> = {
  INI: "Initialization, config validation, explicit setup plan; core/CLI tests",
  PAR: "CommonMark block parser, schema checks, canonical fixtures; core/contracts tests",
  AUT: "Authoring plans, UUID moves/clones/successors, source tokens; core/contracts tests + browser smoke",
  GIT: "Commit reads, endpoint/merge-base comparison, worktrees/SHA-256; core/contracts tests",
  BAS: "Immutable exact-commit manifests and as-of reads; core tests",
  TRC: "Typed graph validation, causal impact queries, coverage projection; core tests",
  REV: "Revision-bound reviews, dependency currency, explicit conflict resolution; core tests",
  EVD: "Obligations, mapped imports, explicit assessments, artifact currency; interchange tests",
  VAL: "Deterministic findings and CLI result envelope; core/contracts tests",
  RPT: "Register/search and offline inventories/portable exports; interchange tests",
  UI: "React register, editor, preview, decisions, compare, trace and baseline views; browser smoke",
  MIG: "Deterministic staging import for CSV/JSON/simple tables; interchange tests",
  SEC: "Restricted parsers, escaped output, loopback authentication, safe paths; core/interchange/server tests",
  QUA: "Shared core, digest guards, recovery journal and independent snapshots; all test suites",
  PER: "No SRS-scale performance acceptance evidence yet",
  UX: "Quickstart, native controls, focus styles, responsive layouts and appearance modes; browser smoke only",
  DST: "Source distribution, lockfile, existing license, guides and CI configuration",
};
const missing = new Set([
  "RMS-TRC-005",
  "RMS-VAL-003",
  "RMS-VAL-004",
  "RMS-MIG-005",
  "RMS-MIG-008",
]);
const partial: Record<string, string> = {
  "RMS-INI-005":
    "Custom relation schemas and advanced declarative gates are not implemented",
  "RMS-PAR-002":
    "Block locations exist; exact YAML-key columns and exhaustive grammar fixtures remain",
  "RMS-AUT-009":
    "Change records accept details, but exact before/after binding and required-change policy are not enforced",
  "RMS-GIT-005":
    "Parent comparisons implemented; history is bounded and UI history navigation is incomplete",
  "RMS-BAS-003":
    "Target validation implemented; configurable baseline eligibility gates remain",
  "RMS-TRC-003":
    "Basic relation matrix; complete status/baseline matrix filtering remains",
  "RMS-TRC-005":
    "Impact record schema exists; exact change-pair acknowledgments do not yet resolve currency",
  "RMS-EVD-006":
    "JUnit and native subset supported; full lossless producer/parameter interoperability remains",
  "RMS-EVD-012":
    "Normative files are bounded; managed evidence attachment selection/copy is not implemented",
  "RMS-RPT-002":
    "Detail includes decisions and links; full history/context/evidence navigation remains",
  "RMS-RPT-003":
    "Inventory exports implemented; dedicated comparison/matrix/gap report templates remain",
  "RMS-RPT-005":
    "Portable captured files/digests included; archive import and independent restore verification remain",
  "RMS-MIG-002":
    "CSV/JSON/simple pipe tables supported; labeled-block and complete native imports remain",
  "RMS-MIG-004":
    "Deterministic staging and guarded source/mapping replay implemented; comprehensive native re-import remains",
  "RMS-SEC-010":
    "Limits and journal recovery exist; cancellation within two seconds and exhaustive fault injection remain",
  "RMS-SEC-012":
    "Dependency inventory/limitations documented; private reporting channel must be selected",
  "RMS-QUA-002":
    "Recoverable replacement implemented; every-phase power-loss evidence across OSes remains",
  "RMS-QUA-003":
    "Explicit guarded recovery implemented; crash/lock edge cases need expanded acceptance evidence",
  "RMS-QUA-006":
    "Golden vectors and line-ending tests exist; cross-platform CI execution evidence remains",
  "RMS-UX-002":
    "Native keyboard controls and responsive styles exist; screen-reader/WCAG audit remains",
  "RMS-DST-001":
    "Existing GPLv3 retained; documentation/format license and final distribution designation remain owner decisions",
  "RMS-DST-002":
    "Source/Node distribution works; signed installers and tested release support matrix remain",
  "RMS-DST-005":
    "Lockfile has dependency integrity; release artifacts/checksums/provenance are not published",
};
const heading = `# Implementation status and SRS traceability\n\nThis is an executable **preview**, not an accepted V1 release. The original SRS is unchanged and all Must requirements remain in scope. No row below is a release acceptance claim.\n\n## Local verification\n\n- Windows 11 x64; Node 22.17.1; npm 11.11.0; Git 2.49.0.windows.1.\n- TypeScript check and production build pass.\n- 28 automated integration/conformance tests pass.\n- Core/server statement coverage is 76.91%; the React UI is checked separately in the browser.\n- npm audit: zero reported vulnerabilities at implementation time.\n- Browser smoke: local authentication, register/detail, Markdown preview, file preview, save, reload, comparison, source-conflict draft preservation, light/dark appearance, and narrow-screen overflow checks. Synthetic demo data only.\n- Multi-OS CI is configured but not executed here. No performance, WCAG, security-certification or release-distribution claim is made.\n\n## Remaining work before V1\n\n1. Advanced declarative policy, narrow expiring waivers, configurable baseline eligibility, and exact revision-pair change/impact decisions.\n2. Ordered migration overlays, labeled-block mappings, complete native interoperability, explicit upgrades, and archive restore.\n3. Full report/matrix filters, history navigation, attachment management, and complete input-location diagnostics.\n4. Performance indexing and the specified 10,000-requirement benchmark; cancellation/progress guarantees and configurable resource limits.\n5. Every-phase fault injection, cross-platform filesystem/object edge cases, full security review, keyboard/screen-reader/WCAG evidence, and final platform support matrix.\n6. Public packaging, signed release provenance/checksums, private vulnerability reporting, governance and final licensing decisions.\n\nThe default discovery tree is requirements/ to avoid treating the source SRS as marked native data. Format/canonicalization are documented preview contracts; freeze only after full conformance review. Some UI workflows use explicit JSON for advanced custom fields/import mappings. No authority or verification status is inferred from imported claims.\n\n## Requirement-level inventory\n\n${ids.length} numbered requirements are tracked. “Preview implementation” means a relevant code path exists and has group-level evidence; it does not mean every clause has a dedicated passing acceptance test.\n\n| Requirement | Status | Evidence or remaining limitation |\n|---|---|---|\n`;
const rows = ids.map((id) => {
  const family = id.split("-")[1];
  const status = missing.has(id)
    ? "Not implemented / incomplete semantics"
    : partial[id]
      ? "Partial"
      : ["PER", "UX", "DST"].includes(family)
        ? "Unverified release obligation"
        : "Preview implementation";
  return `| ${id} | ${status} | ${partial[id] ?? evidence[family]} |`;
});
await writeFile("docs/status.md", heading + rows.join("\n") + "\n");
