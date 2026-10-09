import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fixture } from "./helpers";
import { migrate } from "../src/core/interchange";
import type { WritePlan } from "../src/core/files";

const input = {
  source: "ledger.csv",
  format: "csv",
  group_by: "spec",
  destination_root: "requirements/imported",
  mapping: {
    id: "id",
    title: "id",
    statement: "text",
    disposition: "status",
    reason: "reason",
    dispositions: {
      ACTIVE: "in_scope",
      DEFERRED: "deferred",
      NOT_APPLICABLE: "not_applicable",
      TRANSFERRED: "transferred",
    },
  },
};
const bytes = Buffer.from(
  "spec,id,text,status,reason,evidence\n" +
    "SPEC-A,R-1,The system shall save.,ACTIVE,,legacy pass\n" +
    "SPEC-B,R-1,The system shall export.,DEFERRED,Later release,\n" +
    "SPEC-B,R-2,The system shall print.,NOT_APPLICABLE,No printer,\n" +
    "SPEC-B,R-3,The system shall transfer.,TRANSFERRED,Owned elsewhere,\n",
);
const mappedInput = {
  ...input,
  transfer_targets: { "SPEC-B": { "R-3": "SPEC-A" } },
};

describe("grouped ledger migration", () => {
  it("defaults rows to in scope when no disposition column is mapped", async () => {
    const f = await fixture();
    await migrate(
      f.service,
      {
        operation: "migrate",
        input: {
          ...input,
          mapping: { id: "id", title: "id", statement: "text" },
        },
        apply: true,
      },
      Buffer.from("spec,id,text\nSPEC-A,R-1,Store rasters\n"),
    );
    const s = await f.repo.snapshot();
    expect(s.requirements).toHaveLength(1);
    expect(s.requirements[0]).toMatchObject({
      id: "R-1",
      disposition: "in_scope",
      lifecycle: "draft",
    });
  });

  it("maps nonportable specification labels without merging their identities", async () => {
    const f = await fixture();
    const content = Buffer.from(
      "spec,id,text,status\nRaster storage,R-1,Store rasters,ACTIVE\n",
    );
    const requestInput = {
      ...input,
      specification_codes: { "Raster storage": "RASTER-STORAGE" },
    };
    await migrate(
      f.service,
      { operation: "migrate", input: requestInput, apply: true },
      content,
    );
    const s = await f.repo.snapshot();
    expect(
      s.config.specifications.find((spec) => spec.code === "RASTER-STORAGE")
        ?.title,
    ).toBe("Raster storage");
    expect(
      s.documents.some(
        (doc) => doc.path === "requirements/imported/RASTER-STORAGE.md",
      ),
    ).toBe(true);
    await expect(
      migrate(
        f.service,
        {
          operation: "migrate",
          input: {
            ...requestInput,
            specification_codes: {
              "Raster storage": "SAME",
              "Other storage": "SAME",
            },
          },
        },
        Buffer.from(
          "spec,id,text,status\nRaster storage,R-1,First,ACTIVE\nOther storage,R-2,Second,ACTIVE\n",
        ),
      ),
    ).rejects.toThrow("Several source specifications");
  });

  it.each([
    ["DEFERRED", "", "Disposition requires an explicit reason."],
    ["UNKNOWN", "", "Unmapped disposition UNKNOWN."],
  ])(
    "reports unresolved %s rows without changing native governance",
    async (status, reason, explanation) => {
      const f = await fixture();
      const result = await migrate(
        f.service,
        { operation: "migrate", input },
        Buffer.from(
          `spec,id,text,status,reason\nSPEC-A,R-1,Statement,${status},${reason}\n`,
        ),
      );
      expect(result.exit_code).toBe(4);
      expect(result.data).toMatchObject({ unresolved: [{ explanation }] });
      expect(result.data).not.toHaveProperty("plan");
    },
  );

  it("preserves CLI import diagnostics when a worker returns no plan", async () => {
    const f = await fixture();
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli.ts",
        "--repo",
        f.root,
        "--format",
        "json",
        "--quiet",
        "migrate",
        "--source",
        "package.json",
        "--input",
        "package.json",
        "--plan-output",
        "unused-plan.json",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).diagnostics[0].code).toBe(
      "MIGRATION_DESTINATION",
    );
  });
  it("previews and replays all specifications with local IDs and dispositions intact", async () => {
    const f = await fixture();
    const originalConfig = await readFile(
      path.join(f.root, "requirements.yml"),
      "utf8",
    );
    const preview = await migrate(
      f.service,
      { operation: "migrate", input: mappedInput },
      bytes,
    );
    expect((await f.repo.snapshot()).requirements).toHaveLength(0);
    expect(await readFile(path.join(f.root, "requirements.yml"), "utf8")).toBe(
      originalConfig,
    );
    const data = preview.data as {
      plan: WritePlan;
      manifest: { target_count: number };
    };
    expect(data.manifest.target_count).toBe(4);
    await f.service.applySavedPlan(data.plan);
    const s = await f.repo.snapshot();
    expect(s.requirements).toHaveLength(4);
    expect(s.config.specifications.map((spec) => spec.code)).toEqual([
      "REQ",
      "SPEC-A",
      "SPEC-B",
    ]);
    expect(s.requirements.filter((r) => r.id === "R-1")).toHaveLength(2);
    expect(s.requirements.every((r) => r.lifecycle === "draft")).toBe(true);
    expect(s.requirements.find((r) => r.id === "R-2")?.disposition).toBe(
      "not_applicable",
    );
    expect(s.requirements.find((r) => r.id === "R-3")?.metadata.target).toBe(
      "SPEC-A",
    );
    expect(s.records).toHaveLength(0);
    const first = s.requirements.find((r) => r.disposition === "in_scope")!;
    expect(first.metadata.extensions).toMatchObject({
      "reqman.import": {
        row: 1,
        original: { evidence: "legacy pass", spec: "SPEC-A" },
      },
    });
    const repeat = await migrate(
      f.service,
      { operation: "migrate", input: mappedInput },
      bytes,
    );
    expect(repeat.data).toMatchObject({ idempotent: true, imported: 0 });
  });

  it("reports unresolved transfers without creating a partial plan", async () => {
    const f = await fixture();
    const result = await migrate(
      f.service,
      { operation: "migrate", input, apply: true },
      bytes,
    );
    expect(result.exit_code).toBe(4);
    expect(result.data).toMatchObject({
      unresolved: [
        {
          specification: "SPEC-B",
          id: "R-3",
          explanation: "Transfer requires an explicit target.",
        },
      ],
    });
    expect(result.data).not.toHaveProperty("plan");
    expect((await f.repo.snapshot()).requirements).toHaveLength(0);
  });

  it("rejects duplicate IDs within one specification and unsafe group paths", async () => {
    const f = await fixture();
    for (const content of [
      "spec,id,text,status\nSPEC-A,R-1,First,ACTIVE\nSPEC-A,R-1,Second,ACTIVE\n",
      "spec,id,text,status\n../escape,R-1,First,ACTIVE\n",
    ]) {
      await expect(
        migrate(
          f.service,
          { operation: "migrate", input },
          Buffer.from(content),
        ),
      ).rejects.toThrow();
    }
    expect((await f.repo.snapshot()).requirements).toHaveLength(0);
  });

  it("refuses changed destinations instead of overwriting an existing import", async () => {
    const f = await fixture();
    await migrate(
      f.service,
      { operation: "migrate", input: mappedInput, apply: true },
      bytes,
    );
    await expect(
      migrate(
        f.service,
        { operation: "migrate", input: mappedInput },
        Buffer.from(bytes.toString().replace("shall save", "shall archive")),
      ),
    ).rejects.toThrow("differs from this import");
  });

  it("excludes a named sample document without deleting its source bytes", async () => {
    const f = await fixture();
    await f.add();
    const original = await f.source();
    const requestInput = {
      ...mappedInput,
      exclude_documents: ["requirements/main.md"],
    };
    await migrate(
      f.service,
      { operation: "migrate", input: requestInput, apply: true },
      bytes,
    );
    const s = await f.repo.snapshot();
    expect(s.requirements).toHaveLength(4);
    expect(await f.source()).toBe(original);
    expect(s.config.documents.exclude).toContain("requirements/main.md");
    const repeat = await migrate(
      f.service,
      { operation: "migrate", input: requestInput },
      bytes,
    );
    expect(repeat.data).toMatchObject({ idempotent: true });
  });
});
