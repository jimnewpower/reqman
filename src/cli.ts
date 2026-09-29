#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { Repository } from "./core/repository.js";
import { Service, failure, type Request, type Result } from "./core/service.js";
import { readBounded, type WritePlan } from "./core/files.js";
import { object, utf8, bytesDigest } from "./core/data.js";
import {
  exportReport,
  importEvidence,
  migrate,
  writeExport,
} from "./core/interchange.js";
import { Problem, TOOL_VERSION } from "./core/model.js";
import { serve } from "./server.js";

const program = new Command()
  .name("reqman")
  .description("Local Git and Markdown requirements management (preview)")
  .version(TOOL_VERSION)
  .option("--repo <path>", "Repository root", ".")
  .option(
    "--config <path>",
    "Repository-relative configuration",
    "requirements.yml",
  )
  .option("--format <format>", "Output text or json", "text")
  .option("--quiet", "Suppress successful text output")
  .option("--no-color", "Disable color")
  .exitOverride()
  .configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
  });
function setup(cmd: Command): Command {
  return cmd
    .option(
      "--ref <ref>",
      "Snapshot: WORKTREE, commit, or baseline:name",
      "WORKTREE",
    )
    .option("--input <path>", "JSON operation input")
    .option("--apply", "Apply explicit mutation")
    .option("--dry-run", "Preview without writing")
    .option("--scope <scope>", "Assessment scope", "project")
    .option(
      "--artifact-repository <id>",
      "Evaluated repository/product identity",
    )
    .option(
      "--artifact-revision <revision>",
      "Evaluated artifact commit/digest",
    );
}
function print(result: Result): void {
  const options = program.opts();
  if (options.format === "json")
    process.stdout.write(JSON.stringify(result) + "\n");
  else if (!options.quiet || result.exit_code) {
    process.stdout.write(
      `${result.operation}: ${result.complete ? "complete" : "incomplete"}${result.snapshot ? ` · ${result.snapshot.ref} · ${result.snapshot.project}` : ""}\n`,
    );
    for (const d of result.diagnostics)
      process.stdout.write(
        `${d.severity} ${d.code} ${d.file}:${d.line}:${d.column} ${d.message}\n`,
      );
    if (result.data !== null)
      process.stdout.write(JSON.stringify(result.data, null, 2) + "\n");
  }
  process.exitCode = result.exit_code;
}
function client(): Service {
  const opts = program.opts();
  return new Service(new Repository(resolvePath(opts.repo), opts.config));
}
function action(operation: string) {
  return async (...args: unknown[]) => {
    const cmd = args.at(-1) as Command;
    const opts = cmd.opts();
    const target = cmd.registeredArguments.length
      ? String(args[0] ?? "")
      : undefined;
    try {
      if (!["text", "json"].includes(program.opts().format))
        throw new Problem(2, "OUTPUT_FORMAT", "--format must be text or json.");
      const inputBytes = opts.input
        ? await readBounded(resolvePath(opts.input))
        : undefined;
      const input = inputBytes
        ? object(JSON.parse(utf8(inputBytes)))
        : undefined;
      const request: Request = {
        operation,
        target,
        ref: opts.ref,
        input,
        apply: opts.apply,
        dryRun: opts.dryRun,
        scope: opts.scope,
        query: opts.query,
        base: opts.base,
        head: opts.head,
        mergeBase: opts.mergeBase,
        specification: opts.specification,
        lifecycle: opts.lifecycle,
        disposition: opts.disposition,
        status: opts.status,
        currency: opts.currency,
        ...(opts.artifactRepository && opts.artifactRevision
          ? {
              artifact: {
                repository: opts.artifactRepository,
                revision: opts.artifactRevision,
              },
            }
          : {}),
      };
      const service = client();
      if (operation === "serve") {
        service.repository.readOnly = Boolean(opts.readOnly);
        const here = dirname(fileURLToPath(import.meta.url));
        const ui = here.endsWith("dist")
          ? resolvePath(here, "ui")
          : resolvePath(here, "../dist/ui");
        const session = await serve(service, Number(opts.port), ui);
        process.stderr.write(
          `Reqman ${TOOL_VERSION}\nRepository: ${service.repository.root}\n${opts.readOnly ? "Read-only" : "Editable"} local session: ${session.origin}\nAccess key (enter in browser): ${session.token}\nPress Ctrl+C to stop.\n`,
        );
        process.on("SIGINT", () => {
          session.server.close();
          process.exitCode = 130;
        });
        return;
      }
      if (operation === "apply-plan") {
        if (!input || !opts.apply)
          throw new Problem(
            2,
            "APPLY_REQUIRED",
            "Provide --input plan.json --apply.",
          );
        const plan = (input.plan ?? input) as unknown as WritePlan;
        await service.applySavedPlan(plan);
        print(service.result(request, null, { applied: true, plan: plan.uid }));
        return;
      }
      if (operation === "recover") request.input = { action: opts.action };
      if (operation === "evidence.import" || operation === "migrate") {
        if (!opts.source)
          throw new Problem(
            2,
            "SOURCE_REQUIRED",
            "Provide --source input-file and --input mapping.json.",
          );
        const bytes = await readBounded(
          resolvePath(opts.source),
          100 * 1024 * 1024,
        );
        request.sourceGuards = [
          { path: resolvePath(opts.source), digest: bytesDigest(bytes) },
          ...(inputBytes
            ? [
                {
                  path: resolvePath(opts.input),
                  digest: bytesDigest(inputBytes),
                },
              ]
            : []),
        ];
        const result = await (operation === "migrate"
          ? migrate(service, request, bytes)
          : importEvidence(service, request, bytes));
        const plan = (result.data as { plan?: WritePlan }).plan;
        if (opts.planOutput && plan)
          await writeExport(
            resolvePath(opts.planOutput),
            JSON.stringify(plan, null, 2),
          );
        print(result);
        return;
      }
      if (operation === "export") {
        if (!opts.output)
          throw new Problem(
            2,
            "OUTPUT_REQUIRED",
            "Provide --output destination.",
          );
        const selected = await service.repository.snapshot(request.ref);
        if (
          [...selected.files.keys()].some(
            (file) =>
              resolvePath(service.repository.root, file) ===
              resolvePath(opts.output),
          )
        )
          throw new Problem(
            4,
            "EXPORT_AUTHORITY",
            "Export destination is an authoritative input. Choose a separate output path.",
          );
        const report = await exportReport(service, request, opts.type);
        if (!opts.dryRun)
          await writeExport(
            resolvePath(opts.output),
            report.content,
            Boolean(opts.overwrite),
          );
        print(
          service.result(request, null, {
            destination: resolvePath(opts.output),
            written: !opts.dryRun,
            bytes: Buffer.byteLength(report.content),
          }),
        );
        return;
      }
      const result = await service.execute(request);
      if (opts.planOutput && (result.data as { plan?: unknown })?.plan)
        await writeExport(
          resolvePath(opts.planOutput),
          JSON.stringify((result.data as { plan: unknown }).plan, null, 2),
        );
      print(result);
    } catch (error) {
      print(failure(operation, error));
    }
  };
}
setup(program.command("init").description("Preview repository setup"))
  .option("--plan-output <file>", "Save replayable preview plan")
  .action(action("init"));
