import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Repository } from "../src/core/repository";
import { Service } from "../src/core/service";
import { serve } from "../src/server";

const root = await mkdtemp(path.join(tmpdir(), "reqman-demo-"));
const git = (...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
git("init", "-q");
git("config", "user.name", "Demo Author");
git("config", "user.email", "demo@example.invalid");
git("config", "core.autocrlf", "false");
await writeFile(path.join(root, ".gitignore"), ".requirements/recovery/\n");
const repository = new Repository(root);
const service = new Service(repository);
await service.execute({
  operation: "init",
  input: { name: "Atlas Fieldwork" },
  apply: true,
});
for (const [id, title, statement, criteria] of [
  [
    "MAP-001",
    "Display the coordinate reference system",
    "The application shall display the declared coordinate reference system for each loaded spatial layer.",
    "Known systems show their authority and identifier.\n- Unknown systems are labeled explicitly.",
  ],
  [
    "MAP-002",
    "Preserve source geometry on import",
    "The application shall preserve source geometry and attributes when importing a spatial dataset.",
    "Round-trip export retains source feature identifiers.\n- Geometry changes require an explicit user action.",
  ],
  [
    "MAP-003",
    "Explain unsupported spatial formats",
    "The application shall identify unsupported file formats before changing the project.",
    "The error identifies the file and supported alternatives.",
  ],
  [
    "DATA-001",
    "Save projects without data loss",
    "The application shall save project state using a recoverable file replacement.",
    "An interrupted save preserves a recoverable original.",
  ],
  [
    "DATA-002",
    "Detect concurrent project edits",
    "The application shall reject a save when the source project changed after loading.",
    "The unsaved draft remains available after a conflict.",
  ],
  [
    "FIELD-001",
    "Record observations without a connection",
    "Field observations shall be recorded locally while the device is offline.",
    "An observation includes its capture time and claimed operator.",
  ],
  [
    "FIELD-002",
    "Export an observation register",
    "The application shall export the selected observations as a portable register.",
    "The export identifies its scope and omits no selected observations.",
  ],
]) {
  await service.execute({
    operation: "requirement.add",
    input: {
      id,
      metadata: { lifecycle: "active" },
      markdown: `## ${title}\n\n### Statement\n\n${statement}\n\n### Rationale\n\nField teams need a reliable, inspectable record of their work.\n\n### Acceptance criteria\n\n- ${criteria}`,
    },
    apply: true,
  });
}
let s = await repository.snapshot();
for (const r of s.requirements.slice(0, 4))
  await service.execute({
    operation: "review.create",
    target: r.uid,
    input: {
      actor: "Morgan Lee",
      decision: "approved",
      rationale:
        "Reviewed the definition and acceptance criteria for the field trial.",
    },
    apply: true,
  });
git("add", ".");
git("commit", "-qm", "Initial field trial requirements");
await service.execute({
  operation: "baseline.create",
  input: {
    name: "field-trial",
    target: "HEAD",
    actor: "Morgan Lee",
    description: "Scope agreed for the first field trial.",
  },
  apply: true,
});
git("add", ".");
git("commit", "-qm", "Preserve field trial baseline");
const first = s.requirements[0];
await service.execute({
  operation: "requirement.edit",
  target: first.uid,
  input: {
    markdown:
      first.markdown +
      "\n- The selected display coordinate system is shown separately.",
  },
  apply: true,
});
const session = await serve(service, 0, path.resolve("dist/ui"));
process.stdout.write(
  `Demo repository: ${root}\nURL: ${session.origin}\nAccess key: ${session.token}\n`,
);
process.on("SIGINT", () => {
  session.server.close();
  process.exitCode = 130;
});
