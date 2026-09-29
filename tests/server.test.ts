import { describe, it, expect } from "vitest";
import { serve } from "../src/server";
import { fixture } from "./helpers";
describe("loopback boundary", () => {
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
