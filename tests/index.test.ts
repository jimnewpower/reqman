import { describe, it, expect } from "vitest";
import { fixture } from "./helpers";
import { projection } from "../src/core/decisions";

describe("captured indexes", () => {
  it("retains off-selection prerequisite records when projecting a baseline subset", async () => {
    const f = await fixture(),
      parent = await f.add("P"),
      child = await f.add("C");
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
    const target = f.commit();
    await f.service.execute({
      operation: "baseline.create",
      input: { name: "subset", actor: "Lead", target, selection: [child.uid] },
      apply: true,
    });
    const selected = await f.service.execute({
      operation: "register",
      ref: "baseline:subset",
    });
    const rows = (
      selected.data as {
        requirements: { uid: string; state: { currency: string } }[];
      }
    ).requirements;
    expect(rows).toHaveLength(1);
    expect(
      (
        selected.data as {
          summary: { total: number; outside_selection: number };
        }
      ).summary,
    ).toMatchObject({ total: 1, outside_selection: 1 });
    expect(rows[0]).toMatchObject({
      uid: child.uid,
      state: { currency: "current" },
    });
    expect((await f.repo.snapshot("baseline:subset")).diagnostics).toEqual([]);
  });
  it("reindexes a changed document, revalidates the graph, and fully captures before a guarded write", async () => {
    const f = await fixture(),
      r = await f.add();
    await f.record("review.create", r.uid, { decision: "approved" });
    await f.repo.snapshot();
    await f.writeSource(
      (await f.source()).replace(
        "preserve requirement identity",
        "retain requirement identity",
      ),
    );
    const changed = await f.repo.reindexDocument("requirements/main.md");
    expect(changed.info.captureKind).toBe("incremental");
    expect(projection(changed, changed.requirements[0]).currency).toBe(
      "needs_review",
    );
    const query = await f.service.execute({
      operation: "search",
      indexed: true,
      query: "retain",
    });
    expect(
      (query.data as { requirements: unknown[] }).requirements,
    ).toHaveLength(1);
    const preview = await f.service.execute({
      operation: "requirement.edit",
      indexed: true,
      target: r.uid,
      input: {
        markdown: changed.requirements[0].markdown + "\n\nClarification.",
      },
    });
    expect(preview.snapshot?.captureKind).toBe("full");
  });
});
