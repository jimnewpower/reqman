import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, mkdir, symlink, rename } from "node:fs/promises";
import path from "node:path";
import { fixture } from "./helpers";
import { Writer, entry, CapturePaths } from "../src/core/files";

describe("durable replacement phases", () => {
  for (const action of ["complete", "rollback"] as const) {
    it.each([
      "locked",
      "preflight",
      "prepared",
      "applying",
      "entry-0",
      "entry-1",
      "completed",
      "cleaned",
    ])(`recovers ${action} after interruption at %s`, async (phase) => {
      const f = await fixture();
      const first = await f.source();
      const second = "Existing independent file\n";
      await writeFile(path.join(f.root, "requirements/other.txt"), second);
      const plan = {
        uid: randomUUID(),
        repository: f.root,
        configPath: "requirements.yml",
        operation: "fault-fixture",
        state: "prepared" as const,
        guards: {},
        entries: [
          entry(
            "requirements/main.md",
            Buffer.from(first),
            first + "\nAfter one\n",
          ),
          entry(
            "requirements/other.txt",
            Buffer.from(second),
            second + "After two\n",
          ),
        ],
      };
      const writer = new Writer(
        f.root,
        ".requirements",
        false,
        (current, i) => {
          if ((current === "entry" ? `entry-${i}` : current) === phase)
            throw new Error("Simulated interruption");
        },
      );
      await expect(writer.apply(plan)).rejects.toThrow(
        "Simulated interruption",
      );
      const pending = await writer.pending();
      if (pending.length) {
        await expect(f.repo.snapshot()).rejects.toThrow("interrupted");
        await new Writer(f.root, ".requirements").recover(action);
      }
      const after =
        phase === "cleaned" || (pending.length > 0 && action === "complete");
      expect(await f.source()).toBe(after ? first + "\nAfter one\n" : first);
      expect(
        await readFile(path.join(f.root, "requirements/other.txt"), "utf8"),
      ).toBe(after ? second + "After two\n" : second);
      expect(await writer.pending()).toHaveLength(0);
    });
  }
  it("rejects parent junctions and detects replacement of an already checked capture directory", async () => {
    const f = await fixture();
    const paths = new CapturePaths(f.root);
    await expect(paths.resolve("requirements/main.md")).resolves.toContain(
      "main.md",
    );
    await mkdir(path.join(f.root, "alternate"));
    await paths.verify();
    const unsafe = new CapturePaths(f.root);
    let linked = false;
    try {
      await symlink(
        path.join(f.root, "requirements"),
        path.join(f.root, "alternate/link"),
        process.platform === "win32" ? "junction" : "dir",
      );
      linked = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
    if (linked)
      await expect(unsafe.resolve("alternate/link/main.md")).rejects.toThrow(
        "Unsafe capture directory",
      );
    await rename(
      path.join(f.root, "requirements"),
      path.join(f.root, "original"),
    );
    await mkdir(path.join(f.root, "requirements"));
    await expect(paths.verify()).rejects.toThrow("Capture directory changed");
  });
});
