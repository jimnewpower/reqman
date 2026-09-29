import { Problem, type ObjectValue } from "./model.js";
import { object } from "./data.js";

export function labeledBlocks(
  text: string,
  mapping: ObjectValue,
): Record<string, string>[] {
  const marker = String(mapping.block_start ?? "Requirement:");
  if (!marker.trim())
    throw new Problem(
      2,
      "MIGRATION_MAPPING",
      "block_start must be a nonempty literal prefix.",
    );
  const rows: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  let field = "";
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (line.startsWith(marker)) {
      current = {
        id: line.slice(marker.length).trim(),
        source_line: String(i + 1),
      };
      rows.push(current);
      field = "";
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    const key = colon > 0 ? line.slice(0, colon).trim() : "";
    const labels = object(
      mapping.labels ?? { Title: "title", Statement: "statement" },
    );
    if (key in labels) {
      field = String(labels[key]);
      if (field in current)
        throw new Problem(
          4,
          "MIGRATION_CONFLICT",
          `Duplicate label ${key} at line ${i + 1}.`,
        );
      current[field] = line.slice(colon + 1).trim();
    } else if (field) current[field] += `\n${line}`;
  }
  for (const row of rows)
    for (const key of Object.keys(row)) row[key] = row[key].trim();
  if (!rows.length)
    throw new Problem(
      2,
      "MIGRATION_BLOCKS",
      "No blocks matched the declared literal prefix.",
    );
  return rows;
}

export function orderedOverlays(value: unknown, mapping: ObjectValue) {
  const source = object(value);
  const layers = object(source.layers);
  const order = mapping.order;
  if (
    !Array.isArray(order) ||
    !order.length ||
    order.some((n) => typeof n !== "string") ||
    new Set(order).size !== order.length ||
    Object.keys(layers).some((k) => !order.includes(k))
  )
    throw new Problem(
      2,
      "MIGRATION_ORDER",
      "Declare every source layer exactly once in mapping.order.",
    );
  const idField = String(mapping.id ?? "id");
  const overrides = new Set(
    Array.isArray(mapping.overrides) ? mapping.overrides.map(String) : [],
  );
  const merged = new Map<string, Record<string, string>>();
  const provenance: Record<string, Record<string, string>> = {};
  const conflicts: {
    id: string;
    field: string;
    prior: string;
    next: string;
    layer: string;
  }[] = [];
  for (const name of order.map(String)) {
    if (!Array.isArray(layers[name]))
      throw new Problem(
        2,
        "MIGRATION_LAYER",
        `Layer ${name} must contain a row array.`,
      );
    const seen = new Set<string>();
    for (const raw of layers[name] as unknown[]) {
      const row = object(raw);
      const id = String(row[idField] ?? "");
      if (!id || seen.has(id))
        throw new Problem(
          4,
          "MIGRATION_AMBIGUOUS",
          `Missing or duplicate ${idField} in layer ${name}.`,
        );
      seen.add(id);
      const prior = merged.get(id) ?? {};
      provenance[id] ??= {};
      for (const [field, raw] of Object.entries(row)) {
        if (typeof raw !== "string")
          throw new Problem(
            2,
            "MIGRATION_FIELD",
            `${name}/${id}/${field} must be text.`,
          );
        if (field in prior && prior[field] !== raw && !overrides.has(field)) {
          conflicts.push({
            id,
            field,
            prior: prior[field],
            next: raw,
            layer: name,
          });
          continue;
        }
        prior[field] = raw;
        provenance[id][field] = name;
      }
      merged.set(id, prior);
    }
  }
  return { rows: [...merged.values()], provenance, conflicts };
}
