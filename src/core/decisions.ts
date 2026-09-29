import { digest, stable } from "./data.js";
import {
  C14N,
  Problem,
  subject,
  type DurableRecord,
  type Projection,
  type Requirement,
  type Snapshot,
  type Subject,
} from "./model.js";

export function dependencies(
  snapshot: Snapshot,
  requirement: Requirement,
): Subject[] {
  const byId = new Map(snapshot.requirements.map((r) => [r.uid, r]));
  const seen = new Set<string>([requirement.uid]);
  const result: Subject[] = [];
  const pending = [requirement];
  while (pending.length) {
    for (const edge of pending
      .pop()!
      .relations.filter((e) => ["depends_on", "refines"].includes(e.type))) {
      if (seen.has(edge.target)) continue;
      const target = byId.get(edge.target);
      if (!target)
        throw new Problem(
          3,
          "DEPENDENCY_INCOMPLETE",
          `Cannot capture missing dependency ${edge.target}.`,
        );
      seen.add(edge.target);
      result.push(subject(target));
      pending.push(target);
      if (seen.size > 100000)
        throw new Problem(
          3,
          "IMPACT_LIMIT",
          "Dependency capture exceeded its limit; no decision was created.",
        );
    }
  }
  return result.sort((a, b) => (a.uid < b.uid ? -1 : 1));
}
export function currency(
  s: Snapshot,
  record: DurableRecord,
  r: Requirement,
  artifact?: { repository: string; revision: string },
): Projection["currency"] {
  const bound = record.subjects.find((sub) => sub.uid === r.uid);
  if (!bound || bound.canonicalization !== C14N) return "unknown";
  if (bound.definition !== r.definition || bound.governance !== r.governance)
    return "needs_review";
  let expected: Subject[];
  try {
    expected = dependencies(s, r);
  } catch {
    return "unknown";
  }
  const recorded = new Map(record.dependencies.map((d) => [d.uid, d]));
  for (const dep of expected) {
    const prior = recorded.get(dep.uid);
    if (!prior || prior.canonicalization !== C14N) return "unknown";
    if (
      prior.definition !== dep.definition ||
      prior.governance !== dep.governance
    )
      return "needs_review";
  }
  if (record.category === "verification" || record.kind === "evidence") {
    if (!record.artifact || !artifact) return "unknown";
    if (stable(record.artifact) !== stable(artifact)) return "needs_review";
  }
  return "current";
}
export function activeRecords(
  s: Snapshot,
  r: Requirement,
  scope: string,
): DurableRecord[] {
  const records = s.records.filter(
    (rec) =>
      rec.scope === scope && rec.subjects.some((sub) => sub.uid === r.uid),
  );
  const superseded = new Set(records.flatMap((rec) => rec.supersedes));
  return records.filter((rec) => !superseded.has(rec.uid));
}
export function projection(
  s: Snapshot,
  r: Requirement,
  scope = "project",
  artifact?: { repository: string; revision: string },
): Projection {
  const current = activeRecords(s, r, scope);
  const records = s.records
    .filter(
      (rec) =>
        rec.scope === scope && rec.subjects.some((sub) => sub.uid === r.uid),
    )
    .map((rec) => ({ ...rec, currency: currency(s, rec, r, artifact) }));
  const usable = current.filter(
    (rec) => currency(s, rec, r, artifact) === "current",
  );
  const reviews = usable.filter((rec) => rec.kind === "review");
  // Revocations remain effective across matching-text reverts until explicitly superseded.
  const revocations = current.filter(
    (rec) => rec.kind === "review" && rec.decision === "revoked",
  );
  const decisions = new Set(
    [...reviews, ...revocations].map((rec) => rec.decision),
  );
  let approval =
    decisions.size > 1
      ? "conflicted"
      : decisions.size === 1
        ? [...decisions][0]!
        : "unreviewed";
  if (approval === "revoked") approval = "unreviewed";
  if (approval === "approved") {
    const policy = s.config.policy.approval;
    const distinct = new Set(reviews.map((rec) => rec.actor));
    if (
      distinct.size < policy.minimum_reviews ||
      policy.roles.some((role) => !reviews.some((rec) => rec.role === role)) ||
      (policy.require_distinct_author &&
        (!r.metadata.author ||
          reviews.some((rec) => rec.actor === r.metadata.author)))
    )
      approval = "unreviewed";
  }
  const assessment = (category: string) => {
    const choices = new Set(
      current
        .filter((rec) => rec.kind === "assessment" && rec.category === category)
        .map((rec) => rec.decision),
    );
    return choices.size > 1
      ? "conflicted"
      : choices.size === 1
        ? [...choices][0]!
        : "not_assessed";
  };
  let verification = assessment("verification");
  const selected = current.filter(
    (rec) =>
      rec.kind === "assessment" &&
      rec.category === "verification" &&
      rec.decision === "passed",
  );
  for (const claim of selected)
    if (
      s.records.some(
        (rec) =>
          rec.kind === "evidence" &&
          ["failed", "blocked", "inconclusive", "skipped"].includes(
            rec.result ?? "",
          ) &&
          rec.scope === scope &&
          stable(rec.artifact ?? null) === stable(claim.artifact ?? null) &&
          rec.obligations.some((o) => claim.obligations.includes(o)) &&
          !s.records.some((other) => other.supersedes.includes(rec.uid)),
      )
    )
      verification = "conflicted";
  const currencies = current
    .filter((rec) => ["review", "assessment"].includes(rec.kind))
    .map((rec) => currency(s, rec, r, artifact));
  const status = currencies.includes("needs_review")
    ? "needs_review"
    : currencies.length === 0 || currencies.includes("unknown")
      ? "unknown"
      : "current";
  return {
    approval,
    implementation: assessment("implementation"),
    verification,
    currency: status,
    records,
  };
}
export function assertPassing(s: Snapshot, record: DurableRecord): void {
  if (
    record.kind !== "assessment" ||
    record.category !== "verification" ||
    record.decision !== "passed"
  )
    return;
  if (!record.artifact)
    throw new Problem(
      2,
      "ARTIFACT_REQUIRED",
      "Passing verification requires an evaluated artifact identity.",
    );
  for (const bound of record.subjects) {
    const r = s.requirements.find((r) => r.uid === bound.uid)!;
    const required = r.relations
      .filter((e) => e.type === "verified_by")
      .map((e) => e.target);
    if (
      !required.length ||
      required.some((id) => !record.obligations.includes(id))
    )
      throw new Problem(
        1,
        "VERIFICATION_INCOMPLETE",
        `${r.qualifiedId} needs all declared verification obligations.`,
      );
    for (const id of required) {
      const evidence = s.records.filter(
        (e) =>
          record.evidence.includes(e.uid) &&
          e.kind === "evidence" &&
          e.scope === record.scope &&
          e.obligations.includes(id) &&
          e.subjects.some((sub) => sub.uid === r.uid),
      );
      if (
        !evidence.length ||
        evidence.some(
          (e) =>
            e.result !== "passed" ||
            currency(s, e, r, record.artifact) !== "current",
        )
      )
        throw new Problem(
          1,
          "VERIFICATION_INCOMPLETE",
          `Obligation ${id} lacks accepted current passing evidence.`,
        );
      const contrary = activeRecords(s, r, record.scope).filter(
        (e) =>
          e.kind === "evidence" &&
          e.obligations.includes(id) &&
          stable(e.artifact ?? null) === stable(record.artifact) &&
          e.result !== "passed",
      );
      if (contrary.length)
        throw new Problem(
          4,
          "EVIDENCE_CONFLICT",
          `Obligation ${id} has contrary evidence that must be reconciled.`,
        );
    }
  }
}
export function summary(
  s: Snapshot,
  scope = "project",
  artifact?: { repository: string; revision: string },
) {
  const selected = s.requirements.filter(
    (r) => r.disposition === "in_scope" && r.lifecycle !== "retired",
  );
  const rows = selected.map((r) => projection(s, r, scope, artifact));
  return {
    scope,
    artifact: artifact ?? null,
    denominator: selected.length,
    total: s.requirements.length,
    exclusions: s.requirements.length - selected.length,
    approved: rows.filter((p) => p.approval === "approved").length,
    implemented: rows.filter(
      (p) => p.implementation === "implemented" && p.currency === "current",
    ).length,
    verified: rows.filter(
      (p) => p.verification === "passed" && p.currency === "current",
    ).length,
    stale: rows.filter((p) => p.currency === "needs_review").length,
    unknown: rows.filter((p) => p.currency === "unknown").length,
    conflicted: rows.filter((p) =>
      [p.approval, p.implementation, p.verification].includes("conflicted"),
    ).length,
  };
}
