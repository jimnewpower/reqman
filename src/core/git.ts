import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { Problem } from "./model.js";
import { operations, cancellation, limits } from "./operations.js";
const execute = promisify(execFile);
function environment() {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_")) delete env[key];
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_NO_LAZY_FETCH: "1",
  };
}
const safeArguments = (root: string, args: string[]) => [
  "--no-pager",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.hooksPath=",
  "-c",
  "core.quotePath=false",
  "-c",
  "protocol.allow=never",
  "-C",
  root,
  ...args,
];
export async function git(
  root: string,
  args: string[],
  inputLimit = 100 * 1024 * 1024,
): Promise<Buffer> {
  try {
    const result = await execute("git", safeArguments(root, args), {
      env: environment(),
      encoding: "buffer",
      maxBuffer: inputLimit,
      timeout: 30000,
      windowsHide: true,
      signal: operations.getStore()?.signal,
    });
    return result.stdout;
  } catch (error) {
    cancellation();
    const message = error instanceof Error ? error.message : String(error);
    throw new Problem(
      3,
      "GIT_UNAVAILABLE",
      `Git operation ${args[0]} failed; required objects may be missing. No fetch was attempted. ${message.slice(0, 400)}`,
    );
  }
}
export async function blobs(root: string, oids: string[]): Promise<Buffer[]> {
  cancellation();
  if (!oids.length) return [];
  const child = spawn("git", safeArguments(root, ["cat-file", "--batch"]), {
    env: environment(),
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const output: Buffer[] = [];
  let size = 0;
  let exhausted = false;
  const timeout = setTimeout(() => child.kill(), 30000);
  const signal = operations.getStore()?.signal;
  const abort = () => child.kill();
  signal?.addEventListener("abort", abort, { once: true });
  child.stderr.resume();
  child.stdout.on("data", (b: Buffer) => {
    size += b.length;
    if (size > limits().snapshotBytes + 10 * 1024 * 1024) {
      exhausted = true;
      child.kill();
    } else output.push(b);
  });
  const completion = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) {
        reject(new Problem(130, "OPERATION_CANCELLED", "Git read cancelled."));
        return;
      }
      code === 0 && !exhausted
        ? resolve()
        : reject(
            new Problem(
              3,
              exhausted ? "LIMIT_SNAPSHOT" : "GIT_UNAVAILABLE",
              "Git batch read failed or exceeded the 110 MiB snapshot limit. No fetch was attempted.",
            ),
          );
    });
  });
  child.stdin.on("error", () => {
    /* The process close event reports a failed batch. */
  });
  child.stdin.end(oids.join("\n") + "\n");
  await completion;
  const buffer = Buffer.concat(output);
  const result: Buffer[] = [];
  let offset = 0;
  for (const oid of oids) {
    const end = buffer.indexOf(10, offset);
    const header = buffer.toString("utf8", offset, end).split(" ");
    if (end < 0 || header[0] !== oid || header[1] !== "blob")
      throw new Problem(
        3,
        "GIT_OBJECT_MISSING",
        `Required blob unavailable: ${oid}`,
      );
    const length = Number(header[2]);
    if (
      !Number.isSafeInteger(length) ||
      length > limits().fileBytes ||
      length < 0 ||
      end + length + 1 >= buffer.length
    )
      throw new Problem(
        3,
        "LIMIT_FILE",
        "Blob exceeds the 10 MiB file limit or is incomplete.",
      );
    result.push(buffer.subarray(end + 1, end + 1 + length));
    offset = end + length + 2;
  }
  return result;
}
export async function gitText(root: string, args: string[]): Promise<string> {
  return (await git(root, args)).toString("utf8").trim();
}
export async function commit(root: string, ref: string): Promise<string> {
  if (!ref || ref.startsWith("-") || ref === "INDEX")
    throw new Problem(
      2,
      "GIT_REFERENCE",
      "Provide a commit reference; INDEX is not supported.",
    );
  return gitText(root, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`,
  ]);
}
export async function treeFiles(
  root: string,
  oid: string,
): Promise<Map<string, { mode: string; oid: string }>> {
  const raw = await git(root, ["ls-tree", "-rz", "--full-tree", oid]);
  return new Map(
    raw
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const tab = line.indexOf("\t");
        const [mode, , id] = line.slice(0, tab).split(" ");
        return [line.slice(tab + 1), { mode, oid: id }];
      }),
  );
}
