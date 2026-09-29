import { describe, it, expect } from "vitest";
import { serve } from "../src/server";
import { fixture } from "./helpers";
import { randomUUID } from "node:crypto";
import { requirementBlock } from "../src/core/markdown";
describe("loopback boundary", () => {
  it("acknowledges cancellation while analysis is busy and rebuilds the disposable worker", async () => {
    const f = await fixture();
    const blocks = Array.from({ length: 1500 }, (_, i) =>
      requirementBlock(
        { uid: randomUUID(), id: `R-${i}` },
        `## Requirement ${i}\n\n### Statement\n\nThe application shall preserve item ${i}.`,
      ),
    ).join("\n");
    await f.writeSource((await f.source()) + "\n" + blocks);
    const original = await f.source(),
      id = randomUUID();
    const session = await serve(f.service, 0, "dist/ui");
    const call = (route: string, body: unknown, operation?: string) =>
      fetch(`${session.origin}/api/${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
          ...(operation ? { "X-Reqman-Operation": operation } : {}),
        },
        body: JSON.stringify(body),
      });
    try {
      const running = call("command", { operation: "register" }, id);
      let found = false;
      for (let i = 0; i < 20 && !found; i++) {
        found = (await (await call("progress", {})).json()).jobs.some(
          (job: { id: string }) => job.id === id,
        );
        if (!found) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(found).toBe(true);
      const start = performance.now();
      expect(
        (await (await call("cancel", { operation: id })).json()).accepted,
      ).toBe(true);
      expect((await (await running).json()).exit_code).toBe(130);
      expect(performance.now() - start).toBeLessThan(2000);
      expect(await f.source()).toBe(original);
      expect(
        (
          await (
            await call("command", { operation: "search", limit: 1 })
          ).json()
        ).data.requirements,
      ).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) =>
        session.server.close(() => resolve()),
      );
    }
  });
  it("requires session authorization, rejects cross-origin access and preserves read-only mode", async () => {
    const f = await fixture();
    await f.add();
    f.repo.readOnly = true;
    const session = await serve(f.service, 0, "dist/ui");
    try {
      const call = (headers: Record<string, string>, body: unknown) =>
        fetch(`${session.origin}/api/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(body),
        });
      expect((await call({}, { operation: "register" })).status).toBe(401);
      const auth = { Authorization: `Bearer ${session.token}` };
      expect(
        (
          await call(
            { ...auth, Origin: "https://malicious.invalid" },
            { operation: "register" },
          )
        ).status,
      ).toBe(409);
      const register = await call(auth, { operation: "register" });
      expect(register.status).toBe(200);
      expect((await register.json()).data.requirements).toHaveLength(1);
      const write = await call(auth, {
        operation: "requirement.add",
        input: { id: "R-2", title: "No write", statement: "Must not save." },
      });
      expect(write.status).toBe(409);
    } finally {
      await new Promise<void>((resolve) =>
        session.server.close(() => resolve()),
      );
    }
  });
});
