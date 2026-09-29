import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { exportReport, importEvidence, migrate } from "../src/core/interchange";
import { projection } from "../src/core/decisions";
import { fixture } from "./helpers";

describe("evidence truth and portable exports", () => {
  it("requires explicit mappings, preserves skips, imports idempotently, and never auto-passes", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.record("verification.create", r.uid, {
      title: "Identity check",
      method: "test",
    });
    const obligation = (await f.repo.snapshot()).records[0];
    const xml = Buffer.from(
      '<testsuite name="suite"><testcase classname="identity" name="stable" time="0.12"><skipped/></testcase></testsuite>',
    );
    const input = {
      run_id: "run-1",
      producer: "junit",
      actor: "Runner",
      artifact: { repository: "product", revision: "commit-A" },
      mapping: {
        "junit::suite::identity::stable": {
          requirement: r.uid,
          obligation: obligation.uid,
        },
      },
    };
    await expect(
      importEvidence(
        f.service,
        {
          operation: "evidence.import",
          input: { ...input, mapping: {} },
          apply: true,
        },
        xml,
      ),
    ).rejects.toThrow("mapping");
    await importEvidence(
      f.service,
      { operation: "evidence.import", input, apply: true },
      xml,
    );
    let s = await f.repo.snapshot();
    expect(s.records.find((e) => e.kind === "evidence")?.result).toBe(
      "skipped",
    );
    expect(projection(s, s.requirements[0]).verification).toBe("not_assessed");
    const duplicate = await importEvidence(
      f.service,
      { operation: "evidence.import", input, apply: true },
      xml,
    );
    expect(duplicate.data).toMatchObject({ idempotent: true });
    await expect(
      importEvidence(
        f.service,
        { operation: "evidence.import", input, apply: true },
        Buffer.from(xml.toString().replace("<skipped/>", "")),
      ),
    ).rejects.toThrow("different");
    await expect(
      importEvidence(
        f.service,
        { operation: "evidence.import", input: { ...input, run_id: "evil" } },
        Buffer.from('<!DOCTYPE a SYSTEM "file:///secret"><a/>'),
      ),
    ).rejects.toThrow("forbidden");
  });
  it("requires complete current passing evidence and separates evaluated artifacts", async () => {
    const f = await fixture();
    const r = await f.add();
    await f.record("verification.create", r.uid, {
      title: "Acceptance",
      method: "test",
    });
    const obligation = (await f.repo.snapshot()).records[0];
    await f.service.execute({
      operation: "requirement.edit",
      target: r.uid,
      input: {
        metadata: {
          relations: [{ type: "verified_by", target: obligation.uid }],
        },
      },
      apply: true,
    });
    const artifact = { repository: "product", revision: "A" };
    await importEvidence(
      f.service,
      {
        operation: "evidence.import",
        input: {
          run_id: "run-1",
          producer: "junit",
          actor: "Runner",
          artifact,
          mapping: {
            "junit::suite::::case": {
              requirement: r.uid,
              obligation: obligation.uid,
            },
          },
        },
        apply: true,
      },
      Buffer.from(
        '<testsuite name="suite"><testcase name="case"/></testsuite>',
      ),
    );
    const evidence = (await f.repo.snapshot()).records.find(
      (e) => e.kind === "evidence",
    )!;
    await f.record("assess.create", r.uid, {
      category: "verification",
      decision: "passed",
      artifact,
      obligations: [obligation.uid],
      evidence: [evidence.uid],
    });
    const s = await f.repo.snapshot();
    expect(projection(s, s.requirements[0], "project", artifact)).toMatchObject(
      { verification: "passed", currency: "current" },
    );
    expect(
      projection(s, s.requirements[0], "project", {
        ...artifact,
        revision: "B",
      }),
    ).toMatchObject({ verification: "passed", currency: "needs_review" });
    expect(projection(s, s.requirements[0]).currency).toBe("unknown");
  });
  it("escapes static HTML and spreadsheet formulas and exports all authoritative files", async () => {
    const f = await fixture();
    await f.service.execute({
      operation: "requirement.add",
      input: {
        id: "R-1",
        title: "=1+1",
        statement:
          "<script>alert(1)</script> ![remote](https://example.invalid/a.png)",
      },
      apply: true,
    });
    const csv = await exportReport(f.service, { operation: "export" }, "csv");
    expect(csv.content).toContain("'=1+1");
    const html = await exportReport(f.service, { operation: "export" }, "html");
    expect(html.content).not.toContain("<script>");
    expect(html.content).not.toContain("<img");
    const portable = JSON.parse(
      (await exportReport(f.service, { operation: "export" }, "portable"))
        .content,
    );
    expect(portable.git_history_included).toBe(false);
    expect(
      portable.files.some(
        (f: { path: string }) => f.path === "requirements.yml",
      ),
    ).toBe(true);
  });
  it("migrates repeatably without upgrading source statuses or overwriting sources", async () => {
    const f = await fixture();
    const input = {
      source: "legacy.csv",
      destination: "requirements/imported.md",
      format: "csv",
    };
    const bytes = Buffer.from(
      "id,title,statement,status\nLEG-1,Preserve data,The system shall preserve data.,verified\n",
    );
    const a = await migrate(f.service, { operation: "migrate", input }, bytes);
    const b = await migrate(f.service, { operation: "migrate", input }, bytes);
    expect((a.data as { manifest: unknown }).manifest).toEqual(
      (b.data as { manifest: unknown }).manifest,
    );
    await migrate(
      f.service,
      { operation: "migrate", input, apply: true },
      bytes,
    );
    const s = await f.repo.snapshot();
    expect(s.requirements).toHaveLength(1);
    expect(projection(s, s.requirements[0]).verification).toBe("not_assessed");
    const again = await migrate(
      f.service,
      { operation: "migrate", input, apply: true },
      bytes,
    );
    expect(again.data).toMatchObject({ idempotent: true });
  });
});
