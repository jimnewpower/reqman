import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir, cpus, totalmem, platform, release } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { stringify } from "yaml";
import { Repository } from "../src/core/repository.js";
import { Service } from "../src/core/service.js";
import { config } from "../src/core/schema.js";
import { recordMarkdown, requirementBlock } from "../src/core/markdown.js";
import { C14N, TOOL_VERSION, subject } from "../src/core/model.js";
import { bytesDigest } from "../src/core/data.js";
import { compare } from "../src/core/compare.js";

const arg = (name: string, fallback: string) =>
  process.argv[process.argv.indexOf(name) + 1] ?? fallback;
const count = (name: string, fallback: number) =>
  process.argv.includes(name) ? Number(arg(name, String(fallback))) : fallback;
const git = (root: string, ...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
const percentile = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
async function timed<T>(fn: () => Promise<T>) {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

if (process.argv.includes("--cold-worker")) {
  const root = arg("--root", "");
  const cold = await timed(() => new Repository(root).snapshot());
  process.stdout.write(
    JSON.stringify({
      ms: cold.ms,
      rss: process.resourceUsage().maxRSS * 1024,
      requirements: cold.value.requirements.length,
      diagnostics: cold.value.diagnostics.length,
    }),
  );
} else {
  const root = await mkdtemp(path.join(tmpdir(), "reqman-benchmark-"));
  const project = randomUUID(),
    spec = randomUUID();
  git(root, "init", "-q");
  git(root, "config", "user.name", "Benchmark");
  git(root, "config", "user.email", "benchmark@example.invalid");
  git(root, "config", "core.autocrlf", "false");
  const cfg = config({
    format_version: 1,
    project: { uid: project, name: "Reference benchmark" },
    specifications: [{ uid: spec, code: "BENCH", title: "Reference fixture" }],
    documents: { include: ["requirements/**/*.md"] },
  });
  await writeFile(path.join(root, "requirements.yml"), stringify(cfg));
  await mkdir(path.join(root, "requirements"));
  await mkdir(path.join(root, ".requirements/reviews"), { recursive: true });
  const uids = Array.from({ length: 10000 }, () => randomUUID());
  for (let doc = 0; doc < 500; doc++) {
    const blocks = Array.from({ length: 20 }, (_, j) => {
      const i = doc * 20 + j;
      return requirementBlock(
        {
          uid: uids[i],
          id: `R-${i}`,
          lifecycle: "active",
          tags: [`group-${i % 10}`],
          relations: Array.from({ length: 5 }, (_, k) => ({
            type: "related_to",
            target: uids[(i + k + 1) % uids.length],
          })),
        },
        `## Requirement ${i}\n\n### Statement\n\nThe system shall preserve datum ${i} in group ${i % 10}.\n\n### Acceptance criteria\n\n- The datum is returned unchanged.`,
      );
    });
    await writeFile(
      path.join(root, `requirements/doc-${doc}.md`),
      `<!-- rms-document\n${stringify({ format_version: 1, uid: randomUUID(), specification: spec, title: `Document ${doc}`, context: "normative" })}-->\n\n${blocks.join("\n\n")}\n`,
    );
  }
  const definitions = await new Repository(root).snapshot();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 32 }, async () => {
      while (cursor < 20000) {
        const i = cursor++;
        const r = definitions.requirements[Math.floor(i / 2)];
        const uid = randomUUID();
        await writeFile(
          path.join(root, `.requirements/reviews/${uid}.md`),
          recordMarkdown({
            format_version: 1,
            uid,
            kind: "review",
            created_at: "2026-09-29T00:00:00Z",
            actor: `Reviewer ${i % 2}`,
            subjects: [subject(r)],
            dependencies: [],
            scope: "project",
            rationale: "Reference fixture review",
            decision: "approved",
            supersedes: [],
            evidence: [],
            obligations: [],
            provenance: "synthetic",
          }),
        );
      }
    }),
  );
  git(root, "add", ".");
  git(root, "commit", "-qm", "Reference fixture");
  const base = git(root, "rev-parse", "HEAD");
  const runs = count("--runs", 20),
    edits = count("--edits", 20),
    queries = count("--queries", 100);
  const cold: number[] = [],
    rss: number[] = [];
  for (let i = 0; i < runs; i++) {
    const output = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/benchmark.ts",
        "--cold-worker",
        "--root",
        root,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (output.status) throw new Error(output.stderr);
    const result = JSON.parse(output.stdout);
    if (result.diagnostics || result.requirements !== 10000)
      throw new Error("Invalid benchmark fixture");
    cold.push(result.ms);
    rss.push(result.rss);
    process.stderr.write(
      `Cold inventory ${i + 1}/${runs}: ${Math.round(result.ms)} ms\n`,
    );
  }
  const repository = new Repository(root),
    service = new Service(repository);
  const inventory = await repository.snapshot();
  const textBytes = [...inventory.files.values()].reduce(
    (total, bytes) => total + bytes.length,
    0,
  );
  await service.execute({ operation: "search", indexed: true, limit: 50 });
  const queryTimes: number[] = [];
  for (let i = 0; i < queries; i++)
    queryTimes.push(
      (
        await timed(async () =>
          JSON.stringify(
            await service.execute({
              operation: "search",
              indexed: true,
              query: `group ${i % 10}`,
              limit: 50,
            }),
          ),
        )
      ).ms,
    );
  const editTimes: number[] = [];
  const document = path.join(root, "requirements/doc-0.md");
  const original = await readFile(document, "utf8");
  for (let i = 0; i < edits; i++) {
    await writeFile(
      document,
      original.replace("datum 0 in", `datum 0 revision ${i} in`),
    );
    editTimes.push(
      (await timed(() => repository.reindexDocument("requirements/doc-0.md")))
        .ms,
    );
    process.stderr.write(
      `Warm document ${i + 1}/${edits}: ${Math.round(editTimes.at(-1)!)} ms\n`,
    );
  }
  await writeFile(document, original);
  const inventoryRss = Math.max(...rss, process.resourceUsage().maxRSS * 1024);
  for (let doc = 0; doc < 50; doc++) {
    const p = path.join(root, `requirements/doc-${doc}.md`);
    await writeFile(
      p,
      (await readFile(p, "utf8")).replaceAll("shall preserve", "shall retain"),
    );
  }
  git(root, "add", ".");
  git(root, "commit", "-qm", "Change 1000 requirements");
  const head = git(root, "rev-parse", "HEAD");
  const comparison: number[] = [];
  for (let i = 0; i < runs; i++) {
    const repo = new Repository(root);
    const result = await timed(async () =>
      compare(await repo.snapshot(base), await repo.snapshot(head)),
    );
    if (result.value.changes.length !== 1000)
      throw new Error("Incorrect comparison fixture");
    comparison.push(result.ms);
    process.stderr.write(
      `Comparison ${i + 1}/${runs}: ${Math.round(result.ms)} ms\n`,
    );
  }
  const report = {
    schema_version: 1,
    timestamp: new Date().toISOString(),
    tool: TOOL_VERSION,
    source: {
      commit: git(process.cwd(), "rev-parse", "HEAD"),
      dirty: Boolean(git(process.cwd(), "status", "--porcelain")),
      benchmark_sha256: bytesDigest(await readFile("scripts/benchmark.ts")),
      lockfile_sha256: bytesDigest(await readFile("package-lock.json")),
    },
    canonicalization: C14N,
    environment: {
      os: `${platform()} ${release()}`,
      cpu: cpus()[0].model,
      cores: cpus().length,
      memory_bytes: totalmem(),
      node: process.version,
      git: git(root, "--version"),
      storage: process.argv.includes("--storage")
        ? arg("--storage", "")
        : "Unspecified local filesystem; record the storage model before an acceptance claim",
      cache:
        "Fresh Node process and no Reqman index for cold runs; OS filesystem cache is retained. Explicit incremental document events for warm edits.",
    },
    fixture: {
      root,
      requirements: 10000,
      documents: 500,
      links: 50000,
      records: 20000,
      changed: 1000,
      text_bytes: textBytes,
    },
    samples: { cold, queries: queryTimes, edits: editTimes, comparison },
    p95_ms: {
      cold: percentile(cold),
      query: percentile(queryTimes),
      edit: percentile(editTimes),
      comparison: percentile(comparison),
    },
    max_rss_bytes: inventoryRss,
    max_process_rss_bytes: process.resourceUsage().maxRSS * 1024,
    full_sample_counts: runs === 20 && edits === 20 && queries === 100,
  };
  const output = process.argv.includes("--output")
    ? arg("--output", "")
    : path.join(root, "benchmark.json");
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(`Benchmark report: ${output}\n`);
}
