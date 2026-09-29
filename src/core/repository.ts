import { realpath } from "node:fs/promises";
import { minimatch } from "minimatch";
import { bytesDigest, digest, utf8, yaml, relativePath } from "./data.js";
import { config as parseConfig, parseBaseline, parseRecord } from "./schema.js";
import { parseDocument, parseFrontMatter, normativePaths } from "./markdown.js";
import { git, gitText, commit, treeFiles, blobs } from "./git.js";
import { readBounded, safePath, walk, Writer } from "./files.js";
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

export class Repository {
  constructor(
    public root: string,
    public configPath = "requirements.yml",
    public readOnly = false,
  ) {}
  async snapshot(ref = "WORKTREE"): Promise<Snapshot> {
    this.root = await realpath(this.root);
    if (ref.startsWith("baseline:")) {
      const working = await this.snapshot("WORKTREE");
      const baseline = working.baselines.find(
        (b) => b.name === ref.slice(9) || b.uid === ref.slice(9),
      );
      if (!baseline)
        throw new Problem(2, "BASELINE_MISSING", `Baseline not found: ${ref}`);
      const result = await this.snapshot(baseline.target);
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
      result.requirements = result.requirements.filter((r) => ids.has(r.uid));
      result.info.ref = ref;
      return result;
    }
    const oid = ref === "WORKTREE" ? null : await commit(this.root, ref);
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
    let capturedBytes = 0;
    const retain = (name: string, bytes: Buffer) => {
      capturedBytes += bytes.length;
      if (capturedBytes > 100 * 1024 * 1024)
        throw new Problem(
          3,
          "LIMIT_SNAPSHOT",
          "Selected authoritative inputs exceed the 100 MiB snapshot limit.",
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
        if (size > FILE_LIMIT)
          throw new Problem(3, "LIMIT_FILE", `File exceeds 10 MiB: ${name}`);
        bytes = await git(
          this.root,
          ["cat-file", "blob", item.oid],
          FILE_LIMIT,
        );
      } else bytes = await readBounded(await safePath(this.root, name));
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
    } else for (const name of selected) await read(name);
    // Explicit attachments are discovered from metadata, without following ordinary links.
    for (const name of docPaths) {
      const source = utf8(files.get(name)!);
      try {
        for (const attachment of normativePaths(source)) await read(attachment);
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
    for (const name of docPaths) {
      try {
        documents.push(
          parseDocument(name, utf8(files.get(name)!), config, files),
        );
      } catch (error) {
        diagnostics.push(
          diagnostic(
            error instanceof Problem ? error.code : "PARSE_FAILURE",
            (error as Error).message,
            name,
            Number(/line (\d+)/.exec((error as Error).message)?.[1] ?? 1),
          ),
        );
      }
    }
    for (const name of durablePaths) {
      try {
        records.push({
          ...parseRecord(parseFrontMatter(utf8(files.get(name)!))),
          path: name,
        });
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
    if (!oid) {
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
      for (const [name, bytes] of files)
        if (
          bytesDigest(await readBounded(await safePath(this.root, name))) !==
          bytesDigest(bytes)
        )
          throw new Problem(
            4,
            "CAPTURE_CHANGED",
            `File changed during capture: ${name}`,
          );
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
    snapshot.diagnostics.sort(
      (a, b) =>
        a.file.localeCompare(b.file, "en") ||
        a.line - b.line ||
        a.code.localeCompare(b.code, "en"),
    );
    return snapshot;
  }
}
