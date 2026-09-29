import type {
  Snapshot,
  Requirement,
  DurableRecord,
  Subject,
  Projection,
} from "./model.js";
import { bytesDigest } from "./data.js";

const indexes = new WeakMap<Snapshot, ReturnType<typeof createIndex>>();
function createIndex(s: Snapshot) {
  const requirements = new Map(s.requirements.map((r) => [r.uid, r]));
  const records = new Map(s.records.map((r) => [r.uid, r]));
  const bySubject = new Map<string, DurableRecord[]>();
  const incoming = new Map<string, { type: string; source: string }[]>();
  const superseded = new Set(s.records.flatMap((r) => r.supersedes));
  for (const record of s.records)
    for (const subject of record.subjects) {
      const key = `${record.scope}\0${subject.uid}`;
      const list = bySubject.get(key) ?? [];
      list.push(record);
      bySubject.set(key, list);
    }
  for (const r of s.requirements)
    for (const edge of r.relations) {
      const list = incoming.get(edge.target) ?? [];
      list.push({ type: edge.type, source: r.uid });
      incoming.set(edge.target, list);
    }
  return {
    requirements,
    records,
    bySubject,
    incoming,
    superseded,
    dependencies: new Map<string, Subject[]>(),
    projections: new Map<string, Projection>(),
    text: new Map(
      s.requirements.map((r) => [
        r.uid,
        `${r.qualifiedId} ${r.title} ${r.markdown} ${JSON.stringify(r.metadata)}`.toLowerCase(),
      ]),
    ),
    fileTokens: new Map([...s.files].map(([p, b]) => [p, bytesDigest(b)])),
  };
}
export function index(s: Snapshot) {
  let value = indexes.get(s);
  if (!value) {
    value = createIndex(s);
    indexes.set(s, value);
  }
  return value;
}
