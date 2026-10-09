export const TOOL_VERSION = "0.1.0-preview";
export const C14N = "rms-c14n-1";
export const FILE_LIMIT = 10 * 1024 * 1024;
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type ObjectValue = { [key: string]: Json };

export class Problem extends Error {
  location?: { line: number; column: number };
  inputPath?: (string | number)[];
  file?: string;
  subject?: string;
  constructor(
    public exitCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  file: string;
  line: number;
  column: number;
  subject?: string;
  message: string;
  remediation: string;
  waiver?: { uid: string; reason: string; issuer: string; expires_at?: string };
}
export function diagnostic(
  code: string,
  message: string,
  file = "",
  line = 1,
  subject?: string,
): Diagnostic {
  return {
    code,
    severity: "error",
    file,
    line,
    column: 1,
    subject,
    message,
    remediation: "Correct the source and run validate again.",
  };
}
export interface Fingerprints {
  definition: string;
  governance: string;
  record: string;
}
export interface Subject extends Omit<Fingerprints, "record"> {
  uid: string;
  canonicalization: string;
}
export interface Relation {
  type: string;
  target: string;
}
export interface Requirement extends Fingerprints {
  uid: string;
  id: string;
  qualifiedId: string;
  document: string;
  specification: string;
  title: string;
  path: string;
  line: number;
  start: number;
  end: number;
  markdown: string;
  raw: string;
  metadata: ObjectValue;
  relations: Relation[];
  lifecycle: string;
  disposition: string;
}
export interface Document {
  uid: string;
  specification: string;
  title: string;
  path: string;
  context: string;
  metadata: ObjectValue;
  contextDigest: string;
  requirements: Requirement[];
}
export interface SnapshotInfo {
  ref: string;
  objectId: string | null;
  captureId: string;
  project: string;
  dirty: boolean;
  configDigest: string;
  canonicalization: string;
  repository: string;
  mode: "committed" | "working";
  captureKind?: "full" | "incremental";
  evaluatedAt?: string;
}
export interface Snapshot {
  selection?: string[];
  info: SnapshotInfo;
  config: Config;
  files: Map<string, Buffer>;
  documents: Document[];
  requirements: Requirement[];
  records: DurableRecord[];
  baselines: Baseline[];
  diagnostics: Diagnostic[];
}
export function selectedRequirements(s: Snapshot): Requirement[] {
  if (!s.selection) return s.requirements;
  const selected = new Set(s.selection);
  return s.requirements.filter((r) => selected.has(r.uid));
}
export interface Field {
  type: string;
  values?: string[];
  required?: boolean;
  change_class: "content" | "scope" | "administrative";
}
export interface Config {
  format_version: 1;
  project: { uid: string; name: string };
  documents: { include: string[]; exclude: string[] };
  records_root: string;
  authentication?: {
    enabled: boolean;
    session_hours: number;
    users: {
      username: string;
      display_name?: string;
      password_hash: string;
      roles: string[];
      disabled: boolean;
    }[];
  };
  specifications: {
    uid: string;
    code: string;
    title: string;
    version_label?: string;
  }[];
  fields: Record<string, Field>;
  policy: {
    approval: {
      minimum_reviews: number;
      require_distinct_author: boolean;
      roles: string[];
    };
    removal: "require_retirement";
    unknown_fields: "error";
    review_impact: "conservative";
    require_rationale: boolean;
    require_acceptance: boolean;
    require_change_record: boolean;
    validation: {
      rules: {
        code: string;
        severity: "error" | "warning" | "off";
        field?: string;
        specification?: string;
        lifecycle?: string;
        disposition?: string;
      }[];
      waivers: {
        uid: string;
        rule: string;
        subject: string;
        reason: string;
        issuer: string;
        expires_at?: string;
      }[];
    };
    baseline: {
      approval: boolean;
      implementation: boolean;
      verification: boolean;
      currency: boolean;
    };
  };
  extensions: ObjectValue;
}
export interface DurableRecord {
  format_version: 1;
  uid: string;
  kind:
    "review" | "assessment" | "evidence" | "change" | "verification" | "impact";
  created_at: string;
  actor: string;
  subjects: Subject[];
  dependencies: Subject[];
  scope: string;
  rationale: string;
  decision?: string;
  category?: "implementation" | "verification";
  supersedes: string[];
  role?: string;
  artifact?: { repository: string; revision: string };
  evidence: string[];
  obligations: string[];
  result?: string;
  method?: string;
  run_id?: string;
  source_digest?: string;
  producer?: string;
  location?: string;
  test_key?: string;
  duration?: number;
  details?: ObjectValue;
  changes?: { before: Subject | null; after: Subject | null }[];
  relation_paths?: string[][];
  work_references?: string[];
  attachments?: { path: string; sha256: string; size: number }[];
  title?: string;
  snapshot?: SnapshotInfo;
  provenance: string;
  path?: string;
}
export interface Baseline {
  format_version: 1;
  uid: string;
  name: string;
  project: string;
  target: string;
  object_format: string;
  created_at: string;
  actor: string;
  description: string;
  config_digest: string;
  canonicalization: string;
  selection: Subject[];
  supersedes?: string;
}
export interface Projection {
  approval: string;
  implementation: string;
  verification: string;
  currency: "current" | "needs_review" | "unknown";
  records: (DurableRecord & { currency: string })[];
}
export function subject(r: Requirement): Subject {
  return {
    uid: r.uid,
    definition: r.definition,
    governance: r.governance,
    canonicalization: C14N,
  };
}
export function resolve(snapshot: Snapshot, ref: string): Requirement {
  const matches = snapshot.requirements.filter(
    (r) =>
      r.uid === ref ||
      r.id === ref ||
      r.qualifiedId === ref ||
      (r.metadata.aliases as string[]).includes(ref),
  );
  if (matches.length !== 1)
    throw new Problem(
      2,
      "IDENTITY_RESOLUTION",
      `Reference ${ref} resolves to ${matches.length} requirements; use a UUID or qualified ID.`,
    );
  return matches[0];
}
export function requireValid(snapshot: Snapshot, structuralOnly = false): void {
  if (
    snapshot.diagnostics.some(
      (d) =>
        d.severity === "error" &&
        !d.waiver &&
        (!structuralOnly || !d.code.startsWith("POLICY_")),
    )
  )
    throw new Problem(
      1,
      "SNAPSHOT_INVALID",
      "Resolve validation findings before writing or creating decisions.",
    );
}
