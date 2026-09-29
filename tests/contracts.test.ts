import { describe, expect, it } from "vitest";
import { readFile, writeFile, mkdir, symlink } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fixture, gitAt } from "./helpers";
import { digest, utf8 } from "../src/core/data";
import { canonicalMarkdown } from "../src/core/markdown";
import { Repository } from "../src/core/repository";
import { Service } from "../src/core/service";
import { Writer, type WritePlan } from "../src/core/files";

describe("documented contracts", () => {
  it("invalidates definitions when a document-level reference link target changes", async () => {
    const f = await fixture();
    await f.add("LINK-1", "The system shall follow [the contract][governing].");
    await f.writeSource(
      (await f.source()) + "\n[governing]: https://example.invalid/first\n",
    );
    const before = await f.repo.snapshot();
    await f.writeSource(
      (await f.source()).replace(
        "https://example.invalid/first",
        "https://example.invalid/second",
      ),
    );
    const after = await f.repo.snapshot();
    expect(before.requirements[0].definition).not.toBe(
      after.requirements[0].definition,
    );
  });
  it("rejects a review opened before an external document change", async () => {
    const f = await fixture();
    const r = await f.add();
    const opened = await f.service.execute({
      operation: "show",
      target: r.uid,
    });
    const fileToken = (opened.data as { fileToken: string }).fileToken;
    await f.writeSource((await f.source()) + "\nChanged governing context.");
    await expect(
      f.record("review.create", r.uid, { decision: "approved", fileToken }),
    ).rejects.toThrow("changed after opening");
    expect((await f.repo.snapshot()).records).toHaveLength(0);
  });
  it("revalidates explicitly selected import sources when replaying a plan", async () => {
    const f = await fixture();
    const source = path.join(f.root, "source.csv");
    const mapping = path.join(f.root, "mapping.json");
    const plan = path.join(f.root, "import-plan.json");
    await writeFile(
      source,
      "id,title,statement\nLEG-1,Imported,The system shall preserve data.\n",
    );
    await writeFile(
      mapping,
      JSON.stringify({
        source: "source.csv",
        destination: "requirements/imported.md",
        format: "csv",
      }),
    );
    const run = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli.ts",
          "--repo",
          f.root,
          "--format",
          "json",
          ...args,
        ],
        { encoding: "utf8", windowsHide: true },
      );
    const preview = run(
      "migrate",
      "--source",
      source,
      "--input",
      mapping,
      "--plan-output",
      plan,
    );
    expect(preview.status).toBe(0);
    await writeFile(
      source,
      "id,title,statement\nLEG-1,Changed,Changed after preview.\n",
    );
    const applied = run("apply-plan", "--input", plan, "--apply");
    expect(applied.status).toBe(4);
    expect(JSON.parse(applied.stdout).diagnostics[0].code).toBe(
      "IMPORT_SOURCE_CHANGED",
    );
    expect((await f.repo.snapshot()).requirements).toHaveLength(0);
  });
  it("matches the published canonical trees and SHA-256 fixtures", async () => {
    const fixture = JSON.parse(
      await readFile("tests/fixtures/canonicalization.json", "utf8"),
    );
    for (const vector of fixture.vectors) {
      const tree = canonicalMarkdown(vector.markdown, true);
      expect(tree).toEqual(vector.canonical);
      expect(digest(tree)).toBe(vector.sha256);
    }
  });
  it("moves and splits identities with explicit succession and valid graph targets", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.service.execute({
      operation: "document.add",
      input: { path: "requirements/second.md", metadata: { title: "Second" } },
      apply: true,
    });
    await f.service.execute({
      operation: "requirement.move",
      target: r.uid,
      input: { document: "requirements/second.md" },
      apply: true,
    });
    expect((await f.repo.snapshot()).requirements[0]).toMatchObject({
      uid: r.uid,
      path: "requirements/second.md",
      definition: r.definition,
    });
    await f.service.execute({
      operation: "requirement.split",
      target: r.uid,
      input: {
        reason: "Separate responsibilities",
        successors: [
          {
            metadata: { id: "CHILD-1" },
            markdown: "## First\n\n### Statement\n\nFirst obligation.",
          },
          {
            metadata: { id: "CHILD-2" },
            markdown: "## Second\n\n### Statement\n\nSecond obligation.",
          },
        ],
      },
      apply: true,
    });
    const s = await f.repo.snapshot();
    expect(s.requirements).toHaveLength(3);
    expect(s.requirements.find((x) => x.uid === r.uid)?.lifecycle).toBe(
      "retired",
    );
    for (const child of s.requirements.filter((x) => x.uid !== r.uid))
      expect(child.relations).toEqual([{ type: "supersedes", target: r.uid }]);
  });
  it("reads linked worktrees, detached HEAD and SHA-256 object repositories", async () => {
    const f = await fixture();
    const r = await f.add();
    const oid = f.commit();
    const worktree = path.join(f.root, "linked-worktree");
    gitAt(f.root, "worktree", "add", "--detach", "-q", worktree, oid);
    const linked = await new Repository(worktree).snapshot("HEAD");
    expect(linked.requirements[0].uid).toBe(r.uid);
    expect(gitAt(f.root, "rev-parse", "HEAD")).toBe(oid);
    const shaRoot = path.join(f.root, "sha256-fixture");
    await mkdir(shaRoot);
    gitAt(shaRoot, "init", "--object-format=sha256", "-q");
    gitAt(shaRoot, "config", "user.name", "Fixture");
    gitAt(shaRoot, "config", "user.email", "fixture@example.invalid");
    const repo = new Repository(shaRoot);
    const service = new Service(repo);
    await service.execute({ operation: "init", apply: true });
    gitAt(shaRoot, "add", "requirements.yml", "requirements");
    gitAt(shaRoot, "commit", "-qm", "SHA256 snapshot");
    const snapshot = await repo.snapshot("HEAD");
    expect(snapshot.info.objectId).toHaveLength(64);
  });
  it("guards newly arrived decisions after a preview and rejects altered recovery targets", async () => {
    const f = await fixture();
    const r = await f.add();
    const result = await f.service.execute({
      operation: "requirement.renumber",
      target: r.uid,
      input: { id: "NEW" },
    });
    const plan = (result.data as { plan: WritePlan }).plan;
    await f.record("review.create", r.uid, { decision: "approved" });
    await expect(f.service.applySavedPlan(plan)).rejects.toThrow(
      "inventory changed",
    );
    const pending = { ...plan, uid: randomUUID(), state: "applying" };
    await writeFile(
      path.join(f.root, ".requirements/recovery", `${pending.uid}.json`),
      JSON.stringify(pending),
    );
    await f.writeSource((await f.source()) + "\nUnrelated external edit.");
    await expect(
      new Writer(f.root, ".requirements").recover("rollback"),
    ).rejects.toThrow("Intervening");
    expect(await f.source()).toContain("Unrelated external edit.");
  });
  it("treats unsafe metadata examples as literals and real normative files as dependencies", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.writeSource(
      (await f.source()) +
        "\n```yaml\n<!-- rms-requirement\nnormative_files: [../../outside]\nvalue: &a test\n-->\n```\n",
    );
    expect((await f.repo.snapshot()).diagnostics).toEqual([]);
    await writeFile(path.join(f.root, "governing.txt"), "v1");
    await f.writeSource(
      (await f.source()).replace(
        "context: normative",
        "context: normative\nnormative_files: [governing.txt]",
      ),
    );
    const a = await f.repo.snapshot();
    await writeFile(path.join(f.root, "governing.txt"), "v2");
    const b = await f.repo.snapshot();
    expect(a.requirements[0].definition).toBe(b.requirements[0].definition);
    expect(a.requirements[0].governance).not.toBe(b.requirements[0].governance);
  });
  it("returns one JSON result and meaningful exit codes through the actual CLI", async () => {
    const f = await fixture();
    await f.add();
    const run = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli.ts",
          "--repo",
          f.root,
          "--format",
          "json",
          ...args,
        ],
        { encoding: "utf8", windowsHide: true },
      );
    const success = run("list");
    expect(success.status).toBe(0);
    expect(JSON.parse(success.stdout).data.requirements).toHaveLength(1);
    const missing = run("show", "NOT-FOUND");
    expect(missing.status).toBe(2);
    expect(JSON.parse(missing.stdout).complete).toBe(false);
    const exportSource = run(
      "export",
      "--type",
      "json",
      "--output",
      path.join(f.root, "requirements.yml"),
      "--overwrite",
    );
    expect(exportSource.status).toBe(4);
    const source = await f.source();
    await f.writeSource(source.replace("### Statement", "### No statement"));
    const invalid = run("validate");
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).diagnostics[0].file).toBe(
      "requirements/main.md",
    );
  });
});
