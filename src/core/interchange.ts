import { randomUUID } from "node:crypto";
import { mkdir, open, realpath } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { parse as csv } from "csv-parse/sync";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { bytesDigest, digest, html, object, stable, utf8 } from "./data.js";
import {
  FILE_LIMIT,
  Problem,
  requireValid,
  resolve,
  subject,
  type DurableRecord,
  type ObjectValue,
  type Snapshot,
} from "./model.js";
import { dependencies, projection, summary } from "./decisions.js";
import { parseRecord } from "./schema.js";
import { parseDocument, recordMarkdown, requirementBlock } from "./markdown.js";
import { readBounded, safePath } from "./files.js";
import { Service, type Request, type Result } from "./service.js";

export async function exportReport(
  service: Service,
  request: Request,
  format: string,
): Promise<{ content: string; extension: string }> {
  const s = await service.repository.snapshot(request.ref);
  requireValid(s);
  const result = await service.execute({ ...request, operation: "register" });
  const data = result.data as {
    requirements: (Snapshot["requirements"][number] & {
      state: ReturnType<typeof projection>;
    })[];
  };
  if (format === "json")
    return { content: JSON.stringify(result, null, 2), extension: "json" };
  if (format === "portable") {
    const files = [...s.files]
      .filter(([p]) => !p.startsWith(`${s.config.records_root}/recovery/`))
      .map(([p, b]) => ({
        path: p,
        sha256: bytesDigest(b),
        encoding: "base64",
        content: b.toString("base64"),
      }));
    return {
      content: JSON.stringify(
        {
          schema_version: 1,
          snapshot: s.info,
          git_history_included: false,
          external_artifacts_included: false,
          files,
        },
        null,
        2,
      ),
      extension: "json",
    };
  }
  const fields = [
    "uid",
    "id",
    "title",
    "lifecycle",
    "disposition",
    "approval",
    "implementation",
    "verification",
    "currency",
    "snapshot",
    "scope",
  ];
  const rows = data.requirements.map((r) => [
    r.uid,
    r.qualifiedId,
    r.title,
    r.lifecycle,
    r.disposition,
    r.state.approval,
    r.state.implementation,
    r.state.verification,
    r.state.currency,
    s.info.objectId ?? s.info.captureId,
    request.scope ?? "project",
  ]);
  if (format === "csv") {
    const cell = (text: string) =>
      `"${(/^[\s]*[=+@\-\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
    return {
      content:
        [fields, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") +
        "\r\n",
      extension: "csv",
    };
  }
  if (format === "markdown")
    return {
      content: `# Requirements report\n\nSnapshot: ${s.info.objectId ?? s.info.captureId}\n\nScope: ${request.scope ?? "project"}\n\n${rows.map((row) => `- **${row[1].replace(/[\[\]*_<>]/g, "")}** ${row[2].replace(/[\[\]*_<>]/g, "")} — approval: ${row[5]}, verification: ${row[7]}, currency: ${row[8]}`).join("\n")}\n`,
      extension: "md",
    };
  if (format !== "html")
    throw new Problem(
      2,
      "EXPORT_FORMAT",
      "Choose html, csv, json, markdown, or portable.",
    );
  return {
    content: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${html(s.config.project.name)} requirements</title><style>body{font:16px system-ui;max-width:1100px;margin:3rem auto;padding:0 1rem;color:#172c37}table{border-collapse:collapse;width:100%}td,th{padding:.7rem;text-align:left;border-bottom:1px solid #ccd6da}pre{white-space:pre-wrap}article{margin:3rem 0}small{color:#526873}</style><h1>${html(s.config.project.name)}</h1><p>Requirements report · ${html(s.info.ref)} · ${html(request.scope ?? "project")}</p><small>Snapshot ${html(s.info.objectId ?? s.info.captureId)}. Local actor claims are unauthenticated. External artifacts and Git history are not bundled.</small><pre>${html(JSON.stringify(summary(s, request.scope, request.artifact), null, 2))}</pre><table><thead><tr>${fields.map((f) => `<th>${html(f)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${html(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>${data.requirements.map((r) => `<article id="${r.uid}"><h2>${html(r.qualifiedId)} · ${html(r.title)}</h2><p>${html(r.path)}:${r.line}</p><pre>${html(r.markdown)}</pre></article>`).join("")}</html>`,
    extension: "html",
  };
}
export async function writeExport(
  destination: string,
  content: string,
  overwrite = false,
): Promise<void> {
  await mkdir(path.dirname(path.resolve(destination)), { recursive: true });
  const handle = await open(destination, overwrite ? "w" : "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
interface TestResult {
  key: string;
  outcome: string;
  duration: number;
  details: ObjectValue;
}
function junit(source: string, producer: string): TestResult[] {
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(source))
    throw new Problem(
      2,
      "XML_UNSAFE",
      "DTDs and entity declarations are forbidden.",
    );
  if (XMLValidator.validate(source) !== true)
    throw new Problem(2, "XML_INVALID", "Malformed JUnit XML.");
  let depth = 0;
  for (const match of source.matchAll(/<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g)) {
    if (match[0].startsWith("</")) depth--;
    else if (!match[0].endsWith("/>")) depth++;
    if (depth > 128)
      throw new Problem(3, "XML_DEPTH", "XML nesting exceeds 128.");
  }
  const parsed = new XMLParser({
    maxNestedTags: 128,
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    processEntities: false,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) =>
      ["testsuite", "testcase", "failure", "error", "skipped"].includes(name),
  }).parse(source);
  if (!parsed.testsuites && !parsed.testsuite)
    throw new Problem(2, "XML_SUBSET", "Expected testsuites or testsuite.");
  const results: TestResult[] = [];
  const visit = (suites: Record<string, unknown>[]) => {
    for (const suite of suites) {
      for (const key of Object.keys(suite))
        if (
          !key.startsWith("@") &&
          ![
            "testcase",
            "testsuite",
            "properties",
            "system-out",
            "system-err",
            "#text",
          ].includes(key)
        )
          throw new Problem(
            2,
            "XML_SUBSET",
            `Unsupported suite element: ${key}`,
          );
      for (const item of (suite.testcase as Record<string, unknown>[]) ?? []) {
        for (const key of Object.keys(item))
          if (
            !key.startsWith("@") &&
            ![
              "failure",
              "error",
              "skipped",
              "properties",
              "system-out",
              "system-err",
              "#text",
            ].includes(key)
          )
            throw new Problem(
              2,
              "XML_SUBSET",
              `Unsupported testcase element: ${key}`,
            );
        if (!item["@name"])
          throw new Problem(2, "XML_TEST_KEY", "Test cases require names.");
        const seconds = Number(item["@time"] ?? 0);
        if (!Number.isFinite(seconds) || seconds < 0)
          throw new Problem(2, "XML_DURATION", "Invalid test duration.");
        results.push({
          key: `${producer}::${suite["@name"] ?? ""}::${item["@classname"] ?? ""}::${item["@name"]}`,
          outcome:
            item.failure || item.error
              ? "failed"
              : item.skipped
                ? "skipped"
                : "passed",
          duration: Math.round(seconds * 1000),
          details: JSON.parse(JSON.stringify(item)),
        });
      }
      if (Array.isArray(suite.testsuite)) visit(suite.testsuite);
    }
  };
  visit(parsed.testsuite ?? parsed.testsuites.testsuite ?? []);
  if (!results.length)
    throw new Problem(2, "XML_EMPTY", "No supported test cases found.");
  return results;
}
export async function importEvidence(
  service: Service,
  request: Request,
  bytes: Buffer,
): Promise<Result> {
  const s = await service.repository.snapshot();
  requireValid(s);
  const input = request.input ?? {};
  const producer = String(input.producer ?? "junit");
  if (typeof input.run_id !== "string" || !input.run_id)
    throw new Problem(2, "RUN_REQUIRED", "Provide a stable run_id.");
  const mapping = object(input.mapping ?? {});
  const sourceDigest = bytesDigest(bytes);
  const existing = s.records.filter(
    (r) =>
      r.kind === "evidence" &&
      r.run_id === input.run_id &&
      r.producer === producer,
  );
  const interpretationDigest = digest({
    mapping,
    artifact: input.artifact,
    producer,
    scope: request.scope ?? "project",
  });
  if (existing.length) {
    if (
      existing.every(
        (r) =>
          r.source_digest === sourceDigest &&
          r.details?.interpretation_digest === interpretationDigest,
      )
    )
      return service.result(request, s, { imported: 0, idempotent: true });
    throw new Problem(
      4,
      "RUN_CONFLICT",
      "This run identity already exists with different content, mapping, scope, or artifact.",
    );
  }
  let results: TestResult[];
  if (utf8(bytes).trimStart().startsWith("<"))
    results = junit(utf8(bytes), producer);
  else {
    const native = JSON.parse(utf8(bytes));
    if (native.schema_version !== 1 || !Array.isArray(native.attempts))
      throw new Problem(
        2,
        "RESULT_FORMAT",
        "Native evidence requires schema_version 1 and attempts.",
      );
    results = native.attempts.map((a: Record<string, unknown>) => ({
      key: a.key,
      outcome: a.outcome,
      duration: a.duration_ms ?? 0,
      details: a,
    })) as TestResult[];
  }
  const seen = new Set<string>();
  const records: DurableRecord[] = [];
  for (const result of results) {
    if (seen.has(result.key))
      throw new Problem(
        2,
        "TEST_KEY_AMBIGUOUS",
        `Duplicate test key: ${result.key}`,
      );
    seen.add(result.key);
    if (!mapping[result.key])
      throw new Problem(
        2,
        "TEST_UNMAPPED",
        `Explicit mapping required for ${result.key}`,
      );
    const link = object(mapping[result.key]);
    const r = resolve(s, String(link.requirement));
    const obligation = s.records.find(
      (rec) => rec.uid === link.obligation && rec.kind === "verification",
    );
    if (!obligation || !obligation.subjects.some((sub) => sub.uid === r.uid))
      throw new Problem(
        2,
        "OBLIGATION_MISSING",
        `Mapping needs a verification definition for ${r.qualifiedId}.`,
      );
    const record = parseRecord({
      format_version: 1,
      uid: randomUUID(),
      kind: "evidence",
      created_at: input.created_at ?? new Date().toISOString(),
      actor: input.actor,
      rationale: input.rationale ?? `Imported run ${input.run_id}`,
      subjects: [subject(r)],
      dependencies: dependencies(s, r),
      scope: request.scope ?? "project",
      artifact: input.artifact,
      result: result.outcome,
      method: "test",
      run_id: input.run_id,
      producer,
      source_digest: sourceDigest,
      test_key: result.key,
      duration: result.duration,
      details: {
        ...result.details,
        interpretation_digest: interpretationDigest,
      },
      obligations: [obligation.uid],
      location: input.location ?? "explicit local import",
      snapshot: s.info,
      provenance: "imported producer claim; unauthenticated",
    });
    records.push(record);
  }
  const changes = new Map(
    records.map((r) => [
      `${s.config.records_root}/evidence/${r.uid}.md`,
      recordMarkdown(r),
    ]),
  );
  const outcome = await service.finishPlan(
    s,
    request,
    service.plan(s, request.operation, changes),
  );
  return service.result(request, s, {
    ...(outcome as object),
    imported: records.length,
    note: "Import records observations only. Passing verification requires a separate complete assessment.",
  });
}
function deterministicUuid(seed: string): string {
  const h = digest(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export async function migrate(
  service: Service,
  request: Request,
  bytes: Buffer,
): Promise<Result> {
  const s = await service.repository.snapshot();
  requireValid(s);
  const input = request.input ?? {};
  if (
    typeof input.destination !== "string" ||
    !input.destination.endsWith(".md")
  )
    throw new Problem(
      2,
      "MIGRATION_DESTINATION",
      "Provide an explicit Markdown destination.",
    );
  if (typeof input.source !== "string")
    throw new Problem(2, "MIGRATION_SOURCE", "Provide source provenance.");
  const sourceDigest = bytesDigest(bytes);
  const text = utf8(bytes);
  if (input.expected_digest && input.expected_digest !== sourceDigest)
    throw new Problem(
      4,
      "MIGRATION_SOURCE_CHANGED",
      "Source differs from preview.",
    );
  const mapping = object(
    input.mapping ?? { id: "id", title: "title", statement: "statement" },
  );
  let rows: Record<string, string>[];
  if (input.format === "json") {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : parsed.requirements;
  } else if (input.format === "markdown-table") {
    const lines = text.split(/\r?\n/).filter((l) => l.startsWith("|"));
    const cells = (l: string) =>
      l
        .slice(1, l.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((s) => s.trim());
    if (lines.length < 3)
      throw new Problem(
        2,
        "MIGRATION_TABLE",
        "Expected one simple pipe table with header, separator, and rows.",
      );
    const header = cells(lines[0]);
    rows = lines
      .slice(2)
      .map((l) => Object.fromEntries(cells(l).map((v, i) => [header[i], v])));
  } else
    rows = csv(text, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      max_record_size: FILE_LIMIT,
    });
  if (!Array.isArray(rows))
    throw new Problem(
      2,
      "MIGRATION_FORMAT",
      "Input must contain a requirement array.",
    );
  const spec =
    s.config.specifications.find(
      (spec) =>
        spec.uid === input.specification || spec.code === input.specification,
    ) ?? s.config.specifications[0];
  const docId = deterministicUuid(
    `${s.info.project}:${input.source}:${input.destination}`,
  );
  const header = `<!-- rms-document\n${stringify({ format_version: 1, uid: docId, specification: spec.uid, title: String(input.title ?? "Imported requirements"), context: "normative" })}-->\n\n# Imported requirements\n`;
  const ids = new Set<string>();
  const identities: { source_id: string; uid: string }[] = [];
  const blocks = rows.map((row, index) => {
    const id = row[String(mapping.id)];
    const title = row[String(mapping.title)];
    const statement = row[String(mapping.statement)];
    if (!id || !title || !statement || ids.has(id))
      throw new Problem(
        2,
        "MIGRATION_AMBIGUOUS",
        `Row ${index + 1} has missing or duplicate identity/text. Resolve it before applying.`,
      );
    ids.add(id);
    const uid = deterministicUuid(
      `${s.info.project}:${spec.uid}:${input.source}:${id}`,
    );
    identities.push({ source_id: id, uid });
    const fields = object(input.fields ?? {});
    return requirementBlock(
      {
        uid,
        id,
        lifecycle: "draft",
        disposition: "in_scope",
        fields,
        extensions: {
          "reqman.import": {
            source: input.source,
            source_id: id,
            source_digest: sourceDigest,
            row: index + 1,
            original: row,
          },
        },
      },
      `## ${title}\n\n### Statement\n\n${statement}`,
    );
  });
  const content = `${header}\n${blocks.join("\n\n")}\n`;
  const prospective = parseDocument(
    input.destination,
    content,
    s.config,
    s.files,
  );
  if (s.files.has(input.destination)) {
    if (utf8(s.files.get(input.destination)!) === content)
      return service.result(request, s, { idempotent: true, imported: 0 });
    throw new Problem(
      4,
      "MIGRATION_EXISTS",
      "Destination exists with different content. Choose a new staging destination.",
    );
  }
  const manifestPath = `${s.config.records_root}/migrations/${docId}.json`;
  const manifest = {
    schema_version: 1,
    source: input.source,
    source_digest: sourceDigest,
    source_count: rows.length,
    target_count: prospective.requirements.length,
    identities,
    authorities_after_explicit_cutover: [input.destination],
    unresolved: [
      "Imported statuses and approvals remain source claims, not current decisions.",
    ],
    rollback: `Remove ${input.destination} and ${manifestPath}; original sources were not changed.`,
  };
  const plan = service.plan(
    s,
    request.operation,
    new Map([
      [input.destination, content],
      [manifestPath, JSON.stringify(manifest, null, 2)],
    ]),
  );
  const outcome = await service.finishPlan(s, request, plan);
  return service.result(request, s, {
    ...(outcome as object),
    manifest,
    note: "Review discovery globs and declare cutover explicitly. No original sources were overwritten.",
  });
}
