import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixture, gitAt } from "./helpers";
import { migrate, exportReport } from "../src/core/interchange";
import { restoreArchive } from "../src/core/archive";
import { Repository } from "../src/core/repository";
import { Service } from "../src/core/service";
import { operations, defaultLimits } from "../src/core/operations";
import { CapturePaths } from "../src/core/files";
import { yaml } from "../src/core/data";

describe("remaining repository workflows", () => {
  it("resolves ordered amendment fields explicitly without deleting omitted historical requirements", async () => {
    const f = await fixture();
    const content = Buffer.from(
      JSON.stringify({
        layers: {
          original: [
            { id: "A", title: "Original", statement: "Original statement" },
            { id: "B", title: "Retained", statement: "Unamended statement" },
          ],
          amendment: [{ id: "A", statement: "Revised statement" }],
        },
      }),
    );
    const input = {
      source: "versions.json",
      format: "overlays",
      destination: "requirements/amended.md",
      mapping: {
        id: "id",
        title: "title",
        statement: "statement",
        order: ["original", "amendment"],
      },
    };
    const conflict = await migrate(
      f.service,
      { operation: "migrate", input, apply: true },
      content,
    );
    expect(conflict.exit_code).toBe(4);
    expect((conflict.data as { conflicts: unknown[] }).conflicts).toHaveLength(
      1,
    );
    expect((await f.repo.snapshot()).requirements).toHaveLength(0);
    const request = {
      operation: "migrate",
      input: {
        ...input,
        mapping: { ...input.mapping, overrides: ["statement"] },
      },
      apply: true,
    };
    await migrate(f.service, request, content);
    const s = await f.repo.snapshot();
    expect(s.requirements).toHaveLength(2);
    expect(s.requirements.find((r) => r.id === "A")!.markdown).toContain(
      "Revised statement",
    );
    expect(s.requirements.find((r) => r.id === "B")!.markdown).toContain(
      "Unamended statement",
    );
    const provenance = (
      s.requirements.find((r) => r.id === "A")!.metadata.extensions as Record<
        string,
        any
      >
    )["reqman.import"].field_provenance;
    expect(provenance).toEqual({
      id: "amendment",
      title: "original",
      statement: "amendment",
    });
    expect((await migrate(f.service, request, content)).data).toMatchObject({
      idempotent: true,
    });
  });

  it("imports multiline labeled blocks with deterministic identities", async () => {
    const f = await fixture();
    const request = {
      operation: "migrate",
      input: {
        source: "blocks.md",
        format: "labeled-blocks",
        destination: "requirements/blocks.md",
        mapping: {
          block_start: "Requirement:",
          id: "id",
          title: "title",
          statement: "statement",
          labels: { Title: "title", Statement: "statement" },
        },
      },
      apply: true,
    };
    const bytes = Buffer.from(
      "Introductory prose\nRequirement: R-1\nTitle: A labeled requirement\nStatement: The tool shall preserve\nall lines of this statement.\n",
    );
    await migrate(f.service, request, bytes);
    const r = (await f.repo.snapshot()).requirements[0];
    expect(r.markdown).toContain("preserve\nall lines");
    expect((await migrate(f.service, request, bytes)).data).toMatchObject({
      idempotent: true,
    });
  });

  it("restores all native identities and durable decisions only after verifying integrity", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.record("review.create", r.uid, { decision: "approved" });
    const archive = await exportReport(
      f.service,
      { operation: "export" },
      "portable",
    );
    const destination = await mkdtemp(path.join(tmpdir(), "reqman-restore-"));
    gitAt(destination, "init", "-q");
    const service = new Service(new Repository(destination));
    const corrupt = JSON.parse(archive.content);
    corrupt.files[0].content = Buffer.from("altered").toString("base64");
    await expect(
      restoreArchive(
        service,
        { operation: "restore", apply: true },
        Buffer.from(JSON.stringify(corrupt)),
      ),
    ).rejects.toThrow("Integrity mismatch");
    const preview = await restoreArchive(
      service,
      { operation: "restore" },
      Buffer.from(archive.content),
    );
    expect(preview.data).toMatchObject({
      applied: false,
      integrity_verified: true,
    });
    const plan = (preview.data as any).plan;
    await service.applySavedPlan(plan);
    const restored = await service.repository.snapshot();
    expect(restored.requirements[0].uid).toBe(r.uid);
    expect(restored.records[0].uid).toBe(
      (await f.repo.snapshot()).records[0].uid,
    );
    await expect(
      restoreArchive(
        service,
        { operation: "restore", apply: true },
        Buffer.from(archive.content),
      ),
    ).rejects.toThrow("overwrite");
  });

  it("copies explicitly selected binary evidence, retains historical bindings, and detects tampering", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.record("evidence.create", r.uid, {
      artifact: { repository: "sample", revision: "digest-A" },
      result: "passed",
      method: "inspection",
      location: "manual inspection",
    });
    const prior = (await f.repo.snapshot()).records[0];
    const bytes = Buffer.from([0, 255, 17, 0]);
    await f.service.execute({
      operation: "evidence.attach",
      target: prior.uid,
      input: {
        name: "inspection.bin",
        content: bytes.toString("base64"),
        actor: "Inspector",
        rationale: "Attach inspection capture",
      },
      apply: true,
    });
    const s = await f.repo.snapshot();
    const record = s.records.find((rec) => rec.supersedes.includes(prior.uid))!;
    expect(record.subjects).toEqual(prior.subjects);
    expect(record.attachments?.[0].size).toBe(4);
    const report = await exportReport(
      f.service,
      { operation: "export" },
      "portable",
    );
    expect(
      JSON.parse(report.content).files.find(
        (file: any) => file.path === record.attachments![0].path,
      ).content,
    ).toBe(bytes.toString("base64"));
    await writeFile(path.join(f.root, record.attachments![0].path), "tampered");
    expect(
      (await f.service.execute({ operation: "validate" })).diagnostics.some(
        (d) => d.code === "ATTACHMENT_INTEGRITY",
      ),
    ).toBe(true);
  });

  it("exports filtered matrices, gaps, and exact endpoint comparisons in every review format", async () => {
    const f = await fixture();
    const a = await f.add("A");
    const b = await f.add("B");
    await f.service.execute({
      operation: "requirement.edit",
      target: b.uid,
      input: {
        metadata: {
          ...b.metadata,
          relations: [{ type: "depends_on", target: a.uid }],
        },
      },
      apply: true,
    });
    const base = f.commit();
    await f.service.execute({
      operation: "requirement.edit",
      target: a.uid,
      input: { markdown: a.markdown + "\n\nRevision" },
      apply: true,
    });
    const matrix = JSON.parse(
      (
        await exportReport(
          f.service,
          { operation: "export", report: "matrix", query: "Requirement B" },
          "json",
        )
      ).content,
    );
    expect(matrix.data.rows).toHaveLength(1);
    expect(matrix.data.summary).toMatchObject({
      total: 1,
      denominator: 1,
      outside_selection: 1,
    });
    expect(matrix.data.rows[0].target).toBe(a.uid);
    const filtered = JSON.parse(
      (
        await exportReport(
          f.service,
          {
            operation: "export",
            report: "comparison",
            base,
            head: "WORKTREE",
            query: "Requirement B",
          },
          "json",
        )
      ).content,
    );
    expect(filtered.data.changes).toEqual([]);
    for (const report of ["matrix", "gaps", "comparison"] as const)
      for (const format of ["csv", "html", "markdown", "json"]) {
        const result = await exportReport(
          f.service,
          { operation: "export", report, base, head: "WORKTREE" },
          format,
        );
        expect(result.content).toContain(a.uid);
      }
  });

  it("reports located schema keys, rejects duplicate JSON-compatible YAML keys, and offers explicit current-format upgrades", async () => {
    const f = await fixture();
    await f.add();
    await f.writeSource(
      (await f.source()).replace("id: R-001", "id: invalid id"),
    );
    const result = await f.service.execute({ operation: "validate" });
    const finding = result.diagnostics.find(
      (d) => d.code === "SCHEMA_INVALID" && d.subject,
    )!;
    expect(finding.line).toBeGreaterThan(10);
    expect(finding.column).toBeGreaterThan(1);
    expect(() => yaml('{"actor":"A","actor":"B"}')).toThrow("Duplicate key");
    expect(() =>
      yaml(JSON.stringify({ a: '"x": {', b: { c: 1 } })),
    ).not.toThrow();
    const unsupported = await f.service.execute({ operation: "upgrade" });
    expect(unsupported.data).toMatchObject({
      compatible: true,
      upgraded: false,
    });
  });

  it("acknowledges cancellation before capture and honors explicit graph limits without accepting partial success", async () => {
    const f = await fixture();
    await f.add();
    await f.add("SECOND");
    const controller = new AbortController();
    controller.abort();
    const started = Date.now();
    await expect(
      operations.run(
        {
          signal: controller.signal,
          lastYield: Date.now(),
          progress: { stage: "Starting", atomic: false },
        },
        () => f.repo.snapshot(),
      ),
    ).rejects.toThrow("cancelled");
    expect(Date.now() - started).toBeLessThan(2000);
    const limited = await operations.run(
      {
        signal: new AbortController().signal,
        lastYield: Date.now(),
        progress: { stage: "Starting", atomic: false },
        limits: { ...defaultLimits, requirements: 1 },
      },
      () => f.service.execute({ operation: "validate" }),
    );
    expect(limited.exit_code).toBe(3);
    expect(limited.complete).toBe(false);
  });
});
