import { describe, it, expect } from "vitest";
import { writeFile, readFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalMarkdown } from "../src/core/markdown";
import { bytesDigest, digest, yaml } from "../src/core/data";
import { projection } from "../src/core/decisions";
import { compare, impact } from "../src/core/compare";
import { safePath, Writer, type WritePlan } from "../src/core/files";
import { Repository } from "../src/core/repository";
import { fixture, gitAt } from "./helpers";

describe("format and canonicalization", () => {
  it("rejects duplicate keys, aliases, tags and unsafe numeric metadata", () => {
    for (const source of [
      "a: 1\na: 2",
      "a: &a value\nb: *a",
      "a: !!str value",
      "a: 9007199254740993",
    ])
      expect(() => yaml(source)).toThrow();
    expect(yaml("date: 2026-09-29")).toEqual({ date: "2026-09-29" });
  });
  it("normalizes soft wraps, line endings, bullet markers and relative headings", () => {
    const a =
      "## Title\n\n### Statement\n\nA soft\nwrapped statement.\n\n- one\n- two";
    const b =
      "# Title\r\n\r\n## Statement\r\n\r\nA soft wrapped statement.\r\n\r\n* one\r\n* two";
    expect(digest(canonicalMarkdown(a, true))).toBe(
      digest(canonicalMarkdown(b, true)),
    );
    expect(digest(canonicalMarkdown("A  \nb"))).not.toBe(
      digest(canonicalMarkdown("A\nb")),
    );
    expect(digest(canonicalMarkdown("```\na b\n```"))).not.toBe(
      digest(canonicalMarkdown("```\na  b\n```")),
    );
    expect(digest(canonicalMarkdown("[a][x]\n\n[x]: /one"))).not.toBe(
      digest(canonicalMarkdown("[a][x]\n\n[x]: /two")),
    );
  });
  it("ignores fenced marker examples, recognizes actual blocks and locates malformed blocks", async () => {
    const f = await fixture();
    const r = await f.add();
    const source = await f.source();
    await f.writeSource(
      `${source}\n\n\`\`\`markdown\n<!-- rms-requirement\ninvalid: true\n-->\n\`\`\`\n`,
    );
    const s = await f.repo.snapshot();
    expect(s.requirements).toHaveLength(1);
    expect(s.diagnostics).toEqual([]);
    await f.writeSource(source.replace("<!-- /rms-requirement -->", ""));
    const broken = await f.repo.snapshot();
    expect(broken.diagnostics[0].code).toBe("BLOCK_UNCLOSED");
    expect(broken.diagnostics[0].line).toBe(r.line);
  });
  it("requires statements, rejects unknown fields and flags duplicate identities", async () => {
    const f = await fixture();
    const r = await f.add();
    await expect(
      f.service.execute({
        operation: "requirement.add",
        input: { id: "R-002", markdown: "## Missing statement" },
        apply: true,
      }),
    ).rejects.toThrow("Statement");
    await f.writeSource(`${await f.source()}\n\n${r.raw}\n`);
    expect(
      (await f.repo.snapshot()).diagnostics.some(
        (d) => d.code === "IDENTITY_DUPLICATE",
      ),
    ).toBe(true);
  });
});
describe("authoring, decisions and graph semantics", () => {
  it("retains identity and approval through renumbering and marks definition edits stale", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.record("review.create", r.uid, { decision: "approved" });
    let s = await f.repo.snapshot();
    expect(projection(s, s.requirements[0]).approval).toBe("approved");
    await f.service.execute({
      operation: "requirement.renumber",
      target: r.uid,
      input: { id: "R-NEW" },
      apply: true,
    });
    s = await f.repo.snapshot();
    expect(s.requirements[0].uid).toBe(r.uid);
    expect(s.requirements[0].definition).toBe(r.definition);
    expect(projection(s, s.requirements[0]).approval).toBe("approved");
    await f.service.execute({
      operation: "requirement.edit",
      target: r.uid,
      input: { markdown: r.markdown.replace("preserve", "retain and export") },
      apply: true,
    });
    s = await f.repo.snapshot();
    expect(projection(s, s.requirements[0])).toMatchObject({
      approval: "unreviewed",
      currency: "needs_review",
    });
    expect(projection(s, s.requirements[0]).records[0].decision).toBe(
      "approved",
    );
  });
  it("shows contradictory records regardless of timestamp and reconciles explicitly", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.record("review.create", r.uid, {
      decision: "approved",
      created_at: "2026-09-29T12:00:00Z",
    });
    await f.record("review.create", r.uid, {
      decision: "rejected",
      created_at: "2000-01-01T00:00:00Z",
    });
    let s = await f.repo.snapshot();
    expect(projection(s, s.requirements[0]).approval).toBe("conflicted");
    await f.record("review.create", r.uid, {
      decision: "approved",
      supersedes: s.records.map((r) => r.uid),
    });
    s = await f.repo.snapshot();
    expect(projection(s, s.requirements[0]).approval).toBe("approved");
    expect(s.records).toHaveLength(3);
  });
  it("keeps revocations effective after a textual revert", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.record("review.create", r.uid, { decision: "approved" });
    const approval = (await f.repo.snapshot()).records[0];
    await f.service.execute({
      operation: "requirement.edit",
      target: r.uid,
      input: { markdown: r.markdown + "\n\nMore obligations." },
      apply: true,
    });
    await f.record("review.create", r.uid, {
      decision: "revoked",
      supersedes: [approval.uid],
    });
    await f.service.execute({
      operation: "requirement.edit",
      target: r.uid,
      input: { markdown: r.markdown },
      apply: true,
    });
    const s = await f.repo.snapshot();
    expect(projection(s, s.requirements[0]).approval).toBe("unreviewed");
  });
  it("captures upstream impact and rejects cycles before a write", async () => {
    const f = await fixture();
    const parent = await f.add("P-001");
    const child = await f.add("C-001");
    await f.service.execute({
      operation: "requirement.edit",
      target: child.uid,
      input: {
        metadata: { relations: [{ type: "depends_on", target: parent.uid }] },
      },
      apply: true,
    });
    await f.record("review.create", child.uid, { decision: "approved" });
    const before = await f.repo.snapshot();
    await expect(
      f.service.execute({
        operation: "requirement.edit",
        target: parent.uid,
        input: {
          metadata: { relations: [{ type: "depends_on", target: child.uid }] },
        },
        apply: true,
      }),
    ).rejects.toThrow("cycle");
    await f.service.execute({
      operation: "requirement.edit",
      target: parent.uid,
      input: { markdown: parent.markdown + "\n\nAdditional condition." },
      apply: true,
    });
    const after = await f.repo.snapshot();
    const c = after.requirements.find((r) => r.uid === child.uid)!;
    expect(projection(after, c).currency).toBe("needs_review");
    expect(impact(before, after).affected[0].path).toEqual([
      parent.uid,
      child.uid,
    ]);
  });
  it("does not inherit decisions on clones and requires retirement reasons", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.record("review.create", r.uid, { decision: "approved" });
    await f.service.execute({
      operation: "requirement.clone",
      target: r.uid,
      input: { id: "R-002" },
      apply: true,
    });
    const s = await f.repo.snapshot();
    const clone = s.requirements.find((x) => x.id === "R-002")!;
    expect(clone.uid).not.toBe(r.uid);
    expect(projection(s, clone).approval).toBe("unreviewed");
    await expect(
      f.service.execute({
        operation: "requirement.retire",
        target: r.uid,
        input: {},
        apply: true,
      }),
    ).rejects.toThrow();
  });
  it("preserves unrelated bytes and CRLF and refuses a stale UI save", async () => {
    const f = await fixture();
    const r = await f.add();
    const source = (await f.source()).replace(/\n/g, "\r\n");
    await f.writeSource(source);
    const current = (await f.repo.snapshot()).requirements[0];
    const token = bytesDigest(Buffer.from(source));
    await f.service.execute({
      operation: "requirement.renumber",
      target: r.uid,
      input: { id: "R-NEW", fileToken: token },
      apply: true,
    });
    const changed = await f.source();
    expect(changed.slice(0, current.start)).toBe(
      source.slice(0, current.start),
    );
    expect(changed.replaceAll("\r\n", "")).not.toContain("\n");
    await expect(
      f.service.execute({
        operation: "requirement.edit",
        target: r.uid,
        input: { markdown: current.markdown, fileToken: token },
        apply: true,
      }),
    ).rejects.toThrow("changed since");
  });
});
describe("Git snapshots, baselines and safe writes", () => {
  it("reads commits with their own selection and leaves the index unchanged", async () => {
    const f = await fixture();
    const r = await f.add();
    const a = f.commit();
    const indexBefore = bytesDigest(
      await readFile(path.join(f.root, ".git/index")),
    );
    await f.service.execute({
      operation: "requirement.renumber",
      target: r.uid,
      input: { id: "R-NEW" },
      apply: true,
    });
    const original = await f.repo.snapshot(a);
    expect(original.requirements[0].id).toBe("R-001");
    expect(bytesDigest(await readFile(path.join(f.root, ".git/index")))).toBe(
      indexBefore,
    );
    const configPath = path.join(f.root, "requirements.yml");
    const configText = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      configText.replace("exclude: []", "exclude: [requirements/**]"),
    );
    const head = await f.repo.snapshot();
    expect(compare(original, head).removals).toEqual([r.uid]);
  });
  it("pins baselines before their manifest commit and reads bare repositories", async () => {
    const f = await fixture();
    await f.add();
    const a = f.commit("Definitions");
    await f.service.execute({
      operation: "baseline.create",
      input: { name: "release-1", target: a, actor: "Owner" },
      apply: true,
    });
    f.commit("Baseline manifest");
    const baseline = await f.repo.snapshot("baseline:release-1");
    expect(baseline.info.objectId).toBe(a);
    expect(baseline.baselines).toHaveLength(0);
    const bare = path.join(f.root, "bare.git");
    gitAt(f.root, "clone", "--bare", "-q", f.root, bare);
    const snapshot = await new Repository(bare).snapshot(a);
    expect(snapshot.requirements).toHaveLength(1);
  });
  it("detects preview conflicts and safely rolls back an interrupted multi-file plan", async () => {
    const f = await fixture();
    const r = await f.add();
    const result = await f.service.execute({
      operation: "requirement.renumber",
      target: r.uid,
      input: { id: "NEXT" },
    });
    const plan = (result.data as { plan: WritePlan }).plan;
    await f.writeSource((await f.source()) + "\nExternal edit.");
    await expect(f.service.applySavedPlan(plan)).rejects.toThrow("changed");
    const before = await f.source();
    const dir = path.join(f.root, ".requirements/recovery");
    await mkdir(dir, { recursive: true });
    const interrupted: WritePlan = {
      ...plan,
      uid: randomUUID(),
      state: "applying",
      guards: {},
      entries: [
        {
          path: "requirements/main.md",
          before: Buffer.from(before).toString("base64"),
          after: Buffer.from(before + "\nPartial change.").toString("base64"),
        },
      ],
    };
    await writeFile(
      path.join(dir, `${interrupted.uid}.json`),
      JSON.stringify(interrupted),
    );
    await f.writeSource(before + "\nPartial change.");
    await expect(f.repo.snapshot()).rejects.toThrow("interrupted");
    await new Writer(f.root, ".requirements").recover("rollback");
    expect(await f.source()).toBe(before);
  });
  it("rejects path escapes and all writes in read-only sessions", async () => {
    const f = await fixture();
    const r = await f.add();
    await expect(safePath(f.root, "../outside.md")).rejects.toThrow();
    await expect(safePath(f.root, ".git/config")).rejects.toThrow();
    f.repo.readOnly = true;
    await expect(
      f.service.execute({
        operation: "requirement.renumber",
        target: r.uid,
        input: { id: "NEXT" },
        apply: true,
      }),
    ).rejects.toThrow("editable");
    expect((await f.repo.snapshot()).requirements[0].id).toBe(r.id);
  });
});
