import { describe, it, expect } from "vitest";
import { serve } from "../src/server";
import { fixture } from "./helpers";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requirementBlock } from "../src/core/markdown";
describe("loopback boundary", () => {
  it("serves local logo assets with image types and permits only local images", async () => {
    const f = await fixture();
    const ui = path.join(f.root, "ui");
    await mkdir(path.join(ui, "assets"), { recursive: true });
    await writeFile(path.join(ui, "index.html"), "<!doctype html>");
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const jpeg = Buffer.from([255, 216, 255, 217]);
    await writeFile(path.join(ui, "assets/logo.png"), png);
    await writeFile(path.join(ui, "assets/illustration.jpg"), jpeg);
    await writeFile(path.join(ui, "assets/illustration.jpeg"), jpeg);
    const session = await serve(f.service, 0, ui);
    try {
      const index = await fetch(session.origin);
      expect(index.status).toBe(200);
      expect(index.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
      expect(index.headers.get("content-security-policy")).toMatch(
        /(?:^|; )img-src 'self'(?:;|$)/,
      );
      for (const [name, type, bytes] of [
        ["logo.png", "image/png", png],
        ["illustration.jpg", "image/jpeg", jpeg],
        ["illustration.jpeg", "image/jpeg", jpeg],
      ] as const) {
        const response = await fetch(`${session.origin}/assets/${name}`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe(type);
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      }
      expect((await fetch(`${session.origin}/logo.png`)).status).toBe(404);
      expect(
        (
          await fetch(`${session.origin}/assets/logo.png`, {
            headers: { Origin: "https://malicious.invalid" },
          })
        ).status,
      ).toBe(409);
    } finally {
      await new Promise<void>((resolve) =>
        session.server.close(() => resolve()),
      );
    }
  });
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
