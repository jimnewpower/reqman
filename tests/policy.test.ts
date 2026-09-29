import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { fixture } from "./helpers";
import { config } from "../src/core/schema";
import { yaml } from "../src/core/data";
import { projection, upstreamImpacts } from "../src/core/decisions";

describe("policy and exact change applicability", () => {
  it("retains waived findings, expires narrow waivers, and forbids waiving structural errors", async () => {
    const f = await fixture();
    const r = await f.add();
    const s = await f.repo.snapshot();
    s.config.policy.validation = {
      rules: [{ code: "POLICY_OWNER", severity: "error" }],
      waivers: [
        {
          uid: "00000000-0000-0000-0000-000000000001",
          rule: "POLICY_OWNER",
          subject: r.uid,
          reason: "Owner pending team assignment",
          issuer: "Project lead",
          expires_at: "2099-01-01T00:00:00Z",
        },
      ],
    };
    await writeFile(path.join(f.root, "requirements.yml"), stringify(s.config));
    let result = await f.service.execute({ operation: "validate" });
    expect(result.exit_code).toBe(0);
    expect(result.snapshot?.evaluatedAt).toBeDefined();
    expect(result.diagnostics[0].waiver?.reason).toContain("pending");
    s.config.policy.validation.waivers[0].expires_at = "2000-01-01T00:00:00Z";
    await writeFile(path.join(f.root, "requirements.yml"), stringify(s.config));
    result = await f.service.execute({ operation: "validate" });
    expect(result.exit_code).toBe(1);
    expect(result.diagnostics[0].waiver).toBeUndefined();
    expect(() =>
      config({
        ...s.config,
        policy: {
          ...s.config.policy,
          validation: {
            rules: [{ code: "SCHEMA_INVALID", severity: "off" }],
            waivers: [],
          },
        },
      }),
    ).toThrow("Invalid enum");
  });

  it("allows authoring to fix advisory failures and enforces baseline eligibility at the target", async () => {
    const f = await fixture();
    const r = await f.add();
    const s = await f.repo.snapshot();
    s.config.policy.baseline.approval = true;
    s.config.policy.validation.rules = [
      { code: "POLICY_OWNER", severity: "error" },
    ];
    await writeFile(path.join(f.root, "requirements.yml"), stringify(s.config));
    await f.service.execute({
      operation: "requirement.edit",
      target: r.uid,
      input: { metadata: { ...r.metadata, owner: "Team" } },
      apply: true,
    });
    const target = f.commit();
    await expect(
      f.service.execute({
        operation: "baseline.create",
        input: { target, name: "release", actor: "Lead" },
        apply: true,
      }),
    ).rejects.toThrow("baseline gates");
    await f.record("review.create", r.uid, { decision: "approved" });
    const approved = f.commit();
    await f.service.execute({
      operation: "baseline.create",
      input: { target: approved, name: "release", actor: "Lead" },
      apply: true,
    });
    expect((await f.repo.snapshot()).baselines[0].target).toBe(approved);
  });

  it("resolves only the named upstream revision pair, exposes conflicts, and leaves direct changes stale", async () => {
    const f = await fixture();
    const parent = await f.add("P");
    const child = await f.add("C");
    await f.service.execute({
      operation: "requirement.edit",
      target: child.uid,
      input: {
        metadata: {
          ...child.metadata,
          relations: [{ type: "depends_on", target: parent.uid }],
        },
      },
      apply: true,
    });
    await f.record("review.create", child.uid, { decision: "approved" });
    const base = f.commit();
    await f.service.execute({
      operation: "requirement.edit",
      target: parent.uid,
      input: { markdown: parent.markdown + "\n\nAdditional constraint." },
      apply: true,
    });
    let s = await f.repo.snapshot();
    expect(
      projection(
        s,
        s.requirements.find((r) => r.uid === child.uid)!,
      ).currency,
    ).toBe("needs_review");
    await f.record("impact.create", child.uid, {
      base,
      trigger: parent.uid,
      decision: "no_impact",
    });
    s = await f.repo.snapshot();
    expect(
      projection(
        s,
        s.requirements.find((r) => r.uid === child.uid)!,
      ).currency,
    ).toBe("current");
    await f.record("impact.create", child.uid, {
      base,
      trigger: parent.uid,
      decision: "rework",
    });
    s = await f.repo.snapshot();
    const review = s.records.find((r) => r.kind === "review")!;
    expect(
      upstreamImpacts(
        s,
        review,
        s.requirements.find((r) => r.uid === child.uid)!,
      )[0].resolution,
    ).toBe("conflicted");
    const conflicting = s.records
      .filter((r) => r.kind === "impact")
      .map((r) => r.uid);
    await f.record("impact.create", child.uid, {
      base,
      trigger: parent.uid,
      decision: "no_impact",
      supersedes: conflicting,
    });
    s = await f.repo.snapshot();
    expect(
      projection(
        s,
        s.requirements.find((r) => r.uid === child.uid)!,
      ).currency,
    ).toBe("current");
    const head = f.commit();
    await f.service.execute({
      operation: "requirement.edit",
      target: parent.uid,
      input: { markdown: parent.markdown + "\n\nDifferent constraint." },
      apply: true,
    });
    s = await f.repo.snapshot();
    expect(
      projection(
        s,
        s.requirements.find((r) => r.uid === child.uid)!,
      ).currency,
    ).toBe("needs_review");
    await expect(
      f.record("impact.create", parent.uid, {
        base: head,
        trigger: child.uid,
        decision: "no_impact",
      }),
    ).rejects.toThrow();
  });

  it("requires rationale in the same guarded plan as a material edit and binds actual subjects", async () => {
    const f = await fixture();
    const r = await f.add();
    const s = await f.repo.snapshot();
    s.config.policy.require_change_record = true;
    await writeFile(path.join(f.root, "requirements.yml"), stringify(s.config));
    const current = (await f.repo.snapshot()).requirements[0];
    const before = await f.source();
    const input = { markdown: current.markdown + "\n\nConstraint revised." };
    await expect(
      f.service.execute({
        operation: "requirement.edit",
        target: r.uid,
        input,
        apply: true,
      }),
    ).rejects.toThrow("change rationale");
    expect(await f.source()).toBe(before);
    await f.service.execute({
      operation: "requirement.edit",
      target: r.uid,
      input: {
        ...input,
        change: {
          actor: "Lead",
          rationale: "Clarify the constraint",
          work_references: ["https://example.invalid/work/42"],
        },
      },
      apply: true,
    });
    const after = await f.repo.snapshot();
    const rec = after.records.find((r) => r.kind === "change")!;
    expect(rec.changes?.[0].before?.definition).toBe(current.definition);
    expect(rec.changes?.[0].after?.definition).toBe(
      after.requirements[0].definition,
    );
    expect(rec.work_references).toEqual(["https://example.invalid/work/42"]);
  });
});