for (const name of ["validate", "list", "search", "trace", "doctor"])
  setup(program.command(name))
    .option("--query <text>")
    .option("--specification <code>")
    .option("--lifecycle <state>")
    .option("--disposition <state>")
    .option("--status <state>")
    .option("--currency <state>")
    .action(action(name));
for (const name of ["show", "history"])
  setup(program.command(`${name} <target>`)).action(action(name));
for (const name of ["diff", "impact"])
  setup(program.command(name))
    .option("--base <ref>", "Base endpoint", "HEAD")
    .option("--head <ref>", "Head endpoint", "WORKTREE")
    .option("--merge-base")
    .action(action(name));
const requirement = program.command("requirement");
for (const op of [
  "add",
  "edit",
  "renumber",
  "move",
  "clone",
  "retire",
  "split",
  "consolidate",
])
  setup(requirement.command(`${op}${op === "add" ? "" : " <target>"}`))
    .option("--plan-output <file>")
    .action(action(`requirement.${op}`));
const document = program.command("document");
setup(document.command("add"))
  .option("--plan-output <file>")
  .action(action("document.add"));
setup(document.command("show <target>")).action(action("document.show"));
for (const name of ["review", "assess", "change", "verification", "evidence"]) {
  const family = program.command(name);
  setup(family.command("list")).action(action(`${name}.list`));
  setup(family.command("create [target]"))
    .option("--plan-output <file>")
    .action(action(`${name}.create`));
  if (name === "evidence")
    setup(family.command("import"))
      .option("--source <file>")
      .option("--plan-output <file>")
      .action(action("evidence.import"));
}
const baselines = program.command("baseline");
setup(baselines.command("list")).action(action("baseline.list"));
setup(baselines.command("show <target>")).action(action("baseline.show"));
setup(baselines.command("create"))
  .option("--plan-output <file>")
  .action(action("baseline.create"));
setup(baselines.command("compare"))
  .requiredOption("--base <ref>")
  .requiredOption("--head <ref>")
  .action(action("diff"));
setup(program.command("migrate"))
  .option("--source <file>")
  .option("--plan-output <file>")
  .action(action("migrate"));
setup(program.command("export"))
  .option("--type <type>", "html, csv, json, markdown, portable", "html")
  .option("--output <file>")
  .option("--overwrite")
  .action(action("export"));
setup(program.command("serve"))
  .option("--port <port>", "Loopback port (0 selects a free port)", "0")
  .option("--read-only")
  .action(action("serve"));
setup(program.command("apply-plan")).action(action("apply-plan"));
setup(program.command("recover"))
  .requiredOption("--action <action>", "complete or rollback")
  .action(action("recover"));
try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0)
    process.exitCode = 0;
  else
    print(
      failure(
        "cli",
        error instanceof CommanderError
          ? new Problem(2, "INVOCATION_INVALID", error.message)
          : error,
      ),
    );
}
