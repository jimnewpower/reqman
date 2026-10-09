import { stringify } from "yaml";
import { digest, object, utf8, relativePath } from "./data.js";
import { Problem, type Snapshot } from "./model.js";
import { config as parseConfig } from "./schema.js";
import { requirementBlock } from "./markdown.js";
import type { Service, Request, Result } from "./service.js";

function identity(seed: string): string {
  const h = digest(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function migrateGrouped(
  service: Service,
  request: Request,
  snapshot: Snapshot,
  rows: Record<string, string>[],
  sourceDigest: string,
): Promise<Result> {
  const input = request.input!;
  const source = String(input.source);
  const root = relativePath.parse(input.destination_root);
  const mapping = object(input.mapping);
  const dispositions = object(mapping.dispositions ?? {});
  const targets = object(input.transfer_targets ?? {});
  const specificationCodes = object(input.specification_codes ?? {});
  const groupTitles = new Map<string, string>();
  const config = structuredClone(snapshot.config);
  const changes = new Map<string, string>();
  const groups = new Map<
    string,
    { row: Record<string, string>; index: number }[]
  >();
  if (!rows.length)
    throw new Problem(
      2,
      "MIGRATION_EMPTY",
      "Grouped migration requires at least one requirement.",
    );
  for (const [index, row] of rows.entries()) {
    const sourceCode = row[String(input.group_by)];
    const code = specificationCodes[sourceCode] ?? sourceCode;
    if (typeof code !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(code))
      throw new Problem(
        2,
        "MIGRATION_GROUP",
        `Row ${index + 1} has a missing or unsafe specification code. Use specification_codes to map source labels to portable codes.`,
      );
    if (groupTitles.has(code) && groupTitles.get(code) !== sourceCode)
      throw new Problem(
        2,
        "MIGRATION_GROUP",
        `Several source specifications map to ${code}. Use distinct codes.`,
      );
    groupTitles.set(code, sourceCode);
    const group = groups.get(code) ?? [];
    group.push({ row, index });
    groups.set(code, group);
  }
  if (input.exclude_documents !== undefined) {
    if (
      !Array.isArray(input.exclude_documents) ||
      input.exclude_documents.some(
        (p) =>
          typeof p !== "string" ||
          (!snapshot.documents.some((d) => d.path === p) &&
            !snapshot.config.documents.exclude.includes(p)),
      )
    )
      throw new Problem(
        2,
        "MIGRATION_EXCLUDE",
        "exclude_documents must name existing discovered documents.",
      );
    config.documents.exclude = [
      ...new Set([
        ...config.documents.exclude,
        ...(input.exclude_documents as string[]),
      ]),
    ];
  }
  const identities: {
    specification: string;
    source_id: string;
    uid: string;
    source_row: number;
  }[] = [];
  const documents: { specification: string; path: string; count: number }[] =
    [];
  const unresolved: {
    specification: string;
    id: string;
    row: number;
    explanation: string;
  }[] = [];
  for (const [code, group] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    let spec = config.specifications.find((s) => s.code === code);
    if (!spec) {
      spec = {
        uid: identity(`${config.project.uid}:specification:${code}`),
        code,
        title: groupTitles.get(code)!,
      };
      config.specifications.push(spec);
    }
    const destination = `${root}/${code}.md`;
    relativePath.parse(destination);
    const docUid = identity(`${config.project.uid}:${source}:${destination}`);
    const header = `<!-- rms-document\n${stringify({ format_version: 1, uid: docUid, specification: spec.uid, title: spec.title, context: "normative" })}-->\n\n# ${spec.title}\n`;
    const ids = new Set<string>();
    const blocks: string[] = [];
    for (const { row, index } of group) {
      const id = row[String(mapping.id)];
      const title = row[String(mapping.title)];
      const statement = row[String(mapping.statement)];
      if (!id?.trim() || !title?.trim() || !statement?.trim() || ids.has(id))
        throw new Problem(
          2,
          "MIGRATION_AMBIGUOUS",
          `Row ${index + 1} in ${code} has missing or duplicate identity/text.`,
        );
      ids.add(id);
      const status = row[String(mapping.disposition)];
      const disposition = mapping.disposition
        ? dispositions[status]
        : "in_scope";
      const reason = row[String(mapping.reason)]?.trim();
      const target =
        row[String(mapping.target)]?.trim() || object(targets[code] ?? {})[id];
      const explanation = ![
        "in_scope",
        "deferred",
        "not_applicable",
        "transferred",
      ].includes(String(disposition))
        ? `Unmapped disposition ${status}.`
        : ["deferred", "not_applicable"].includes(String(disposition)) &&
            !reason
          ? "Disposition requires an explicit reason."
          : disposition === "transferred" &&
              (typeof target !== "string" || !target.trim())
            ? "Transfer requires an explicit target."
            : null;
      if (explanation) {
        unresolved.push({
          specification: code,
          id,
          row: index + 1,
          explanation,
        });
        continue;
      }
      const uid = identity(`${config.project.uid}:${spec.uid}:${source}:${id}`);
      identities.push({
        specification: code,
        source_id: id,
        uid,
        source_row: index + 1,
      });
      blocks.push(
        requirementBlock(
          {
            uid,
            id,
            lifecycle: "draft",
            disposition,
            ...(reason ? { reason } : {}),
            ...(disposition === "transferred" ? { target } : {}),
            fields: object(input.fields ?? {}),
            extensions: {
              "reqman.import": {
                source,
                source_id: id,
                source_digest: sourceDigest,
                row: index + 1,
                original: row,
              },
            },
          },
          `## ${title}\n\n### Statement\n\n${statement}`,
        ),
      );
    }
    const content = `${header}\n${blocks.join("\n\n")}\n`;
    const existing = snapshot.files.get(destination);
    if (existing && utf8(existing) !== content)
      throw new Problem(
        4,
        "MIGRATION_EXISTS",
        `Destination ${destination} differs from this import. Choose a new staging destination.`,
      );
    if (!existing) changes.set(destination, content);
    documents.push({
      specification: code,
      path: destination,
      count: group.length,
    });
  }
  if (unresolved.length)
    return {
      ...service.result(request, snapshot, {
        source_count: rows.length,
        documents,
        unresolved,
      }),
      complete: false,
      exit_code: 4,
    };
  const configuration = parseConfig(config);
  if (digest(configuration) !== digest(snapshot.config))
    changes.set(service.repository.configPath, stringify(configuration));
  const manifestUid = identity(
    `${config.project.uid}:${source}:${root}:${sourceDigest}`,
  );
  const manifestPath = `${config.records_root}/migrations/${manifestUid}.json`;
  const manifest = {
    schema_version: 1,
    source,
    source_digest: sourceDigest,
    source_count: rows.length,
    target_count: identities.length,
    documents,
    identities,
    authorities_after_explicit_cutover: documents.map((d) => d.path),
    excluded_documents: input.exclude_documents ?? [],
    unresolved: [
      "Imported implementation, verification and approval statuses remain source claims; no decisions were created.",
    ],
    rollback:
      "Revert this plan's configuration change and remove its newly created documents and migration manifest. Preserve original sources and any pre-existing files.",
  };
  const existingManifest = snapshot.files.get(manifestPath);
  const manifestText = JSON.stringify(manifest, null, 2);
  if (existingManifest && utf8(existingManifest) !== manifestText)
    throw new Problem(
      4,
      "MIGRATION_EXISTS",
      "Existing migration manifest conflicts with the requested mapping.",
    );
  if (!existingManifest) changes.set(manifestPath, manifestText);
  if (!changes.size)
    return service.result(request, snapshot, {
      idempotent: true,
      imported: 0,
      manifest,
    });
  const plan = service.plan(snapshot, request.operation, changes);
  const outcome = await service.finishPlan(snapshot, request, plan);
  return service.result(request, snapshot, {
    ...(outcome as object),
    manifest,
  });
}
