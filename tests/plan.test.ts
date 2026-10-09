import { describe, expect, it } from "vitest";
import { parsePlan } from "../src/core/files";

function plan(after: string) {
  return {
    uid: "550e8400-e29b-41d4-a716-446655440000",
    repository: "example",
    configPath: "requirements.yml",
    operation: "migrate",
    guards: {},
    entries: [{ path: "requirements/imported.md", before: null, after }],
    state: "prepared",
  };
}

describe("write plan payload validation", () => {
  it("accepts a large document without exhausting the regex stack", () => {
    const payload = Buffer.alloc(1024 * 1024, "a").toString("base64");
    expect(parsePlan(plan(payload)).entries[0].after).toBe(payload);
  });

  it.each(["", "YQ==", "YWI=", "YWJj"])("accepts valid base64 %j", (payload) => {
    expect(parsePlan(plan(payload)).entries[0].after).toBe(payload);
  });

  it.each(["YQ", "Y===", "=AAA", "AA=A", "!!!!", "YQ==\n"])(
    "rejects malformed base64 %j",
    (payload) => {
      expect(() => parsePlan(plan(payload))).toThrow("Invalid base64 payload");
    },
  );
});
