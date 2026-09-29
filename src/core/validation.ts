import { stable } from "./data.js";
import { diagnostic, type Diagnostic, type Snapshot } from "./model.js";

export function validate(s: Snapshot): Diagnostic[] {
  const findings: Diagnostic[] = [];
  const duplicate = (
    items: { id: string; path: string }[],
    category: string,
  ) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id))
        findings.push(
          diagnostic(
            "IDENTITY_DUPLICATE",
            `Duplicate ${category}: ${item.id}`,
            item.path,
          ),
        );
      seen.add(item.id);
    }
  };
  duplicate(
    s.documents.map((d) => ({ id: d.uid, path: d.path })),
    "document UUID",
  );
  duplicate(
    s.requirements.map((r) => ({ id: r.uid, path: r.path })),
    "requirement UUID",
  );
  duplicate(
    s.requirements.flatMap((r) =>
      [
        `${r.specification}:${r.id}`,
        ...(r.metadata.aliases as string[]).map(
          (a) => `${r.specification}:${a}`,
        ),
      ].map((id) => ({ id, path: r.path })),
    ),
    "human ID or alias",
  );
  duplicate(
    s.records.map((r) => ({ id: r.uid, path: r.path ?? "" })),
    "record UUID",
  );
  duplicate(
    s.baselines.map((b) => ({ id: b.name, path: "" })),
    "baseline name",
  );
  duplicate(
    s.baselines.map((b) => ({ id: b.uid, path: "" })),
    "baseline UUID",
  );
  const requirements = new Map(s.requirements.map((r) => [r.uid, r]));
  const records = new Map(s.records.map((r) => [r.uid, r]));
  let edges = 0;
  for (const r of s.requirements) {
    const seen = new Set<string>();
    for (const relation of r.relations) {
      edges++;
      const key = stable(relation);
      if (seen.has(key))
        findings.push(
          diagnostic(
            "RELATION_DUPLICATE",
            `Duplicate ${relation.type} edge to ${relation.target}`,
            r.path,
            r.line,
            r.uid,
          ),
        );
      seen.add(key);
      if (relation.type === "implemented_by") {
        if (!/^(https?:\/\/|git:|path:)/.test(relation.target))
          findings.push(
            diagnostic(
              "RELATION_TARGET_TYPE",
              "Implementation reference must use https/http, git:, or path:.",
              r.path,
              r.line,
              r.uid,
            ),
          );
      } else if (relation.type === "verified_by") {
        if (records.get(relation.target)?.kind !== "verification")
          findings.push(
            diagnostic(
              "RELATION_TARGET_TYPE",
              `Missing verification definition ${relation.target}`,
              r.path,
              r.line,
              r.uid,
            ),
          );
      } else {
        if (!requirements.has(relation.target))
          findings.push(
            diagnostic(
              "RELATION_MISSING",
              `Missing target ${relation.target}`,
              r.path,
              r.line,
              r.uid,
            ),
          );
        if (relation.target === r.uid && relation.type !== "related_to")
          findings.push(
            diagnostic(
              "RELATION_SELF",
              "A requirement cannot depend on, refine, or supersede itself.",
              r.path,
              r.line,
              r.uid,
            ),
          );
      }
    }
  }
  for (const type of ["refines", "depends_on", "supersedes"]) {
    const completed = new Set<string>();
    for (const root of requirements.keys()) {
      if (completed.has(root)) continue;
      const active = new Set<string>();
      const stack = [{ uid: root, enter: true }];
      while (stack.length) {
        const node = stack.pop()!;
        if (!node.enter) {
          active.delete(node.uid);
          completed.add(node.uid);
          continue;
        }
        if (active.has(node.uid)) {
          const r = requirements.get(node.uid)!;
          findings.push(
            diagnostic(
              "RELATION_CYCLE",
              `${type} cycle: ${[...active, node.uid].join(" -> ")}`,
              r.path,
              r.line,
              r.uid,
            ),
          );
          continue;
        }
        if (completed.has(node.uid)) continue;
        active.add(node.uid);
        stack.push({ uid: node.uid, enter: false });
        for (const edge of requirements.get(node.uid)?.relations ?? [])
          if (edge.type === type && requirements.has(edge.target))
            stack.push({ uid: edge.target, enter: true });
      }
    }
  }
  for (const r of s.records) {
    for (const subject of r.subjects)
      if (!requirements.has(subject.uid))
        findings.push(
          diagnostic(
            "RECORD_SUBJECT_MISSING",
            `Record references missing requirement ${subject.uid}`,
            r.path,
            1,
            r.uid,
          ),
        );
    for (const id of r.supersedes) {
      const prior = records.get(id);
      if (
        !prior ||
        id === r.uid ||
        prior.kind !== r.kind ||
        prior.scope !== r.scope ||
        prior.category !== r.category ||
        stable(prior.subjects.map((s) => s.uid).sort()) !==
          stable(r.subjects.map((s) => s.uid).sort())
      )
        findings.push(
          diagnostic(
            "RECORD_SUPERSESSION",
            `Invalid supersession of ${id}; subjects, scope, kind and category must match.`,
            r.path,
            1,
            r.uid,
          ),
        );
    }
    for (const id of r.evidence)
      if (records.get(id)?.kind !== "evidence")
        findings.push(
          diagnostic(
            "EVIDENCE_MISSING",
            `Evidence record not found: ${id}`,
            r.path,
            1,
            r.uid,
          ),
        );
    for (const id of r.obligations)
      if (records.get(id)?.kind !== "verification")
        findings.push(
          diagnostic(
            "OBLIGATION_MISSING",
            `Verification obligation not found: ${id}`,
            r.path,
            1,
            r.uid,
          ),
        );
    const visited = new Set<string>();
    const stack = [...r.supersedes];
    while (stack.length) {
      const uid = stack.pop()!;
      if (uid === r.uid) {
        findings.push(
          diagnostic("RECORD_CYCLE", "Supersession cycle.", r.path, 1, r.uid),
        );
        break;
      }
      if (!visited.has(uid)) {
        visited.add(uid);
        stack.push(...(records.get(uid)?.supersedes ?? []));
      }
    }
  }
  if (s.requirements.length > 100000 || edges > 1000000)
    findings.push(
      diagnostic(
        "LIMIT_GRAPH",
        "The graph exceeds 100,000 requirements or 1,000,000 edges.",
      ),
    );
  return findings;
}
