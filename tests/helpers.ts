import { mkdtemp, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Repository } from "../src/core/repository";
import { Service, type Request } from "../src/core/service";
import { utf8 } from "../src/core/data";

export function gitAt(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}
export async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "reqman-test-"));
  gitAt(root, "init", "-q");
  gitAt(root, "config", "user.name", "Fixture Author");
  gitAt(root, "config", "user.email", "fixture@example.invalid");
  gitAt(root, "config", "core.autocrlf", "false");
  await writeFile(path.join(root, ".gitignore"), ".requirements/recovery/\n");
  const repo = new Repository(root);
  const service = new Service(repo);
  await service.execute({
    operation: "init",
    input: { name: "Test project" },
    apply: true,
  });
  const add = async (
    id = "R-001",
    statement = "The application shall preserve requirement identity.",
  ) => {
    await service.execute({
      operation: "requirement.add",
      input: { id, title: `Requirement ${id}`, statement },
      apply: true,
    });
    return (await repo.snapshot()).requirements.find((r) => r.id === id)!;
  };
  const record = async (
    operation: string,
    target: string,
    input: Request["input"],
  ) =>
    service.execute({
      operation,
      target,
      input: {
        actor: "Fixture reviewer",
        rationale: "Examined the exact revision.",
        ...input,
      },
      apply: true,
    });
  const commit = (message = "Fixture commit") => {
    gitAt(root, "add", ".");
    gitAt(root, "commit", "-qm", message);
    return gitAt(root, "rev-parse", "HEAD");
  };
  const source = async () =>
    utf8(await readFile(path.join(root, "requirements/main.md")));
  const writeSource = async (text: string) =>
    writeFile(path.join(root, "requirements/main.md"), text);
  return { root, repo, service, add, record, commit, source, writeSource };
}
