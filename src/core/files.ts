import {
  lstat,
  realpath,
  readFile,
  readdir,
  mkdir,
  open,
  rename,
  unlink,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { minimatch } from "minimatch";
import { z } from "zod";
import { bytesDigest, relativePath, utf8, uuid, readSchema } from "./data.js";
import { FILE_LIMIT, Problem } from "./model.js";
import { checkpoint, atomic, cancellation, limits } from "./operations.js";

export async function safePath(
  root: string,
  relative: string,
): Promise<string> {
  if (!relativePath.safeParse(relative).success)
    throw new Problem(2, "PATH_UNSAFE", `Unsafe repository path: ${relative}`);
  const canonicalRoot = await realpath(root);
  let current = canonicalRoot;
  for (const part of relative.split("/")) {
    if (
      /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
      throw new Problem(
        2,
        "PATH_PORTABILITY",
        `Nonportable path component: ${part}`,
      );
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink())
        throw new Problem(
          2,
          "PATH_LINK",
          `Symlinks and junctions are not accepted: ${relative}`,
        );
      const actual = await realpath(current);
      const inside = path.relative(canonicalRoot, actual);
      if (inside.startsWith("..") || path.isAbsolute(inside))
        throw new Problem(
          2,
          "PATH_ESCAPE",
          `Path escapes repository: ${relative}`,
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return current;
}
export async function readBounded(
  file: string,
  limit = limits().fileBytes,
): Promise<Buffer> {
  cancellation();
  const handle = await open(
    file,
    constants.O_RDONLY |
      (process.platform === "win32" ? 0 : constants.O_NOFOLLOW),
  );
  try {
    const info = await handle.stat();
    if (!info.isFile())
      throw new Problem(
        2,
        "PATH_FILE_TYPE",
        `Expected a regular file: ${file}`,
      );
    const size = info.size;
    if (size > limit)
      throw new Problem(
        3,
        "LIMIT_FILE",
        `File exceeds ${limit} bytes: ${file}`,
      );
    const bytes = Buffer.alloc(size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== size)
      throw new Problem(
        4,
        "CAPTURE_CHANGED",
        `File changed during read: ${file}`,
      );
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// One capture shares parent checks, then verifies those parents before returning any data.
export class CapturePaths {
  private parents = new Map<string, Promise<{ dev: number; ino: number }>>();
  private canonicalRoot: Promise<string>;
  constructor(root: string) {
    this.canonicalRoot = realpath(root);
  }
  private async parent(relative: string): Promise<void> {
    if (!relative) return;
    let pending = this.parents.get(relative);
    if (!pending) {
      pending = (async () => {
        const parent = relative.includes("/")
          ? relative.slice(0, relative.lastIndexOf("/"))
          : "";
        await this.parent(parent);
        const root = await this.canonicalRoot;
        const file = path.join(root, relative);
        const info = await lstat(file);
        if (info.isSymbolicLink() || !info.isDirectory())
          throw new Problem(
            2,
            "PATH_LINK",
            `Unsafe capture directory: ${relative}`,
          );
        const actual = await realpath(file);
        const inside = path.relative(root, actual);
        if (inside.startsWith("..") || path.isAbsolute(inside))
          throw new Problem(
            2,
            "PATH_ESCAPE",
            `Capture directory escapes repository: ${relative}`,
          );
        return { dev: info.dev, ino: info.ino };
      })();
      this.parents.set(relative, pending);
    }
    await pending;
  }
  async resolve(relative: string): Promise<string> {
    if (
      !relativePath.safeParse(relative).success ||
      relative
        .split("/")
        .some(
          (p) =>
            /[. ]$/.test(p) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
        )
    )
      throw new Problem(
        2,
        "PATH_UNSAFE",
        `Unsafe or nonportable capture path: ${relative}`,
      );
    await this.parent(
      relative.includes("/")
        ? relative.slice(0, relative.lastIndexOf("/"))
        : "",
    );
    const file = path.join(await this.canonicalRoot, relative);
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile())
      throw new Problem(2, "PATH_LINK", `Unsafe capture file: ${relative}`);
    return file;
  }
  async verify(): Promise<void> {
    const root = await this.canonicalRoot;
    for (const [relative, pending] of this.parents) {
      const expected = await pending;
      const info = await lstat(path.join(root, relative));
      if (
        info.isSymbolicLink() ||
        !info.isDirectory() ||
        info.dev !== expected.dev ||
        info.ino !== expected.ino
      )
        throw new Problem(
          4,
          "CAPTURE_CHANGED",
          `Capture directory changed: ${relative}. Retry.`,
        );
    }
  }
}
export async function optionalBytes(file: string): Promise<Buffer | null> {
  try {
    return await readBounded(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function walk(
  root: string,
  relative = "",
  excluded = new Set([".git", "node_modules"]),
): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    if (excluded.has(entry.name)) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      result.push(rel);
      continue;
    }
    if (entry.isDirectory()) result.push(...(await walk(root, rel, excluded)));
    else if (entry.isFile()) result.push(rel);
    if (result.length > limits().files)
      throw new Problem(
        3,
        "LIMIT_FILES",
        `Repository inventory exceeds ${limits().files} files. Use an explicit --max-files override.`,
      );
  }
  return result.sort();
}
export interface WriteEntry {
  path: string;
  before: string | null;
  after: string | null;
}
export interface WritePlan {
  uid: string;
  repository: string;
  configPath: string;
  operation: string;
  guards: Record<string, string>;
  entries: WriteEntry[];
  state: "prepared" | "applying" | "completed";
  selection?: { include: string[]; exclude: string[]; recordsRoot: string };
  sourceGuards?: { path: string; digest: string }[];
}
const base64 = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const planSchema = z
  .object({
    uid: uuid,
    repository: z.string().min(1),
    configPath: relativePath,
    operation: z.string().min(1),
    guards: z.record(z.string().regex(/^[a-f0-9]{64}$/)),
    sourceGuards: z
      .array(
        z
          .object({
            path: z.string().min(1),
            digest: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .optional(),
    entries: z.array(
      z
        .object({
          path: relativePath,
          before: base64.nullable(),
          after: base64.nullable(),
        })
        .strict(),
    ),
    state: z.enum(["prepared", "applying", "completed"]),
    selection: z
      .object({
        include: z.array(z.string()),
        exclude: z.array(z.string()),
        recordsRoot: relativePath,
      })
      .strict()
      .optional(),
  })
  .strict();
export function parsePlan(value: unknown): WritePlan {
  return readSchema(planSchema, value);
}
export function entry(
  relative: string,
  before: Buffer | null,
  after: string | null,
): WriteEntry {
  return {
    path: relative,
    before: before?.toString("base64") ?? null,
    after: after === null ? null : Buffer.from(after).toString("base64"),
  };
}
const token = (bytes: Buffer | null) =>
  bytes === null ? null : bytesDigest(bytes);
async function durable(file: string, bytes: string | Buffer): Promise<void> {
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function replace(file: string, bytes: Buffer | null): Promise<void> {
  if (bytes === null) {
    await unlink(file);
    await syncDirectory(path.dirname(file));
    return;
  }
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await durable(temp, bytes);
  await rename(temp, file);
  await syncDirectory(path.dirname(file));
}
export class Writer {
  constructor(
    private root: string,
    private recordsRoot: string,
    private readOnly = false,
    private fault?: (phase: string, entry?: number) => void,
  ) {}
  async pending(): Promise<WritePlan[]> {
    const dir = await safePath(this.root, `${this.recordsRoot}/recovery`);
    try {
      const names = await readdir(dir);
      return Promise.all(
        names
          .filter((n) => n.endsWith(".json"))
          .map(async (n) => {
            const plan = parsePlan(
              JSON.parse(
                utf8(
                  await readBounded(
                    await safePath(
                      this.root,
                      `${this.recordsRoot}/recovery/${n}`,
                    ),
                    100 * 1024 * 1024,
                  ),
                ),
              ),
            );
            if (n !== `${plan.uid}.json`)
              throw new Problem(
                4,
                "RECOVERY_INVALID",
                "Journal filename and identity differ.",
              );
            return plan;
          }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  async apply(plan: WritePlan): Promise<void> {
    await checkpoint("Checking write plan");
    plan = parsePlan(plan);
    if (this.readOnly)
      throw new Problem(
        4,
        "READ_ONLY",
        "This session cannot write to the repository.",
      );
    if ((await this.pending()).length)
      throw new Problem(
        4,
        "RECOVERY_REQUIRED",
        "An unfinished journal exists. Run recover --action complete or rollback.",
      );
    const dir = await safePath(this.root, `${this.recordsRoot}/recovery`);
    await mkdir(dir, { recursive: true });
    const lockPath = path.join(dir, "writer.lock");
    let lock;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Problem(
          4,
          "WRITE_LOCKED",
          "Another writer or an interrupted writer holds the lock. Inspect doctor/recovery instructions.",
        );
      throw error;
    }
    try {
      await lock.writeFile(
        JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
      );
      await lock.sync();
      this.fault?.("locked");
      await this.preflight(plan);
      this.fault?.("preflight");
      cancellation();
      const journal = path.join(dir, `${plan.uid}.json`);
      await durable(journal, JSON.stringify(plan));
      await syncDirectory(dir);
      this.fault?.("prepared");
      atomic(true);
      plan.state = "applying";
      await replace(journal, Buffer.from(JSON.stringify(plan)));
      this.fault?.("applying");
      let entryIndex = 0;
      for (const e of plan.entries) {
        const file = await safePath(this.root, e.path);
        if (
          token(await optionalBytes(file)) !==
          token(e.before === null ? null : Buffer.from(e.before, "base64"))
        )
          throw new Problem(
            4,
            "WRITE_CONFLICT",
            `Concurrent edit at ${e.path}; journal retained.`,
          );
        await replace(
          file,
          e.after === null ? null : Buffer.from(e.after, "base64"),
        );
        this.fault?.("entry", entryIndex++);
      }
      plan.state = "completed";
      await replace(journal, Buffer.from(JSON.stringify(plan)));
      this.fault?.("completed");
      await unlink(journal);
      await syncDirectory(dir);
      this.fault?.("cleaned");
    } finally {
      atomic(false);
      await lock.close();
      await unlink(lockPath);
    }
  }
  private async preflight(plan: WritePlan): Promise<void> {
    for (const guard of plan.sourceGuards ?? []) {
      if (
        !path.isAbsolute(guard.path) ||
        bytesDigest(await readBounded(guard.path, 100 * 1024 * 1024)) !==
          guard.digest
      )
        throw new Problem(
          4,
          "IMPORT_SOURCE_CHANGED",
          "Explicit import source or mapping changed since preview.",
        );
    }
    if ((await realpath(plan.repository)) !== (await realpath(this.root)))
      throw new Problem(
        4,
        "PLAN_REPOSITORY",
        "Write plan belongs to another repository.",
      );
    if (
      new Set(plan.entries.map((e) => e.path.toLowerCase())).size !==
      plan.entries.length
    )
      throw new Problem(
        2,
        "PATH_COLLISION",
        "Write plan contains duplicate or case-colliding paths.",
      );
    if (plan.selection) {
      const selection = plan.selection;
      const governed = (p: string) =>
        p === plan.configPath ||
        (selection.include.some((pattern) =>
          minimatch(p, pattern, { dot: true, noext: true, nonegate: true }),
        ) &&
          !selection.exclude.some((pattern) =>
            minimatch(p, pattern, { dot: true, noext: true, nonegate: true }),
          )) ||
        (p.startsWith(`${selection.recordsRoot}/`) &&
          /^(reviews|assessments|evidence|changes|verification|impacts|baselines|migrations)\//.test(
            p.slice(selection.recordsRoot.length + 1),
          ));
      const expected = Object.keys(plan.guards).filter(governed).sort();
      const current = (await walk(this.root)).filter(governed).sort();
      if (JSON.stringify(expected) !== JSON.stringify(current))
        throw new Problem(
          4,
          "WRITE_CONFLICT",
          "Authoritative file inventory changed after preview.",
        );
    }
    for (const [relative, hash] of Object.entries(plan.guards)) {
      if (
        token(await optionalBytes(await safePath(this.root, relative))) !== hash
      )
        throw new Problem(
          4,
          "WRITE_CONFLICT",
          `Source changed since preview: ${relative}`,
        );
    }
    for (const e of plan.entries) {
      const file = await safePath(this.root, e.path);
      if (
        token(await optionalBytes(file)) !==
        token(e.before === null ? null : Buffer.from(e.before, "base64"))
      )
        throw new Problem(
          4,
          "WRITE_CONFLICT",
          `Target changed since preview: ${e.path}`,
        );
    }
  }
  async recover(action: "complete" | "rollback"): Promise<number> {
    await checkpoint("Checking recovery journal");
    if (this.readOnly)
      throw new Problem(
        4,
        "READ_ONLY",
        "Recovery requires an editable session.",
      );
    const pending = await this.pending();
    const dir = await safePath(this.root, `${this.recordsRoot}/recovery`);
    const lockPath = path.join(dir, "writer.lock");
    const oldLock = await optionalBytes(lockPath);
    if (oldLock) {
      const pid = JSON.parse(utf8(oldLock)).pid;
      if (!Number.isSafeInteger(pid) || pid < 1)
        throw new Problem(
          4,
          "RECOVERY_LOCK_INVALID",
          "Writer lock has an invalid process ID.",
        );
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
      }
      if (alive)
        throw new Problem(
          4,
          "WRITE_LOCKED",
          "The writer process is still running; recovery is refused.",
        );
      await unlink(lockPath);
    }
    await mkdir(dir, { recursive: true });
    const lock = await open(lockPath, "wx");
    try {
      for (const plan of pending) {
        if ((await realpath(plan.repository)) !== (await realpath(this.root)))
          throw new Problem(
            4,
            "PLAN_REPOSITORY",
            "Journal belongs to another repository.",
          );
        for (const e of plan.entries) {
          const current = token(
            await optionalBytes(await safePath(this.root, e.path)),
          );
          if (
            ![e.before, e.after]
              .map((b) => token(b === null ? null : Buffer.from(b, "base64")))
              .includes(current)
          )
            throw new Problem(
              4,
              "RECOVERY_CONFLICT",
              `Intervening external edit at ${e.path}; preserve it before manual reconciliation.`,
            );
        }
        for (const e of action === "rollback"
          ? [...plan.entries].reverse()
          : plan.entries) {
          const desired = action === "rollback" ? e.before : e.after;
          const file = await safePath(this.root, e.path);
          const current = await optionalBytes(file);
          const bytes =
            desired === null ? null : Buffer.from(desired, "base64");
          if (token(current) !== token(bytes)) await replace(file, bytes);
        }
        await unlink(path.join(dir, `${plan.uid}.json`));
      }
      return pending.length;
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
}
