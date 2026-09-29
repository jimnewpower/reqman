import {
  diagnostic,
  type Diagnostic,
  type Snapshot,
  type Requirement,
} from "./model.js";
import { projection } from "./decisions.js";

export function policyFindings(s: Snapshot): Diagnostic[] {
  const findings: Diagnostic[] = [];
  const evaluatedAt = s.info.evaluatedAt ?? new Date().toISOString();
  for (const rule of s.config.policy.validation.rules) {
    if (rule.severity === "off") continue;
    for (const r of s.requirements) {
      if (
        rule.specification &&
        rule.specification !== r.specification &&
        !r.qualifiedId.startsWith(`${rule.specification}:`)
      )
        continue;
      if (rule.lifecycle && rule.lifecycle !== r.lifecycle) continue;
      if (rule.disposition && rule.disposition !== r.disposition) continue;
      const missing =
        rule.code === "POLICY_OWNER"
          ? !r.metadata.owner
          : rule.code === "POLICY_TAGS"
            ? !(r.metadata.tags as string[]).length
            : rule.code === "POLICY_FIELD"
              ? (r.metadata.fields as Record<string, unknown>)[rule.field!] ===
                undefined
              : rule.code === "POLICY_VERIFICATION"
                ? !r.relations.some((e) => e.type === "verified_by")
                : rule.code === "POLICY_IMPLEMENTATION"
                  ? !r.relations.some((e) => e.type === "implemented_by")
                  : projection(s, r).approval !== "approved";
      if (!missing) continue;
      const finding = diagnostic(
        rule.code,
        `${r.qualifiedId} does not satisfy ${rule.code}${rule.field ? ` (${rule.field})` : ""}.`,
        r.path,
        r.line,
        r.uid,
      );
      finding.severity = rule.severity;
      finding.remediation =
        "Satisfy the declared rule or record a narrow, reasoned waiver in policy.validation.waivers.";
      const waiver = s.config.policy.validation.waivers.find(
        (w) =>
          w.rule === rule.code &&
          w.subject === r.uid &&
          (!w.expires_at || Date.parse(w.expires_at) > Date.parse(evaluatedAt)),
      );
      if (waiver)
        finding.waiver = {
          uid: waiver.uid,
          reason: waiver.reason,
          issuer: waiver.issuer,
          ...(waiver.expires_at ? { expires_at: waiver.expires_at } : {}),
        };
      findings.push(finding);
    }
  }
  return findings;
}

export function baselineEligibility(
  s: Snapshot,
  requirements: Requirement[],
  scope = "project",
  artifact?: { repository: string; revision: string },
): Diagnostic[] {
  const gates = s.config.policy.baseline;
  return requirements.flatMap((r) => {
    if (r.lifecycle === "retired" || r.disposition !== "in_scope") return [];
    const state = projection(s, r, scope, artifact);
    const failures = [
      gates.approval && state.approval !== "approved" && "approval",
      gates.implementation &&
        state.implementation !== "implemented" &&
        "implementation",
      gates.verification && state.verification !== "passed" && "verification",
      (gates.currency || gates.implementation || gates.verification) &&
        state.currency !== "current" &&
        "currency",
    ].filter(Boolean);
    return failures.length
      ? [
          diagnostic(
            "BASELINE_INELIGIBLE",
            `${r.qualifiedId} fails baseline gates: ${failures.join(", ")}.`,
            r.path,
            r.line,
            r.uid,
          ),
        ]
      : [];
  });
}
