import { z } from "zod";
import { minimatch } from "minimatch";
import {
  bytesDigest,
  digest,
  readSchema,
  relativePath,
  utf8,
  yaml,
  json,
} from "./data.js";
import { config, parseRecord, parseBaseline } from "./schema.js";
import { parseDocument, parseFrontMatter } from "./markdown.js";
import {
  C14N,
  FILE_LIMIT,
  Problem,
  requireValid,
  type Snapshot,
} from "./model.js";
import { validate } from "./validation.js";
import { Service, type Request } from "./service.js";
import { gitText } from "./git.js";
import { limits, checkpoint } from "./operations.js";

const archiveSchema = z
  .object({
    schema_version: z.literal(1),
    config_path: relativePath.default("requirements.yml"),
    snapshot: z.record(z.unknown()),
    git_history_included: z.literal(false),
    external_artifacts_included: z.literal(false),
    files: z
      .array(
        z
          .object({
            path: relativePath,
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            encoding: z.literal("base64"),
            content: z.string(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export async function restoreArchive(
  service: Service,
  request: Request,
  bytes: Buffer,
) {
  if (
    (await gitText(service.repository.root, [
      "rev-parse",
      "--is-bare-repository",
    ])) === "true"
  )
    throw new Problem(
      2,
      "BARE_WORKTREE",
      "Restore requires a non-bare Git working tree.",
    );
  if (bytes.length > 150 * 1024 * 1024)
    throw new Problem(3, "LIMIT_ARCHIVE", "Portable JSON exceeds 150 MiB.");
  const archive = readSchema(
    archiveSchema,
    json(utf8(bytes), 150 * 1024 * 1024),
  );
  if (archive.config_path !== service.repository.configPath)
    throw new Problem(
      2,
      "ARCHIVE_CONFIG",
      `Select --config ${archive.config_path} to restore this archive.`,
    );
  const files = new Map<string, Buffer>();
  const pathKeys = new Set<string>();
  let total = 0;
  for (const file of archive.files) {
    await checkpoint(
      "Verifying archive files",
      files.size,
      archive.files.length,
    );
    const content = Buffer.from(file.content, "base64");
    total += content.length;
    if (
      content.toString("base64") !== file.content ||
      bytesDigest(content) !== file.sha256
    )
      throw new Problem(
        4,
        "ARCHIVE_INTEGRITY",
        `Integrity mismatch: ${file.path}.`,
      );
    if (content.length > limits().fileBytes || total > limits().snapshotBytes)
      throw new Problem(
        3,
        "LIMIT_ARCHIVE",
        "Archive exceeds file or 100 MiB decoded snapshot limits.",
      );
    if (pathKeys.has(file.path.toLowerCase()))
      throw new Problem(
        4,
        "PATH_COLLISION",
        `Duplicate or colliding archive path: ${file.path}.`,
      );
    files.set(file.path, content);
    pathKeys.add(file.path.toLowerCase());
  }
  if (!files.has(archive.config_path))
    throw new Problem(2, "ARCHIVE_CONFIG", "Archive configuration is missing.");
  const cfg = config(yaml(utf8(files.get(archive.config_path)!)));
  const included = (p: string) =>
    cfg.documents.include.some((pattern) =>
      minimatch(p, pattern, { dot: true, noext: true, nonegate: true }),
    ) &&
    !cfg.documents.exclude.some((pattern) =>
      minimatch(p, pattern, { dot: true, noext: true, nonegate: true }),
    );
  const documents = [...files.keys()]
    .filter(included)
    .map((p) => parseDocument(p, utf8(files.get(p)!), cfg, files));
  const records = [...files.keys()]
    .filter(
      (p) =>
        p.startsWith(`${cfg.records_root}/`) &&
        /\/(reviews|assessments|evidence|changes|verification|impacts)\/[^/]+\.md$/.test(
          p,
        ),
    )
    .map((p) => ({
      ...parseRecord(parseFrontMatter(utf8(files.get(p)!))),
      path: p,
    }));
  const baselines = [...files.keys()]
    .filter(
      (p) =>
        p.startsWith(`${cfg.records_root}/baselines/`) && p.endsWith(".yml"),
    )
    .map((p) => parseBaseline(yaml(utf8(files.get(p)!))));
  const snapshot: Snapshot = {
    config: cfg,
    files,
    documents,
    requirements: documents.flatMap((d) => d.requirements),
    records,
    baselines,
    diagnostics: [],
    info: {
      ref: "archive",
      objectId: null,
      captureId: digest([...files].map(([p, b]) => [p, bytesDigest(b)]).sort()),
      project: cfg.project.uid,
      dirty: true,
      configDigest: bytesDigest(files.get(archive.config_path)!),
      canonicalization: C14N,
      repository: service.repository.root,
      mode: "working",
      evaluatedAt: new Date().toISOString(),
    },
  };
  snapshot.diagnostics = validate(snapshot);
  requireValid(snapshot, true);
  const plan = service.plan(null, "restore", new Map());
  // Attachments may be binary; retain their original bytes in the plan.
  plan.entries = [...files].map(([p, b]) => ({
    path: p,
    before: null,
    after: b.toString("base64"),
  }));
  const outcome = await service.finishPlan(
    null,
    request,
    plan,
    cfg.records_root,
  );
  return service.result(request, snapshot, {
    ...(outcome as object),
    integrity_verified: true,
    git_history_included: false,
    external_artifacts_included: false,
    counts: {
      requirements: snapshot.requirements.length,
      records: records.length,
      baselines: baselines.length,
    },
    missing_history: baselines.map((b) => ({
      baseline: b.name,
      target: b.target,
    })),
  });
}
