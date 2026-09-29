import { realpath } from "node:fs/promises";
import { minimatch } from "minimatch";
import {
  bytesDigest,
  digest,
  utf8,
  yaml,
  relativePath,
  locateYaml,
} from "./data.js";
import { config as parseConfig, parseBaseline, parseRecord } from "./schema.js";
import {
  parseDocument,
  parseFrontMatter,
  normativePaths,
  prepareDocument,
} from "./markdown.js";
import { git, gitText, commit, treeFiles, blobs } from "./git.js";
import { readBounded, safePath, walk, Writer, CapturePaths } from "./files.js";
import {
  C14N,
  FILE_LIMIT,
  Problem,
  diagnostic,
  type Config,
  type Snapshot,
  type Diagnostic,
} from "./model.js";
import { validate } from "./validation.js";
import { policyFindings } from "./policy.js";
import { checkpoint, limits } from "./operations.js";

export class Repository {
  lastSnapshot?: Snapshot;
  private documentCache = new Map<
    string,
    { key: string; value: Snapshot["documents"][number] }
  >();
  private recordCache = new Map<
    string,
    { key: string; value: Snapshot["records"][number] }
  >();
  private committedCache = new Map<string, Snapshot>();
  private attachmentCache = new Map<string, { key: string; paths: string[] }>();
  constructor(
    public root: string,
    public configPath = "requirements.yml",
    public readOnly = false,
  ) {}
  // Event-driven indexing updates a captured view. Guarded operations still request a full capture.
  async reindexDocument(name: string): Promise<Snapshot> {
    const previous = this.lastSnapshot;
    if (
      !previous ||
      previous.info.mode !== "working" ||
      previous.diagnostics.some(
        (d) => d.severity === "error" && !d.code.startsWith("POLICY_"),
      )
    )
      return this.snapshot();
    const prior = previous.documents.find((d) => d.path === name);
    if (!prior) return this.snapshot();
    await checkpoint("Reindexing changed document");
    const paths = new CapturePaths(this.root),
      files = new Map(previous.files);
    const source = await readBounded(await paths.resolve(name));
    files.set(name, source);
    for (const attachment of normativePaths(utf8(source)))
      files.set(attachment, await readBounded(await paths.resolve(attachment)));
    const changed = parseDocument(name, utf8(source), previous.config, files);
    if (
      bytesDigest(await readBounded(await paths.resolve(name))) !==
      bytesDigest(source)
    )
      throw new Problem(
        4,
        "CAPTURE_CHANGED",
        `File changed during incremental capture: ${name}. Retry.`,
      );
    await paths.verify();
    const documents = previous.documents.map((d) =>
      d.path === name ? changed : d,
    );
    const snapshot: Snapshot = {
      ...previous,
      files,
      documents,
      requirements: documents.flatMap((d) => d.requirements),
      diagnostics: [],
      info: {
        ...previous.info,
        dirty: true,
        captureKind: "incremental",
        evaluatedAt: new Date().toISOString(),
        captureId: digest(
          [...files].map(([p, b]) => [p, bytesDigest(b)]).sort(),
        ),
      },
    };
    snapshot.diagnostics = validate(snapshot);
    this.lastSnapshot = snapshot;
    return snapshot;
  }
  async snapshot(ref = "WORKTREE"): Promise<Snapshot> {
    await checkpoint("Discovering authoritative inputs");
    this.root = await realpath(this.root);
    if (ref.startsWith("baseline:")) {
      const working = await this.snapshot("WORKTREE");
      const baseline = working.baselines.find(
        (b) => b.name === ref.slice(9) || b.uid === ref.slice(9),
      );
      if (!baseline)
        throw new Problem(2, "BASELINE_MISSING", `Baseline not found: ${ref}`);
      const original = await this.snapshot(baseline.target);
      const result = { ...original, info: { ...original.info } };
      if (
        baseline.project !== result.info.project ||
        baseline.config_digest !== result.info.configDigest
      )
        throw new Problem(
          4,
          "BASELINE_INTEGRITY",
          "Baseline manifest does not match its target.",
        );
      const ids = new Set(baseline.selection.map((s) => s.uid));
      for (const s of baseline.selection)
        if (
          !result.requirements.some(
            (r) =>
              r.uid === s.uid &&
              r.definition === s.definition &&
              r.governance === s.governance,
          )
        )
          throw new Problem(
            4,
            "BASELINE_INTEGRITY",
            `Baseline subject cannot be resolved: ${s.uid}`,
          );
      const selected = { ...result, selection: [...ids] };
      result.info.ref = ref;
      return selected;
    }
    const oid = ref === "WORKTREE" ? null : await commit(this.root, ref);
    const cacheKey = `${oid}:${digest(limits())}`;
    if (oid && this.committedCache.has(cacheKey)) {
      const cached = this.committedCache.get(cacheKey)!;
      const result = {
        ...cached,
        info: { ...cached.info, ref, evaluatedAt: new Date().toISOString() },
        diagnostics: [] as Diagnostic[],
      };
      result.diagnostics = [
        ...cached.diagnostics.filter((d) => !d.code.startsWith("POLICY_")),
        ...policyFindings(result),
      ];
      this.lastSnapshot = result;
      return result;
    }
    if (
      !oid &&
      (await gitText(this.root, ["rev-parse", "--is-bare-repository"])) ===
        "true"
    )
      throw new Problem(
        2,
        "BARE_WORKTREE",
        "Bare repositories require an explicit --ref commit.",
      );
    const index = oid ? await treeFiles(this.root, oid) : null;
    const names = index ? [...index.keys()].sort() : await walk(this.root);
    const files = new Map<string, Buffer>();
    const paths = new CapturePaths(this.root);
    let capturedBytes = 0;
    const retain = (name: string, bytes: Buffer) => {
      capturedBytes += bytes.length;
      if (capturedBytes > limits().snapshotBytes)
        throw new Problem(
          3,
          "LIMIT_SNAPSHOT",
          `Selected authoritative inputs exceed ${limits().snapshotBytes} bytes. Use --max-snapshot-mib for an explicit override.`,
        );
      files.set(name, bytes);
    };
    const read = async (name: string) => {
      if (!relativePath.safeParse(name).success)
        throw new Problem(2, "PATH_UNSAFE", `Unsafe snapshot path: ${name}`);
      if (files.has(name)) return files.get(name)!;
      let bytes: Buffer;
      if (index) {
        const item = index.get(name);
        if (!item)
          throw new Problem(
            3,
            "SNAPSHOT_FILE_MISSING",
            `Unavailable in selected commit: ${name}`,
          );
        if (!["100644", "100755"].includes(item.mode))
          throw new Problem(
            3,
            "SNAPSHOT_FILE_TYPE",
            `Symlink or submodule content is not resolved: ${name}`,
          );
        const size = Number(
          await gitText(this.root, ["cat-file", "-s", item.oid]),
        );
        if (size > limits().fileBytes)
          throw new Problem(
            3,
            "LIMIT_FILE",
            `File exceeds ${limits().fileBytes} bytes: ${name}. Use --max-file-mib for an explicit override.`,
          );
        bytes = await git(
          this.root,
          ["cat-file", "blob", item.oid],
          limits().fileBytes,
        );
      } else bytes = await readBounded(await paths.resolve(name));
      retain(name, bytes);
      return bytes;
    };
    let config: Config;
    try {
      config = parseConfig(yaml(utf8(await read(this.configPath))));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new Problem(
          2,
          "CONFIG_MISSING",
          `No ${this.configPath}. Preview setup with reqman init.`,
        );
      if (error instanceof Problem && files.has(this.configPath)) {
        if (!error.location)
          locateYaml(utf8(files.get(this.configPath)!), error);
        error.file = this.configPath;
      }
      throw error;
    }
    const diagnostics: Diagnostic[] = [];
    if (
      !oid &&
      (await new Writer(this.root, config.records_root).pending()).length
    )
      throw new Problem(
        3,
        "RECOVERY_REQUIRED",
        "An interrupted write prevents a consistent snapshot; run recover.",
      );
    const included = (n: string) =>
      config.documents.include.some((p) =>
        minimatch(n, p, { dot: true, nonegate: true, noext: true }),
      ) &&
      !config.documents.exclude.some((p) =>
        minimatch(n, p, { dot: true, nonegate: true, noext: true }),
      );
    const docPaths = names.filter(included);
    // records_root may be nested; classify relative to it rather than a fixed top-level directory.
    const durablePaths = names.filter(
      (n) =>
        n.startsWith(`${config.records_root}/`) &&
        /^(reviews|assessments|evidence|changes|verification|impacts)\/[^/]+\.md$/.test(
          n.slice(config.records_root.length + 1),
        ),
    );
    const baselinePaths = names.filter(
      (n) =>
        n.startsWith(`${config.records_root}/baselines/`) && n.endsWith(".yml"),
    );
    const migrationPaths = names.filter(
      (n) =>
        n.startsWith(`${config.records_root}/migrations/`) &&
        n.endsWith(".json"),
    );
    const selected = [
      this.configPath,
      ...docPaths,
      ...durablePaths,
      ...baselinePaths,
      ...migrationPaths,
    ];
    await checkpoint("Reading selected files");
    if (
      new Set(selected.map((n) => n.toLowerCase())).size !==
      new Set(selected).size
    )
      throw new Problem(
        2,
        "PATH_COLLISION",
        "Selected paths collide when compared without case.",
      );
    if (index) {
      const pending = [...new Set(selected)].filter((p) => !files.has(p));
      for (const name of pending) {
        if (
          !relativePath.safeParse(name).success ||
          !["100644", "100755"].includes(index.get(name)?.mode ?? "")
        )
          throw new Problem(
            3,
            "SNAPSHOT_FILE_TYPE",
            `Unsafe path, symlink or submodule: ${name}`,
          );
      }
      const contents = await blobs(
        this.root,
        pending.map((p) => index.get(p)!.oid),
      );
      pending.forEach((p, i) => retain(p, contents[i]));
    } else await concurrent(selected, read);
    // Explicit attachments are discovered from metadata, without following ordinary links.
    const prepared = new Map<string, ReturnType<typeof prepareDocument>>();
    for (const name of docPaths) {
      await checkpoint("Discovering normative attachments");
      const source = utf8(files.get(name)!);
      try {
        const key = `${bytesDigest(files.get(name)!)}:${limits().depth}`;
        let cached = this.attachmentCache.get(name);
        if (cached?.key !== key) {
          const value = prepareDocument(source);
          prepared.set(name, value);
          cached = { key, paths: value.paths };
          this.attachmentCache.set(name, cached);
        }
        for (const attachment of cached.paths) await read(attachment);
      } catch (error) {
        const e = error as Error;
        diagnostics.push(
          diagnostic(
            error instanceof Problem ? error.code : "READ_FAILURE",
            e.message,
            name,
          ),
        );
      }
    }
    const documents: Snapshot["documents"] = [];
    const records: Snapshot["records"] = [];
    const baselines: Snapshot["baselines"] = [];
    const configKey = digest([config, limits()]);
    for (const name of docPaths) {
      await checkpoint("Parsing documents", documents.length, docPaths.length);
      try {
        const source = utf8(files.get(name)!);
        const key = digest([
          configKey,
          bytesDigest(files.get(name)!),
          (this.attachmentCache.get(name)?.paths ?? normativePaths(source)).map(
            (p) => [p, files.has(p) ? bytesDigest(files.get(p)!) : null],
          ),
        ]);
        let cached = this.documentCache.get(name);
        if (cached?.key !== key) {
          cached = {
            key,
            value: parseDocument(
              name,
              source,
              config,
              files,
              prepared.get(name),
            ),
          };
          this.documentCache.set(name, cached);
          prepared.delete(name);
        }
        documents.push(cached.value);
      } catch (error) {
        diagnostics.push(
          diagnostic(
            error instanceof Problem ? error.code : "PARSE_FAILURE",
            (error as Error).message,
            name,
            error instanceof Problem
              ? (error.location?.line ??
                  Number(/line (\d+)/.exec(error.message)?.[1] ?? 1))
              : 1,
            error instanceof Problem ? error.subject : undefined,
          ),
        );
        if (error instanceof Problem)
          diagnostics.at(-1)!.column = error.location?.column ?? 1;
      }
    }
    for (const name of durablePaths) {
      await checkpoint(
        "Parsing durable records",
        records.length,
        durablePaths.length,
      );
      try {
        const key = bytesDigest(files.get(name)!);
        let cached = this.recordCache.get(name);
        if (cached?.key !== key) {
          cached = {
            key,
            value: {
              ...parseRecord(parseFrontMatter(utf8(files.get(name)!))),
              path: name,
            },
          };
          this.recordCache.set(name, cached);
        }
        records.push(cached.value);
      } catch (error) {
        diagnostics.push(
          diagnostic(
            error instanceof Problem ? error.code : "RECORD_INVALID",
            (error as Error).message,
            name,
          ),
        );
      }
    }
    for (const name of baselinePaths) {
      try {
        baselines.push(parseBaseline(yaml(utf8(files.get(name)!))));
      } catch (error) {
        diagnostics.push(
          diagnostic(
            error instanceof Problem ? error.code : "BASELINE_INVALID",
            (error as Error).message,
            name,
          ),
        );
      }
    }
    for (const record of records)
      for (const attachment of record.attachments ?? []) {
        try {
          if (
            !attachment.path.startsWith(`${config.records_root}/attachments/`)
          )
            throw new Problem(
              2,
              "ATTACHMENT_PATH",
              "Evidence attachments must be under records_root/attachments.",
            );
          const bytes = await read(attachment.path);
          if (
            bytes.length !== attachment.size ||
            bytesDigest(bytes) !== attachment.sha256
          )
            throw new Problem(
              4,
              "ATTACHMENT_INTEGRITY",
              `Evidence attachment changed: ${attachment.path}.`,
            );
        } catch (error) {
          diagnostics.push(
            diagnostic(
              error instanceof Problem ? error.code : "READ_FAILURE",
              (error as Error).message,
              attachment.path,
              1,
              record.uid,
            ),
          );
        }
      }
    if (!oid) {
      await checkpoint("Verifying captured files");
      const governed = (n: string) =>
        included(n) ||
        (n.startsWith(`${config.records_root}/`) &&
          /^(reviews|assessments|evidence|changes|verification|impacts|baselines|migrations)\//.test(
            n.slice(config.records_root.length + 1),
          ));
      const after = (await walk(this.root)).filter(governed);
      const before = names.filter(governed);
      if (digest(after) !== digest(before))
        throw new Problem(
          4,
          "CAPTURE_CHANGED",
          "Inventory changed during capture. Retry.",
        );
      await concurrent([...files], async ([name, bytes]) => {
        if (
          bytesDigest(await readBounded(await paths.resolve(name))) !==
          bytesDigest(bytes)
        )
          throw new Problem(
            4,
            "CAPTURE_CHANGED",
            `File changed during capture: ${name}`,
          );
      });
      await paths.verify();
    }
    const dirty =
      !oid &&
      (
        await git(this.root, [
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=normal",
        ])
      ).length > 0;
    const snapshot: Snapshot = {
      info: {
        ref,
        objectId: oid,
        captureId: digest(
          [...files].map(([p, b]) => [p, bytesDigest(b)]).sort(),
        ),
        project: config.project.uid,
        dirty,
        configDigest: bytesDigest(files.get(this.configPath)!),
        canonicalization: C14N,
        repository: this.root,
        mode: oid ? "committed" : "working",
        captureKind: "full",
        evaluatedAt: new Date().toISOString(),
      },
      config,
      files,
      documents,
      requirements: documents.flatMap((d) => d.requirements),
      records,
      baselines,
      diagnostics,
    };
    snapshot.diagnostics.push(...validate(snapshot));
    await checkpoint(
      "Validation complete",
      snapshot.requirements.length,
      snapshot.requirements.length,
    );
    snapshot.diagnostics.sort(
      (a, b) =>
        a.file.localeCompare(b.file, "en") ||
        a.line - b.line ||
        a.code.localeCompare(b.code, "en"),
    );
    this.lastSnapshot = snapshot;
    if (oid) {
      if (this.committedCache.size >= 2)
        this.committedCache.delete(this.committedCache.keys().next().value!);
      this.committedCache.set(cacheKey, snapshot);
    }
    return snapshot;
  }
}

async function concurrent<T>(items: T[], work: (item: T) => Promise<unknown>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(64, items.length) }, async () => {
      while (cursor < items.length) await work(items[cursor++]);
    }),
  );
}
