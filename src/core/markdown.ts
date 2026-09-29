import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, RootContent, Heading, Definition } from "mdast";
import type { Node, Parent } from "unist";
import { stringify } from "yaml";
import {
  bytesDigest,
  digest,
  object,
  readSchema,
  setOf,
  yaml,
  locateYaml,
} from "./data.js";
import { documentSchema, requirementSchema } from "./schema.js";
import type { z } from "zod";
import { limits } from "./operations.js";
import {
  C14N,
  FILE_LIMIT,
  Problem,
  type Config,
  type Document,
  type ObjectValue,
  type Requirement,
} from "./model.js";

const parser = unified().use(remarkParse);
export function tree(text: string): Root {
  if (Buffer.byteLength(text) > limits().fileBytes)
    throw new Problem(
      3,
      "LIMIT_FILE",
      `Markdown exceeds ${limits().fileBytes} bytes. Use --max-file-mib for an explicit override.`,
    );
  const root = parser.parse(text);
  const pending: [Node, number][] = [[root, 0]];
  while (pending.length) {
    const [node, depth] = pending.pop()!;
    if (depth > limits().depth)
      throw new Problem(
        3,
        "LIMIT_DEPTH",
        `Markdown nesting exceeds ${limits().depth}. Use --max-depth for an explicit override.`,
      );
    if ("children" in node)
      pending.push(
        ...(node as Parent).children.map(
          (n) => [n, depth + 1] as [Node, number],
        ),
      );
  }
  return root;
}
function textOf(node: Node): string {
  if ("value" in node) return String(node.value);
  return "children" in node
    ? (node as Parent).children.map(textOf).join("")
    : "";
}
function referenceDefinitions(root: Node): Definition[] {
  const result: Definition[] = [];
  const pending: Node[] = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === "definition") result.push(node as Definition);
    if ("children" in node)
      pending.push(...[...(node as Parent).children].reverse());
  }
  return result;
}
// This explicit tree contract deliberately excludes parser locations and implementation data.
export function canonicalMarkdown(
  text: string,
  relativeHeading = false,
  references: Definition[] = [],
  parsed?: Root,
): unknown {
  const root = parsed ?? tree(text);
  const definitions = new Map<string, Definition>();
  for (const definition of [...references, ...referenceDefinitions(root)]) {
    const key = definition.identifier.toLowerCase();
    if (!definitions.has(key)) definitions.set(key, definition);
  }
  const title = root.children.find((n): n is Heading => n.type === "heading");
  const normalize = (node: Node): unknown => {
    const n = node as Node & Record<string, unknown>;
    if (n.type === "definition") return null;
    const result: Record<string, unknown> = { type: n.type };
    if (n.type === "text")
      result.value = (n.value as string).replace(/\r?\n/g, " ");
    else if ("value" in n) result.value = n.value;
    for (const key of [
      "lang",
      "meta",
      "url",
      "title",
      "alt",
      "ordered",
      "start",
      "checked",
      "align",
    ])
      if (key in n) result[key] = n[key] ?? null;
    if (n.type === "heading")
      result.depth =
        Number(n.depth) - (relativeHeading ? (title?.depth ?? 0) : 0);
    if (n.type === "list" || n.type === "listItem")
      result.spread = Boolean(n.spread);
    if (n.type === "linkReference" || n.type === "imageReference") {
      const def = definitions.get(String(n.identifier).toLowerCase());
      result.type = n.type === "linkReference" ? "link" : "image";
      result.url = def?.url ?? `unresolved:${n.identifier}`;
      result.title = def?.title ?? null;
    }
    if ("children" in n)
      result.children = (n.children as Node[])
        .map(normalize)
        .filter((v) => v !== null);
    return result;
  };
  return normalize(root);
}
interface Marker {
  kind: "document" | "start" | "end";
  start: number;
  end: number;
  line: number;
  metadata?: unknown;
  yamlSource?: string;
}
function markers(root: Root): Marker[] {
  const result: Marker[] = [];
  for (const n of root.children) {
    if (n.type !== "html" || n.position?.start.column !== 1) continue;
    const match =
      /^(<!-- rms-document|<!-- rms-requirement)\r?\n([\s\S]*?)\r?\n-->\s*$/.exec(
        n.value,
      );
    if (match) {
      let metadata: unknown;
      try {
        metadata = yaml(match[2]);
      } catch (error) {
        if (error instanceof Problem) {
          error.location = {
            line: (error.location?.line ?? 1) + n.position.start.line,
            column: error.location?.column ?? 1,
          };
        }
        throw error;
      }
      result.push({
        kind: match[1].endsWith("document") ? "document" : "start",
        start: n.position.start.offset!,
        end: n.position.end.offset!,
        line: n.position.start.line,
        metadata,
        yamlSource: match[2],
      });
    } else if (n.value.trim() === "<!-- /rms-requirement -->")
      result.push({
        kind: "end",
        start: n.position.start.offset!,
        end: n.position.end.offset!,
        line: n.position.start.line,
      });
    else if (/^<!--\s*\/?rms-(document|requirement)\b/.test(n.value))
      throw new Problem(
        2,
        "BLOCK_MARKER",
        `Malformed marker at line ${n.position.start.line}. Markers must occupy their own unindented lines.`,
      );
  }
  return result;
}
function markerSchema<T extends z.ZodTypeAny>(
  schema: T,
  marker: Marker,
): z.output<T> {
  try {
    return readSchema(schema, marker.metadata);
  } catch (error) {
    if (error instanceof Problem) {
      locateYaml(marker.yamlSource ?? "", error);
      error.location!.line += marker.line;
      const metadata = marker.metadata as { uid?: string };
      error.subject = metadata?.uid;
    }
    throw error;
  }
}
export function normativePaths(source: string): string[] {
  return prepareDocument(source).paths;
}
export function prepareDocument(source: string) {
  const root = tree(source.replace(/^\ufeff/, ""));
  const parsed = markers(root);
  const result: string[] = [];
  for (const marker of parsed) {
    if (marker.kind === "end") continue;
    const metadata =
      marker.kind === "document"
        ? markerSchema(documentSchema, marker)
        : markerSchema(requirementSchema, marker);
    result.push(...metadata.normative_files);
  }
  return { root, markers: parsed, paths: setOf(result) };
}
function attachmentDigests(
  paths: string[],
  files: Map<string, Buffer>,
): unknown {
  return setOf(paths).map((path) => {
    const bytes = files.get(path);
    if (!bytes)
      throw new Problem(
        3,
        "NORMATIVE_MISSING",
        `Normative dependency is unavailable: ${path}`,
      );
    if (
      bytes
        .toString("utf8", 0, 80)
        .startsWith("version https://git-lfs.github.com/spec/")
    )
      throw new Problem(
        3,
        "LFS_UNAVAILABLE",
        `Normative file is an unresolved LFS pointer: ${path}`,
      );
    return { path, digest: bytesDigest(bytes) };
  });
}
function checkFields(
  metadata: ReturnType<typeof requirementSchema.parse>,
  config: Config,
): void {
  for (const name of Object.keys(metadata.fields))
    if (!(name in config.fields))
      throw new Problem(2, "FIELD_UNKNOWN", `Undeclared custom field: ${name}`);
  for (const [name, schema] of Object.entries(config.fields)) {
    const value = metadata.fields[name];
    if (value === undefined) {
      if (schema.required)
        throw new Problem(
          2,
          "FIELD_REQUIRED",
          `Required custom field: ${name}`,
        );
      continue;
    }
    const list = schema.type.endsWith("[]");
    if (list && !Array.isArray(value))
      throw new Problem(2, "FIELD_TYPE", `${name} must be a list.`);
    const type = schema.type.replace("[]", "");
    for (const v of list ? (value as unknown[]) : [value]) {
      const valid =
        type === "integer"
          ? Number.isSafeInteger(v)
          : type === "enum"
            ? schema.values!.includes(String(v)) && typeof v === "string"
            : type === "date"
              ? typeof v === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(v) &&
                !Number.isNaN(Date.parse(v))
              : typeof v === type;
      if (!valid)
        throw new Problem(
          2,
          "FIELD_TYPE",
          `Invalid ${schema.type} field: ${name}`,
        );
    }
  }
}
function bodyTitle(markdown: string, config: Config, parsed?: Root): string {
  const nodes = (parsed ?? tree(markdown)).children;
  const firstHeading = nodes.find((n): n is Heading => n.type === "heading");
  if (!firstHeading || !textOf(firstHeading).trim())
    throw new Problem(
      2,
      "BODY_TITLE",
      "Requirement needs a nonempty title heading.",
    );
  const sections = new Map<string, RootContent[]>();
  let current = "";
  for (const n of nodes.slice(nodes.indexOf(firstHeading) + 1)) {
    if (
      n.type === "heading" &&
      n.depth === firstHeading.depth + 1 &&
      ["Statement", "Rationale", "Acceptance criteria"].includes(textOf(n))
    ) {
      current = textOf(n);
      if (sections.has(current))
        throw new Problem(
          2,
          "BODY_SECTION_DUPLICATE",
          `Duplicate ${current} section.`,
        );
      sections.set(current, []);
    } else if (current) sections.get(current)!.push(n);
  }
  for (const name of [
    "Statement",
    ...(config.policy.require_rationale ? ["Rationale"] : []),
    ...(config.policy.require_acceptance ? ["Acceptance criteria"] : []),
  ]) {
    if (!sections.get(name)?.some((n) => textOf(n).trim()))
      throw new Problem(
        2,
        "BODY_SECTION_REQUIRED",
        `A nonempty ${name} section is required one heading level below the title.`,
      );
  }
  return textOf(firstHeading).trim();
}
export function parseDocument(
  path: string,
  source: string,
  config: Config,
  files: Map<string, Buffer>,
  prepared?: { root: Root; markers: Marker[] },
): Document {
  if (/^(?:<<<<<<< |=======\s*$|>>>>>>> )/m.test(source))
    throw new Problem(
      4,
      "GIT_CONFLICT",
      "Unresolved Git conflict markers; resolve them before editing.",
    );
  // Keep a BOM in the original bytes, but outside the parser's line/column interpretation.
  const bom = source.startsWith("\ufeff") ? 1 : 0;
  const root = prepared?.root ?? tree(source.slice(bom));
  const all = (prepared?.markers ?? markers(root)).map((m) => ({
    ...m,
    start: m.start + bom,
    end: m.end + bom,
  }));
  const docs = all.filter((m) => m.kind === "document");
  if (docs.length !== 1 || all[0]?.kind !== "document")
    throw new Problem(
      2,
      "DOCUMENT_METADATA",
      "Exactly one document metadata block must precede requirements.",
    );
  const meta = markerSchema(documentSchema, docs[0]);
  const spec = config.specifications.find((s) => s.uid === meta.specification);
  if (!spec)
    throw new Problem(
      2,
      "SPECIFICATION_MISSING",
      `Unknown specification ${meta.specification}.`,
    );
  const ranges: { marker: Marker; end: Marker }[] = [];
  let open: Marker | undefined;
  for (const m of all.slice(1)) {
    if (m.kind === "start") {
      if (open)
        throw new Problem(
          2,
          "BLOCK_NESTING",
          `Nested requirement at line ${m.line}.`,
        );
      open = m;
    }
    if (m.kind === "end") {
      if (!open)
        throw new Problem(
          2,
          "BLOCK_UNMATCHED",
          `Unmatched end marker at line ${m.line}.`,
        );
      ranges.push({ marker: open, end: m });
      open = undefined;
    }
  }
  if (open)
    throw new Problem(
      2,
      "BLOCK_UNCLOSED",
      `Requirement at line ${open.line} has no closing marker.`,
    );
  let outside = "";
  let previous = 0;
  for (const range of [
    { start: docs[0].start, end: docs[0].end },
    ...ranges.map((r) => ({ start: r.marker.start, end: r.end.end })),
  ]) {
    outside += source.slice(previous, range.start);
    previous = range.end;
  }
  outside += source.slice(previous);
  const references = referenceDefinitions(root);
  const contextDigest = digest({
    mode: meta.context,
    prose: meta.context === "normative" ? canonicalMarkdown(outside) : null,
    files: attachmentDigests(meta.normative_files, files),
    extensions: meta.extensions,
  });
  const requirements: Requirement[] = ranges.map(({ marker, end }) => {
    const m = markerSchema(requirementSchema, marker);
    checkFields(m, config);
    const markdown = source
      .slice(marker.end, end.start)
      .replace(/^\r?\n/, "")
      .replace(/\s+$/, "");
    const body: Root = {
      type: "root",
      children: root.children.filter(
        (node) =>
          node.position!.start.offset! + bom >= marker.end &&
          node.position!.end.offset! + bom <= end.start,
      ),
    };
    const title = bodyTitle(markdown, config, body);
    const fields = (cls: string) =>
      Object.fromEntries(
        Object.entries(m.fields).filter(
          ([k]) => config.fields[k].change_class === cls,
        ),
      );
    const relations = setOf(m.relations);
    if (relations.length !== m.relations.length)
      throw new Problem(
        2,
        "RELATION_DUPLICATE",
        `Duplicate relation at line ${marker.line}.`,
      );
    const definition = digest({
      version: C14N,
      body: canonicalMarkdown(markdown, true, references, body),
      fields: fields("content"),
      files: attachmentDigests(m.normative_files, files),
    });
    const governance = digest({
      version: C14N,
      document: meta.uid,
      specification: spec.uid,
      specificationTitle: spec.title,
      context: contextDigest,
      lifecycle: m.lifecycle,
      disposition: m.disposition,
      reason: m.reason ?? null,
      retirement_reason: m.retirement_reason ?? null,
      target: m.target ?? null,
      relations,
      fields: fields("scope"),
      schema: config.fields,
      policy: config.policy,
      extensions: [m.extensions, config.extensions],
    });
    const normalized = {
      ...m,
      tags: setOf(m.tags),
      aliases: setOf(m.aliases),
      relations,
    };
    return {
      uid: m.uid,
      id: m.id,
      qualifiedId: `${spec.code}:${m.id}`,
      document: meta.uid,
      specification: spec.uid,
      path,
      line: marker.line,
      start: marker.start,
      end: end.end,
      title,
      markdown,
      raw: source.slice(marker.start, end.end),
      metadata: normalized as ObjectValue,
      relations,
      lifecycle: m.lifecycle,
      disposition: m.disposition,
      definition,
      governance,
      record: digest({
        version: C14N,
        metadata: normalized,
        definition,
        governance,
      }),
    };
  });
  return {
    uid: meta.uid,
    specification: meta.specification,
    title: meta.title,
    path,
    context: meta.context,
    metadata: meta as ObjectValue,
    contextDigest,
    requirements,
  };
}
export function requirementBlock(
  metadata: ObjectValue,
  markdown: string,
  newline = "\n",
): string {
  readSchema(requirementSchema, metadata);
  const serialized = stringify(metadata, { lineWidth: 0 }).trimEnd();
  if (serialized.includes("-->"))
    throw new Problem(
      2,
      "METADATA_COMMENT",
      "Metadata values cannot contain -->.",
    );
  return `<!-- rms-requirement\n${serialized}\n-->\n\n${markdown.trim()}\n\n<!-- /rms-requirement -->`.replace(
    /\r?\n/g,
    newline,
  );
}
export function recordMarkdown(record: unknown): string {
  return `---\n${JSON.stringify(record, null, 2)}\n---\n`;
}
export function parseFrontMatter(source: string): unknown {
  const match =
    /^(?:\ufeff)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match)
    throw new Problem(
      2,
      "RECORD_FRONTMATTER",
      "Record requires YAML front matter.",
    );
  const meta = object(yaml(match[1]));
  if (!meta.rationale && match[2].trim()) meta.rationale = match[2].trim();
  return meta;
}
