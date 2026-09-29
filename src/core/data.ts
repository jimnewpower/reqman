import { createHash } from "node:crypto";
import { parseDocument, visit, isAlias, isScalar, isCollection } from "yaml";
import { z } from "zod";
import { FILE_LIMIT, Problem, type Json, type ObjectValue } from "./model.js";

export function stable(value: unknown): string {
  if (value === undefined)
    throw new Problem(2, "CANONICAL_VALUE", "Undefined is not canonical JSON.");
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new Problem(
      2,
      "CANONICAL_NUMBER",
      "Canonical data permits only exact safe integers.",
    );
  return JSON.stringify(value);
}
export function digest(value: unknown): string {
  return bytesDigest(Buffer.from(stable(value)));
}
export function bytesDigest(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function utf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Problem(
      2,
      "UTF8_INVALID",
      "Authoritative files must contain valid UTF-8.",
    );
  }
}
export function yaml(text: string): unknown {
  if (Buffer.byteLength(text) > FILE_LIMIT)
    throw new Problem(3, "LIMIT_FILE", "YAML exceeds the 10 MiB file limit.");
  const doc = parseDocument(text, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    prettyErrors: false,
  });
  if (doc.errors.length || doc.warnings.length)
    throw new Problem(
      2,
      "YAML_INVALID",
      [...doc.errors, ...doc.warnings].map((e) => e.message).join("; "),
    );
  visit(doc, (_, node, path) => {
    if (path.length > 128)
      throw new Problem(3, "LIMIT_DEPTH", "YAML nesting exceeds 128.");
    if (
      isAlias(node) ||
      ((isScalar(node) || isCollection(node)) && (node.anchor || node.tag))
    )
      throw new Problem(
        2,
        "YAML_RESTRICTED",
        "YAML aliases, anchors, and explicit tags are forbidden.",
      );
  });
  const result: unknown = doc.toJS({ maxAliasCount: 0, mapAsMap: false });
  checkJson(result);
  return result;
}
function checkJson(value: unknown, depth = 0): void {
  if (depth > 128)
    throw new Problem(3, "LIMIT_DEPTH", "Data nesting exceeds 128.");
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new Problem(
      2,
      "SCHEMA_NUMBER",
      "Use strings for numeric measurements and durations; integer metadata must be safe integers.",
    );
  if (value && typeof value === "object")
    for (const child of Object.values(value)) checkJson(child, depth + 1);
}
export function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Problem(2, "SCHEMA_OBJECT", "Expected a mapping.");
  return value as ObjectValue;
}
export function readSchema<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Problem(
      2,
      "SCHEMA_INVALID",
      result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    );
  return result.data;
}
export const uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "Expected a canonical lowercase UUID",
  );
export const label = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "Expected a portable ASCII label");
export const nonempty = z.string().trim().min(1);
export const jsonValue: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().int().safe(),
    z.string(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
);
export const extensionSchema = z
  .record(jsonValue)
  .default({})
  .refine(
    (m) => Object.keys(m).every((k) => k.includes(":") || k.includes(".")),
    "Extension owners must be namespaced",
  );
export const relativePath = z
  .string()
  .min(1)
  .refine(
    (p) =>
      !p.includes("\\") &&
      !p.startsWith("/") &&
      !p.includes(":") &&
      !p.split("/").some((s) => s === ".." || s === "." || !s) &&
      !p.split("/").some((s) => /^\.git$/i.test(s)),
    "Expected a repository-relative path without traversal or .git",
  );
export function setOf<T>(values: T[]): T[] {
  return [...new Map(values.map((v) => [stable(v), v])).values()].sort(
    (a, b) => (stable(a) < stable(b) ? -1 : 1),
  );
}
export function html(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
