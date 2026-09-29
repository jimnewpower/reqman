import { digest, stable } from "./data.js";
import {
  subject,
  selectedRequirements,
  type Snapshot,
  type Requirement,
} from "./model.js";
import { limits } from "./operations.js";

export interface Change {
  uid: string;
  label: string;
  classes: string[];
  before: Requirement | null;
  after: Requirement | null;
  fields: string[];
}
export function compare(base: Snapshot, head: Snapshot) {
  const before = new Map(selectedRequirements(base).map((r) => [r.uid, r]));
  const after = new Map(selectedRequirements(head).map((r) => [r.uid, r]));
  const changes: Change[] = [];
  for (const uid of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const a = before.get(uid);
    const b = after.get(uid);
    const classes: string[] = [];
    const fields: string[] = [];
    if (!a) classes.push("addition");
    else if (!b) classes.push("removal");
    else {
      if (a.definition !== b.definition) classes.push("definition");
      if (a.governance !== b.governance) {
        const ad = base.documents.find((d) => d.uid === a.document);
        const bd = head.documents.find((d) => d.uid === b.document);
        classes.push(
          ad?.contextDigest !== bd?.contextDigest ||
            digest(base.config.policy) !== digest(head.config.policy)
            ? "governing_context"
            : "scope_governance",
        );
      }
      if (stable(a.relations) !== stable(b.relations))
        classes.push("relationship");
      if (a.path !== b.path || a.document !== b.document) classes.push("move");
      if (
        a.id !== b.id ||
        (a.record !== b.record &&
          a.definition === b.definition &&
          a.governance === b.governance)
      )
        classes.push("administrative");
      if (a.lifecycle !== "retired" && b.lifecycle === "retired")
        classes.push("retirement");
      if (!classes.length && a.raw !== b.raw) classes.push("presentation");
      for (const key of new Set([
        ...Object.keys(a.metadata),
        ...Object.keys(b.metadata),
      ]))
        if (stable(a.metadata[key] ?? null) !== stable(b.metadata[key] ?? null))
          fields.push(key);
      if (a.markdown !== b.markdown) fields.push("markdown");
    }
    if (classes.length)
      changes.push({
        uid,
        label: (b ?? a)!.qualifiedId,
        classes,
        before: a ?? null,
        after: b ?? null,
        fields,
      });
  }
  const baseRecords = new Map(base.records.map((r) => [r.uid, r]));
  const headRecords = new Map(head.records.map((r) => [r.uid, r]));
  const alteredRecords = base.records
    .filter((r) => {
      const other = headRecords.get(r.uid);
      return (
        !other ||
        digest({ ...r, path: undefined }) !==
          digest({ ...other, path: undefined })
      );
    })
    .map((r) => r.uid);
  return {
    mode: "endpoints",
    base: base.info,
    head: head.info,
    configurationChanged: digest(base.config) !== digest(head.config),
    changes,
    alteredRecords,
    recordsAdded: head.records
      .filter((r) => !baseRecords.has(r.uid))
      .map((r) => r.uid),
    removals: changes
      .filter((c) => c.classes.includes("removal"))
      .map((c) => c.uid),
  };
}
export function impact(base: Snapshot, head: Snapshot, scope = "project") {
  const diff = compare(base, head);
  const causes = diff.changes.filter((c) =>
    c.classes.some((cls) =>
      [
        "definition",
        "governing_context",
        "scope_governance",
        "relationship",
        "removal",
      ].includes(cls),
    ),
  );
  const results: {
    uid: string;
    trigger: string;
    path: string[];
    before: string | null;
    after: string | null;
    changes: {
      before: ReturnType<typeof subject> | null;
      after: ReturnType<typeof subject> | null;
    }[];
    resolution: string;
    decisions: string[];
  }[] = [];
  const all = [...base.requirements, ...head.requirements];
  const reverse = new Map<string, Set<string>>();
  const currentRequirements = new Map(head.requirements.map((r) => [r.uid, r]));
  const superseded = new Set(head.records.flatMap((item) => item.supersedes));
  const impactRecords = head.records.filter(
    (item) =>
      item.kind === "impact" &&
      item.scope === scope &&
      !superseded.has(item.uid),
  );
  for (const r of all)
    for (const edge of r.relations)
      if (["refines", "depends_on"].includes(edge.type)) {
        const dependents = reverse.get(edge.target) ?? new Set<string>();
        dependents.add(r.uid);
        reverse.set(edge.target, dependents);
      }
  for (const cause of causes) {
    const seen = new Set([cause.uid]);
    const queue = [[cause.uid]];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const path = queue[cursor];
      const target = path.at(-1)!;
      for (const uid of reverse.get(target) ?? [])
        if (!seen.has(uid)) {
          seen.add(uid);
          const next = [...path, uid];
          queue.push(next);
          const pair = {
            before: cause.before ? subject(cause.before) : null,
            after: cause.after ? subject(cause.after) : null,
          };
          const current = currentRequirements.get(uid);
          const decisions = impactRecords.filter(
            (item) =>
              current &&
              item.subjects.some(
                (sub) => stable(sub) === stable(subject(current)),
              ) &&
              item.changes?.some((change) => stable(change) === stable(pair)),
          );
          const choices = new Set(decisions.map((item) => item.decision));
          results.push({
            uid,
            trigger: cause.uid,
            path: next,
            before: cause.before?.record ?? null,
            after: cause.after?.record ?? null,
            changes: [pair],
            resolution:
              choices.size > 1
                ? "conflicted"
                : choices.size === 1
                  ? [...choices][0]!
                  : "unresolved",
            decisions: decisions.map((item) => item.uid),
          });
          if (results.length >= limits().impacts)
            return {
              complete: false,
              truncated: true,
              base: base.info,
              head: head.info,
              affected: results,
            };
        }
    }
  }
  return {
    complete: true,
    truncated: false,
    base: base.info,
    head: head.info,
    affected: results,
  };
}
