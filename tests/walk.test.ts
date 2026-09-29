import { describe, expect, it, vi } from "vitest";
import path from "node:path";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    readdir: async (directory: string) => {
      if (directory === path.join("inventory", "large")) {
        return Array.from({ length: 150000 }, (_, index) => ({
          name: `${index}.md`,
          isSymbolicLink: () => false,
          isDirectory: () => false,
          isFile: () => true,
        }));
      }
      return [{
        name: "large",
        isSymbolicLink: () => false,
        isDirectory: () => true,
        isFile: () => false,
      }];
    },
  };
});

import { walk } from "../src/core/files";

describe("repository inventory", () => {
  it("collects a large subtree without exceeding the argument limit", async () => {
    const files = await walk("inventory");
    expect(files).toHaveLength(150000);
    expect(files).toContain("large/149999.md");
    expect(files).toContain("large/0.md");
  });
});
