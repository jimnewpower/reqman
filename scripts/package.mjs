import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

const output = path.resolve("release-artifacts");
await mkdir(output, { recursive: true });
if (!process.env.npm_execpath)
  throw new Error("Run npm run package to supply the npm runtime.");
const packed = JSON.parse(
  execFileSync(
    process.execPath,
    [process.env.npm_execpath, "pack", "--json", "--pack-destination", output],
    { encoding: "utf8", windowsHide: true },
  ),
)[0];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const sourceFiles = git([
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
])
  .split("\0")
  .filter(Boolean);
const source = [];
for (const file of sourceFiles)
  source.push({ path: file, sha256: sha256(await readFile(file)) });
const provenance = {
  schema_version: 1,
  name: packed.name,
  version: packed.version,
  created_at: new Date().toISOString(),
  artifact: packed.filename,
  artifact_sha256: sha256(await readFile(path.join(output, packed.filename))),
  commit: git(["rev-parse", "HEAD"]),
  dirty: Boolean(git(["status", "--porcelain"])),
  source_files: source,
  lockfile_sha256: sha256(await readFile("package-lock.json")),
  node: process.version,
  npm: process.env.npm_config_user_agent ?? "unavailable",
  platform: process.platform,
  build: "npm ci; npm run package",
  external_runtime:
    "Node.js and Git; no self-update or background installation",
};
const inventory = {
  schema_version: 1,
  name: lock.name,
  version: lock.version,
  packages: Object.entries(lock.packages)
    .filter(([key]) => key)
    .map(([key, value]) => ({
      path: key,
      version: value.version,
      license: value.license ?? "see package",
      integrity: value.integrity,
      resolved: value.resolved,
      development: Boolean(value.dev),
    })),
};
await writeFile(
  path.join(output, "provenance.json"),
  JSON.stringify(provenance, null, 2) + "\n",
);
await writeFile(
  path.join(output, "dependency-inventory.json"),
  JSON.stringify(inventory, null, 2) + "\n",
);
const checksums = [];
for (const name of [
  packed.filename,
  "provenance.json",
  "dependency-inventory.json",
])
  checksums.push(`${sha256(await readFile(path.join(output, name)))}  ${name}`);
await writeFile(path.join(output, "SHA256SUMS"), checksums.join("\n") + "\n");
process.stdout.write(
  `Package, checksums, source provenance and dependency inventory: ${output}\n`,
);
