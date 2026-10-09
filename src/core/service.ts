import { randomUUID } from "node:crypto";
import { stringify } from "yaml";
import { minimatch } from "minimatch";
import {
  bytesDigest,
  digest,
  object,
  readSchema,
  stable,
  utf8,
  yaml,
} from "./data.js";
import {
  config as parseConfig,
  documentSchema,
  parseBaseline,
  parseRecord,
  requirementSchema,
} from "./schema.js";
import { Repository } from "./repository.js";
import {
  entry,
  optionalBytes,
  safePath,
  Writer,
  parsePlan,
  type WritePlan,
} from "./files.js";
import {
  parseDocument,
  parseFrontMatter,
  recordMarkdown,
  requirementBlock,
} from "./markdown.js";
import {
  C14N,
  Problem,
  TOOL_VERSION,
  diagnostic,
  requireValid,
  resolve,
  subject,
  selectedRequirements,
  type DurableRecord,
  type ObjectValue,
  type Requirement,
  type Snapshot,
} from "./model.js";
import {
  assertPassing,
  dependencies,
  projection,
  summary,
  upstreamImpacts,
} from "./decisions.js";
import { compare, impact } from "./compare.js";
import { commit, gitText } from "./git.js";
import { validate } from "./validation.js";
import { baselineEligibility } from "./policy.js";
import { index } from "./index.js";
import { checkpoint, limits } from "./operations.js";
import { LOGIN_PROVENANCE, type Identity } from "./auth.js";

export interface Request {
  sourceGuards?: { path: string; digest: string }[];
  operation: string;
  ref?: string;
  target?: string;
  base?: string;
  head?: string;
  scope?: string;
  query?: string;
  specification?: string;
  lifecycle?: string;
  disposition?: string;
  status?: string;
  currency?: string;
  offset?: number;
  limit?: number;
  indexed?: boolean;
  report?: "inventory" | "comparison" | "matrix" | "gaps";
  input?: ObjectValue;
  apply?: boolean;
  dryRun?: boolean;
  mergeBase?: boolean;
  artifact?: { repository: string; revision: string };
}
export interface Result {
  schema_version: number;
  tool_version: string;
  operation: string;
  complete: boolean;
  snapshot: Snapshot["info"] | null;
  data: unknown;
  diagnostics: Snapshot["diagnostics"];
  exit_code: number;
}
export function failure(operation: string, error: unknown): Result {
  const e =
    error instanceof Problem
      ? error
      : new Problem(
          3,
          "OPERATION_FAILED",
          error instanceof Error ? error.message : String(error),
        );
  return {
    schema_version: 1,
    tool_version: TOOL_VERSION,
    operation,
    complete: false,
    snapshot: null,
    data: null,
    diagnostics: [
      {
        ...diagnostic(e.code, e.message, e.file, e.location?.line, e.subject),
        column: e.location?.column ?? 1,
      },
    ],
    exit_code: e.exitCode,
  };
}
export class Service {
  constructor(
    public repository: Repository,
    public readonly identity?: Identity,
  ) {}
  attribute(request: Request): Request {
    if (!this.identity) return request;
    const input: ObjectValue = {
      ...request.input,
      actor: this.identity.username,
    };
    if (input.role && !this.identity.roles.includes(String(input.role)))
      throw new Problem(
        4,
        "LOGIN_ROLE",
        "Choose a role assigned to your login.",
      );
    if (input.change)
      input.change = { ...object(input.change), actor: this.identity.username };
    return { ...request, input };
  }
  async execute(request: Request, frozen?: Snapshot): Promise<Result> {
    request = this.attribute(request);
    if (request.operation === "upgrade") {
      const bytes = await optionalBytes(
        await safePath(this.repository.root, this.repository.configPath),
      );
      if (!bytes)
        throw new Problem(
          2,
          "CONFIG_MISSING",
          "Select an existing configuration.",
        );
      const raw = object(yaml(utf8(bytes)));
      if (raw.format_version !== 1)
        return {
          ...this.result(request, null, {
            compatible: false,
            source_version: raw.format_version,
            target_version: 1,
            supported_conversions: [],
            reason:
              "No supported conversion exists for this mandatory format version.",
          }),
          complete: false,
          exit_code: 2,
        };
      const s = await this.repository.snapshot();
      const report = {
        compatible: true,
        source_version: 1,
        target_version: 1,
        canonicalization: C14N,
        supported_conversions: [],
        note: "Format 1 is current. Explicit default expansion is the only supported rewrite.",
      };
      if (!request.input?.expand_defaults)
        return this.result(request, s, { ...report, upgraded: false });
      const outcome = await this.finishPlan(
        s,
        request,
        this.plan(
          s,
          "upgrade",
          new Map([[this.repository.configPath, stringify(s.config)]]),
        ),
      );
      return this.result(request, s, {
        ...(outcome as object),
        compatibility: report,
      });
    }
    if (request.operation === "init")
      return this.result(request, null, await this.init(request));
    if (request.operation === "recover") {
      const bytes = await optionalBytes(
        await safePath(this.repository.root, this.repository.configPath),
      );
      const recordsRoot = bytes
        ? parseConfig(yaml(utf8(bytes))).records_root
        : ".requirements";
      const action = request.input?.action;
      if (action !== "complete" && action !== "rollback")
        throw new Problem(2, "RECOVERY_ACTION", "Select complete or rollback.");
      return this.result(request, null, {
        recovered: await new Writer(
          this.repository.root,
          recordsRoot,
          this.repository.readOnly,
        ).recover(action),
      });
    }
    const s =
      frozen ??
      (request.indexed &&
      [
        "list",
        "search",
        "register",
        "trace",
        "matrix",
        "gaps",
        "show",
      ].includes(request.operation) &&
      this.repository.lastSnapshot &&
      (!request.ref || request.ref === this.repository.lastSnapshot.info.ref)
        ? this.repository.lastSnapshot
        : await this.repository.snapshot(
            ["diff", "impact"].includes(request.operation)
              ? (request.head ?? request.ref)
              : request.ref,
          ));
    let data: unknown;
    switch (request.operation) {
      case "validate":
        data = {
          requirements: s.requirements.length,
          documents: s.documents.length,
          records: s.records.length,
        };
        break;
      case "list":
      case "search":
      case "register": {
        const query = request.query?.toLowerCase();
        data = {
          project: s.config.project,
          specifications: s.config.specifications,
          documents: request.operation === "register" ? s.documents : [],
          summary: summary(s, request.scope, request.artifact),
          requirements: selectedRequirements(s)
            .map((r) => ({
              ...r,
              state: projection(s, r, request.scope, request.artifact),
              fileToken: index(s).fileTokens.get(r.path)!,
            }))
            .filter(
              (r) =>
                (!query || index(s).text.get(r.uid)!.includes(query)) &&
                (!request.specification ||
                  r.specification === request.specification ||
                  r.qualifiedId.startsWith(`${request.specification}:`)) &&
                (!request.lifecycle || r.lifecycle === request.lifecycle) &&
                (!request.disposition ||
                  r.disposition === request.disposition) &&
                (!request.currency || r.state.currency === request.currency) &&
                (!request.status ||
                  [
                    r.state.approval,
                    r.state.implementation,
                    r.state.verification,
                  ].includes(request.status)),
            ),
          baselines: s.baselines,
          records: request.operation === "register" ? s.records : [],
          readOnly: this.repository.readOnly || s.info.mode === "committed",
        };
        const registerData = data as {
          requirements: (Requirement & { state: unknown })[];
          summary: unknown;
        };
        registerData.summary = summary(
          s,
          request.scope,
          request.artifact,
          registerData.requirements,
        );
        if (request.limit !== undefined || request.offset !== undefined) {
          const register = data as {
            requirements: unknown[];
            total?: number;
            offset?: number;
          };
          register.total = register.requirements.length;
          register.offset = request.offset ?? 0;
          register.requirements = register.requirements.slice(
            register.offset,
            register.offset + (request.limit ?? 100),
          );
        }
        break;
      }
      case "show": {
        const r = resolve(s, this.target(request));
        data = {
          ...r,
          state: projection(s, r, request.scope, request.artifact),
          context: s.documents.find((d) => d.uid === r.document),
          incoming: s.requirements.filter((other) =>
            other.relations.some((e) => e.target === r.uid),
          ),
          fileToken: bytesDigest(s.files.get(r.path)!),
          impacts: s.records
            .filter(
              (rec) =>
                ["review", "assessment", "evidence"].includes(rec.kind) &&
                rec.subjects.some((sub) => sub.uid === r.uid),
            )
            .flatMap((rec) =>
              upstreamImpacts(s, rec, r).map((i) => ({
                ...i,
                record: rec.uid,
                scope: rec.scope,
              })),
            ),
        };
        break;
      }
      case "document.show": {
        const doc = s.documents.find(
          (d) => d.path === request.target || d.uid === request.target,
        );
        if (!doc)
          throw new Problem(2, "DOCUMENT_MISSING", "Select a document.");
        data = {
          ...doc,
          source: utf8(s.files.get(doc.path)!),
          fileToken: bytesDigest(s.files.get(doc.path)!),
        };
        break;
      }
      case "diff":
      case "impact": {
        let baseRef = request.base ?? "HEAD";
        const headRef = request.head ?? request.ref ?? "WORKTREE";
        if (request.mergeBase) {
          const headOid = await commit(
            this.repository.root,
            headRef === "WORKTREE" ? "HEAD" : headRef,
          );
          const baseOid = await commit(this.repository.root, baseRef);
          const bases = (
            await gitText(this.repository.root, [
              "merge-base",
              "--all",
              baseOid,
              headOid,
            ])
          ).split("\n");
          if (bases.length !== 1 || !bases[0])
            throw new Problem(
              3,
              "MERGE_BASE_AMBIGUOUS",
              "No unique merge base is available.",
            );
          baseRef = bases[0];
        }
        const base = await this.repository.snapshot(baseRef);
        const head = s;
        requireValid(base);
        requireValid(head);
        if (base.info.project !== head.info.project)
          throw new Problem(
            2,
            "PROJECT_MISMATCH",
            "Comparison endpoints belong to different projects.",
          );
        data =
          request.operation === "impact"
            ? impact(base, head, request.scope)
            : {
                ...compare(base, head),
                mode: request.mergeBase ? "merge_base" : "endpoints",
              };
        if (request.operation === "diff") {
          const report = data as ReturnType<typeof compare>;
          report.changes = report.changes.filter(
            (change) =>
              (change.before && this.matches(base, change.before, request)) ||
              (change.after && this.matches(head, change.after, request)),
          );
        }
        return this.result(request, head, data);
      }
      case "trace":
        data = selectedRequirements(s)
          .filter((r) => this.matches(s, r, request))
          .map((r) => ({
            uid: r.uid,
            label: r.qualifiedId,
            outgoing: r.relations,
            incoming: index(s).incoming.get(r.uid) ?? [],
          }));
        break;
      case "matrix":
      case "gaps": {
        const selected = selectedRequirements(s).filter((r) =>
          this.matches(s, r, request),
        );
        data = {
          selection: request,
          summary: summary(s, request.scope, request.artifact, selected),
          rows: selected.flatMap<Record<string, unknown>>((r) => {
            const state = projection(s, r, request.scope, request.artifact);
            const gaps = [
              !r.relations.some((e) => e.type === "implemented_by") &&
                "missing implementation link",
              !r.relations.some((e) => e.type === "verified_by") &&
                "missing verification obligation",
              state.approval !== "approved" && `approval: ${state.approval}`,
              state.verification !== "passed" &&
                `verification: ${state.verification}`,
              state.currency !== "current" && `currency: ${state.currency}`,
            ].filter(Boolean);
            if (request.operation === "gaps")
              return gaps.length
                ? [{ uid: r.uid, label: r.qualifiedId, gaps, state }]
                : [];
            return r.relations.map((edge) => ({
              uid: r.uid,
              label: r.qualifiedId,
              ...edge,
              target_kind:
                edge.type === "verified_by"
                  ? "verification"
                  : edge.type === "implemented_by"
                    ? "implementation"
                    : "requirement",
              state,
              target_label:
                index(s).requirements.get(edge.target)?.qualifiedId ??
                index(s).records.get(edge.target)?.title ??
                edge.target,
            }));
          }),
        };
        break;
      }
      case "evidence.attach":
        data = await this.attach(s, request);
        break;
      case "history":
        data = await this.history(s, request);
        break;
      case "baseline.list":
        data = s.baselines;
        break;
      case "baseline.show":
        data =
          s.baselines.find(
            (b) => b.name === request.target || b.uid === request.target,
          ) ?? null;
        break;
      case "review.list":
      case "assess.list":
      case "evidence.list":
      case "change.list":
      case "verification.list":
      case "impact.list":
        data = s.records.filter(
          (r) =>
            r.kind ===
            ({ assess: "assessment" }[request.operation.split(".")[0]] ??
              request.operation.split(".")[0]),
        );
        break;
      case "baseline.create":
        data = await this.baseline(s, request);
        break;
      case "review.create":
      case "assess.create":
      case "change.create":
      case "verification.create":
      case "impact.create":
      case "evidence.create":
        data = await this.record(s, request);
        break;
      case "requirement.add":
      case "requirement.edit":
      case "requirement.renumber":
      case "requirement.move":
      case "requirement.clone":
      case "requirement.retire":
      case "requirement.split":
      case "requirement.consolidate":
        data = await this.author(s, request);
        break;
      case "document.add":
        data = await this.addDocument(s, request);
        break;
      case "doctor":
        data = {
          node: process.version,
          git: await gitText(this.repository.root, ["--version"]),
          repository: this.repository.root,
          config: this.repository.configPath,
          versions: {
            tool: TOOL_VERSION,
            format: 1,
            canonicalization: C14N,
            output: 1,
          },
          limits: limits(),
          readOnly: this.repository.readOnly,
          cache:
            "Disposable in-memory indexes keyed by captured inputs. Indexed reads reuse the labeled capture; guarded writes and exports fully recapture authoritative files.",
          support:
            "Preview: tested platform evidence is documented in docs/status.md.",
        };
        break;
      default:
        throw new Problem(
          2,
          "COMMAND_UNKNOWN",
          `Unknown operation: ${request.operation}`,
        );
    }
    return this.result(request, s, data);
  }
  result(request: Request, s: Snapshot | null, data: unknown): Result {
    const findings = s?.diagnostics ?? [];
    const incomplete =
      findings.some((d) =>
        /^(LIMIT_|NORMATIVE_MISSING|LFS_UNAVAILABLE|READ_FAILURE|RECOVERY_)/.test(
          d.code,
        ),
      ) || (data as { complete?: boolean })?.complete === false;
    return {
      schema_version: 1,
      tool_version: TOOL_VERSION,
      operation: request.operation,
      complete: !incomplete,
      snapshot: s?.info ?? null,
      data,
      diagnostics: findings,
      exit_code: incomplete
        ? 3
        : findings.some((d) => d.severity === "error" && !d.waiver)
          ? 1
          : 0,
    };
  }
  private target(r: Request): string {
    if (!r.target)
      throw new Problem(
        2,
        "TARGET_REQUIRED",
        "A requirement reference is required.",
      );
    return r.target;
  }
  private matches(s: Snapshot, r: Requirement, request: Request) {
    const state = projection(s, r, request.scope, request.artifact);
    return (
      (!request.query ||
        index(s).text.get(r.uid)!.includes(request.query.toLowerCase())) &&
      (!request.specification ||
        r.specification === request.specification ||
        r.qualifiedId.startsWith(`${request.specification}:`)) &&
      (!request.lifecycle || r.lifecycle === request.lifecycle) &&
      (!request.disposition || r.disposition === request.disposition) &&
      (!request.currency || state.currency === request.currency) &&
      (!request.status ||
        [state.approval, state.implementation, state.verification].includes(
          request.status,
        ))
    );
  }
  private async attach(s: Snapshot, request: Request) {
    this.writable(s);
    const prior = s.records.find(
      (r) => r.uid === request.target && r.kind === "evidence",
    );
    if (!prior)
      throw new Problem(
        2,
        "EVIDENCE_MISSING",
        "Select an evidence record UUID.",
      );
    const input = request.input ?? {};
    const name = String(input.name ?? "");
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name))
      throw new Problem(
        2,
        "ATTACHMENT_NAME",
        "Use a portable filename without directories.",
      );
    const content = Buffer.from(String(input.content ?? ""), "base64");
    if (
      content.toString("base64") !== input.content ||
      content.length > 10 * 1024 * 1024
    )
      throw new Problem(
        2,
        "ATTACHMENT_CONTENT",
        "Provide canonical base64 content of at most 10 MiB.",
      );
    const uid = randomUUID();
    const attachment = {
      path: `${s.config.records_root}/attachments/${uid}/${name}`,
      sha256: bytesDigest(content),
      size: content.length,
    };
    const { path: oldPath, ...original } = prior;
    const record = parseRecord({
      ...original,
      uid,
      created_at: new Date().toISOString(),
      actor: input.actor,
      rationale: input.rationale,
      provenance: this.identity
        ? `${LOGIN_PROVENANCE}; attachment added; original provenance: ${prior.provenance}`
        : `local actor claim; unauthenticated; attachment added; original provenance: ${prior.provenance}`,
      supersedes: [prior.uid],
      attachments: [...(prior.attachments ?? []), attachment],
    });
    const plan = this.plan(
      s,
      request.operation,
      new Map([
        [`${s.config.records_root}/evidence/${uid}.md`, recordMarkdown(record)],
      ]),
    );
    plan.entries.push({
      path: attachment.path,
      before: null,
      after: content.toString("base64"),
    });
    return this.finishPlan(s, request, plan);
  }
  private writable(s?: Snapshot): void {
    if (this.repository.readOnly || s?.info.mode === "committed")
      throw new Problem(
        4,
        "READ_ONLY",
        "Editing requires an editable working-tree snapshot.",
      );
    if (s) requireValid(s, true);
  }
  plan(
    s: Snapshot | null,
    operation: string,
    changes: Map<string, string>,
    guards = true,
  ): WritePlan {
    return {
      uid: randomUUID(),
      repository: this.repository.root,
      configPath: this.repository.configPath,
      operation,
      state: "prepared",
      guards:
        s && guards
          ? Object.fromEntries(
              [...s.files].map(([p, b]) => [p, bytesDigest(b)]),
            )
          : {},
      ...(s
        ? {
            selection: {
              ...s.config.documents,
              recordsRoot: s.config.records_root,
            },
          }
        : {}),
      entries: [...changes].map(([path, after]) =>
        entry(path, s?.files.get(path) ?? null, after),
      ),
    };
  }
  async finishPlan(
    s: Snapshot | null,
    request: Request,
    plan: WritePlan,
    recordsRoot = s?.config.records_root ?? ".requirements",
  ): Promise<unknown> {
    this.writable(s ?? undefined);
    if (s && this.identity) this.auditChanges(s, request, plan, this.identity);
    if (request.sourceGuards) plan.sourceGuards = request.sourceGuards;
    for (const e of plan.entries) {
      const actual = await optionalBytes(
        await safePath(this.repository.root, e.path),
      );
      if (actual && e.before === null)
        throw new Problem(
          4,
          "OVERWRITE_REFUSED",
          `Refusing to overwrite existing ${e.path}.`,
        );
    }
    if (s) this.validatePlan(s, plan);
    if (request.apply && !request.dryRun)
      await new Writer(
        this.repository.root,
        recordsRoot,
        this.repository.readOnly,
      ).apply(plan);
    return {
      applied: Boolean(request.apply && !request.dryRun),
      repository: this.repository.root,
      configuration: this.repository.configPath,
      plan,
    };
  }
  private auditChanges(
    s: Snapshot,
    request: Request,
    plan: WritePlan,
    identity: Identity,
  ): void {
    const next = this.prospective(s, plan);
    const detail = object(request.input?.change ?? {});
    for (const change of compare(s, next).changes) {
      const before = change.before ? subject(change.before) : null;
      const after = change.after ? subject(change.after) : null;
      if (
        next.config.policy.require_change_record &&
        change.classes.some((c) =>
          [
            "definition",
            "governing_context",
            "scope_governance",
            "relationship",
            "retirement",
            "removal",
          ].includes(c),
        ) &&
        !String(detail.rationale ?? "").trim()
      )
        throw new Problem(
          1,
          "CHANGE_RECORD_REQUIRED",
          "Material changes require input.change.rationale.",
        );
      const requirement = change.after ?? change.before!;
      const rec = parseRecord({
        format_version: 1,
        uid: randomUUID(),
        kind: "change",
        created_at: new Date().toISOString(),
        actor: identity.username,
        provenance: LOGIN_PROVENANCE,
        rationale:
          typeof detail.rationale === "string" && detail.rationale.trim()
            ? detail.rationale
            : `Saved ${request.operation}: ${change.label}.`,
        scope: request.scope ?? "project",
        subjects: [subject(requirement)],
        dependencies: change.after ? dependencies(next, requirement) : [],
        changes: [{ before, after }],
        snapshot: next.info,
        details: {
          operation: request.operation,
          classes: change.classes,
          fields: change.fields,
          before_path: change.before?.path ?? null,
          after_path: change.after?.path ?? null,
        },
        ...(detail.work_references
          ? { work_references: detail.work_references }
          : {}),
      });
      plan.entries.push(
        entry(
          `${next.config.records_root}/changes/${rec.uid}.md`,
          null,
          recordMarkdown(rec),
        ),
      );
    }
  }
  private validatePlan(s: Snapshot, plan: WritePlan): void {
    const prospective = this.prospective(s, plan);
    const errors = validate(prospective);
    if (
      errors.some(
        (e) =>
          e.severity === "error" && !e.waiver && !e.code.startsWith("POLICY_"),
      )
    )
      throw new Problem(
        1,
        errors[0].code,
        errors.map((e) => e.message).join("; "),
      );
    if (prospective.config.policy.require_change_record) {
      const missing = compare(s, prospective).changes.filter(
        (change) =>
          change.classes.some((c) =>
            [
              "definition",
              "governing_context",
              "scope_governance",
              "relationship",
              "retirement",
              "removal",
            ].includes(c),
          ) &&
          !prospective.records.some(
            (rec) =>
              rec.kind === "change" &&
              rec.changes?.some(
                (pair) =>
                  stable(pair.before) ===
                    stable(change.before ? subject(change.before) : null) &&
                  stable(pair.after) ===
                    stable(change.after ? subject(change.after) : null),
              ),
          ),
      );
      if (missing.length)
        throw new Problem(
          1,
          "CHANGE_RECORD_REQUIRED",
          `Material changes require exact change rationale: ${missing.map((c) => c.label).join(", ")}. Supply input.change with actor and rationale.`,
        );
    }
  }
  private prospective(s: Snapshot, plan: WritePlan): Snapshot {
    const files = new Map(s.files);
    for (const e of plan.entries) {
      if (e.path.startsWith(`${s.config.records_root}/`) && e.before !== null)
        throw new Problem(
          4,
          "RECORD_IMMUTABLE",
          "Durable records and manifests are append-only; create a replacement identity.",
        );
      if (e.after === null) files.delete(e.path);
      else files.set(e.path, Buffer.from(e.after, "base64"));
    }
    const configuration = parseConfig(
      yaml(utf8(files.get(this.repository.configPath)!)),
    );
    const included = (p: string) =>
      configuration.documents.include.some((pattern) =>
        minimatch(p, pattern, { dot: true, noext: true, nonegate: true }),
      ) &&
      !configuration.documents.exclude.some((pattern) =>
        minimatch(p, pattern, { dot: true, noext: true, nonegate: true }),
      );
    for (const e of plan.entries)
      if (
        !e.path.startsWith(`${s.config.records_root}/`) &&
        e.path !== this.repository.configPath &&
        !included(e.path)
      )
        throw new Problem(
          2,
          "DOCUMENT_EXCLUDED",
          `${e.path} is outside document selection. Update configuration or choose an included path.`,
        );
    const documents = [...files.keys()]
      .filter(included)
      .map((p) => parseDocument(p, utf8(files.get(p)!), configuration, files));
    const records = [...s.records];
    for (const e of plan.entries)
      if (
        e.path.startsWith(`${s.config.records_root}/`) &&
        /\/(reviews|assessments|evidence|changes|verification|impacts)\/[^/]+\.md$/.test(
          e.path,
        ) &&
        e.path.endsWith(".md") &&
        e.after
      ) {
        if (e.before !== null)
          throw new Problem(
            4,
            "RECORD_IMMUTABLE",
            "Durable records are append-only; create a superseding record.",
          );
        records.push({
          ...parseRecord(
            parseFrontMatter(utf8(Buffer.from(e.after, "base64"))),
          ),
          path: e.path,
        });
      }
    return {
      ...s,
      config: configuration,
      files,
      documents,
      requirements: documents.flatMap((d) => d.requirements),
      records,
    };
  }
  async applySavedPlan(plan: WritePlan): Promise<void> {
    const prepared = await this.prepareSavedPlan(plan);
    await new Writer(
      this.repository.root,
      prepared.recordsRoot,
      this.repository.readOnly,
    ).apply(prepared.plan);
  }
  async prepareSavedPlan(
    plan: WritePlan,
  ): Promise<{ plan: WritePlan; recordsRoot: string }> {
    plan = parsePlan(plan);
    this.writable();
    const s = ["init", "restore"].includes(plan.operation)
      ? null
      : await this.repository.snapshot();
    if (
      !s &&
      (plan.entries.some((e) => e.before !== null) ||
        !plan.entries.some((e) => e.path === this.repository.configPath))
    )
      throw new Problem(
        2,
        "INIT_PLAN_INVALID",
        "Initialization plans may only create setup files and must include configuration.",
      );
    if (s) {
      requireValid(s, true);
      const expected = Object.keys(plan.guards).sort();
      if (stable([...s.files.keys()].sort()) !== stable(expected))
        throw new Problem(
          4,
          "WRITE_CONFLICT",
          "Authoritative file inventory changed after preview.",
        );
      for (const [file, hash] of Object.entries(plan.guards))
        if (bytesDigest(s.files.get(file)!) !== hash)
          throw new Problem(
            4,
            "WRITE_CONFLICT",
            `Source changed since preview: ${file}`,
          );
      this.validatePlan(s, plan);
    }
    const recordsRoot =
      s?.config.records_root ??
      parseConfig(
        yaml(
          utf8(
            Buffer.from(
              plan.entries.find((e) => e.path === this.repository.configPath)!
                .after!,
              "base64",
            ),
          ),
        ),
      ).records_root;
    if (!s) {
      if (
        (await gitText(this.repository.root, [
          "rev-parse",
          "--is-bare-repository",
        ])) === "true"
      )
        throw new Problem(
          2,
          "BARE_WRITE",
          "Applying setup or restore requires a Git working tree.",
        );
      if (plan.operation === "restore") {
        const { restoreArchive } = await import("./archive.js");
        await restoreArchive(
          this,
          { operation: "restore" },
          Buffer.from(
            JSON.stringify({
              schema_version: 1,
              config_path: this.repository.configPath,
              snapshot: {},
              git_history_included: false,
              external_artifacts_included: false,
              files: plan.entries.map((e) => ({
                path: e.path,
                encoding: "base64",
                content: e.after,
                sha256: bytesDigest(Buffer.from(e.after!, "base64")),
              })),
            }),
          ),
        );
      } else {
        const configuration = parseConfig(
          yaml(
            utf8(
              Buffer.from(
                plan.entries.find((e) => e.path === this.repository.configPath)!
                  .after!,
                "base64",
              ),
            ),
          ),
        );
        const empty: Snapshot = {
          config: configuration,
          files: new Map(),
          documents: [],
          requirements: [],
          records: [],
          baselines: [],
          diagnostics: [],
          info: {
            ref: "WORKTREE",
            objectId: null,
            captureId: "setup",
            project: configuration.project.uid,
            dirty: true,
            configDigest: "setup",
            canonicalization: C14N,
            repository: this.repository.root,
            mode: "working",
          },
        };
        requireValid(
          {
            ...this.prospective(empty, plan),
            diagnostics: validate(this.prospective(empty, plan)),
          },
          true,
        );
      }
    }
    return { plan, recordsRoot };
  }
  private async init(request: Request) {
    this.writable();
    if (
      (await gitText(this.repository.root, [
        "rev-parse",
        "--is-bare-repository",
      ])) === "true"
    )
      throw new Problem(
        2,
        "BARE_WRITE",
        "Initialization requires a working tree.",
      );
    const name =
      typeof request.input?.name === "string"
        ? request.input.name
        : "Requirements project";
    const project = randomUUID();
    const specification = randomUUID();
    const config = parseConfig({
      format_version: 1,
      project: { uid: project, name },
      documents: { include: ["requirements/**/*.md"], exclude: [] },
      specifications: [{ uid: specification, code: "REQ", title: name }],
    });
    const document = `<!-- rms-document\n${stringify({ format_version: 1, uid: randomUUID(), specification, title: name, context: "normative" })}-->\n\n# ${name.replace(/[\r\n]/g, " ")}\n\nProject requirements.\n`;
    const plan = this.plan(
      null,
      "init",
      new Map([
        [this.repository.configPath, stringify(config)],
        ["requirements/main.md", document],
      ]),
    );
    return {
      ...((await this.finishPlan(null, request, plan)) as object),
      ignoreSuggestion: [
        ".requirements/cache/",
        ".requirements/recovery/",
        ".requirements/reports/",
      ],
      note: "Review and add ignore rules yourself; init does not modify .gitignore.",
    };
  }
  private async addDocument(s: Snapshot, request: Request) {
    const input = request.input ?? {};
    if (typeof input.path !== "string")
      throw new Problem(2, "PATH_REQUIRED", "Provide a path for the document.");
    const metadata = readSchema(documentSchema, {
      format_version: 1,
      uid: randomUUID(),
      specification: s.config.specifications[0].uid,
      title: "New document",
      ...object(input.metadata ?? {}),
    });
    const content = `<!-- rms-document\n${stringify(metadata)}-->\n\n# ${metadata.title}\n`;
    parseDocument(input.path, content, s.config, s.files);
    return this.finishPlan(
      s,
      request,
      this.plan(s, request.operation, new Map([[input.path, content]])),
    );
  }
  private async author(s: Snapshot, request: Request) {
    this.writable(s);
    const input = request.input ?? {};
    const op = request.operation.slice(12);
    const source = op === "add" ? null : resolve(s, this.target(request));
    if (
      source &&
      input.fileToken !== undefined &&
      input.fileToken !== bytesDigest(s.files.get(source.path)!)
    )
      throw new Problem(
        4,
        "WRITE_CONFLICT",
        "The document changed since it was opened. Your draft has not been saved. Reload or reconcile it.",
      );
    const changes = new Map<string, string>();
    const documentPath =
      typeof input.document === "string"
        ? input.document
        : (source?.path ?? s.documents[0]?.path);
    if (!s.documents.some((d) => d.path === documentPath))
      throw new Problem(2, "DOCUMENT_MISSING", "Select an included document.");
    const replace = (r: Requirement, text: string) =>
      changes.set(
        r.path,
        utf8(s.files.get(r.path)!).slice(0, r.start) +
          text +
          utf8(s.files.get(r.path)!).slice(r.end),
      );
    const append = (text: string) => {
      const prior =
        changes.get(documentPath) ?? utf8(s.files.get(documentPath)!);
      const nl = prior.includes("\r\n") ? "\r\n" : "\n";
      changes.set(documentPath, `${prior}${nl}${nl}${text}${nl}`);
    };
    const newline = utf8(s.files.get(documentPath)!).includes("\r\n")
      ? "\r\n"
      : "\n";
    if (op === "move") {
      if (documentPath === source!.path)
        throw new Problem(
          2,
          "MOVE_SAME_DOCUMENT",
          "Choose a different destination document.",
        );
      replace(source!, "");
      append(requirementBlock(source!.metadata, source!.markdown, newline));
    } else if (op === "split" || op === "consolidate") {
      const predecessors =
        op === "split"
          ? [source!]
          : ((input.sources as string[]) ?? []).map((id) => resolve(s, id));
      if (op === "consolidate" && predecessors.length < 2)
        throw new Problem(
          2,
          "CONSOLIDATION_SOURCES",
          "Consolidation requires at least two source references.",
        );
      if (
        !Array.isArray(input.successors) ||
        input.successors.length < (op === "split" ? 2 : 1) ||
        typeof input.reason !== "string" ||
        !input.reason.trim()
      )
        throw new Problem(
          2,
          "SUCCESSORS_REQUIRED",
          "Provide explicit successor definitions and a retirement reason; evidence is not inherited.",
        );
      for (const path of new Set(predecessors.map((r) => r.path))) {
        let text = utf8(s.files.get(path)!);
        for (const r of predecessors
          .filter((r) => r.path === path)
          .sort((a, b) => b.start - a.start))
          text =
            text.slice(0, r.start) +
            requirementBlock(
              {
                ...r.metadata,
                lifecycle: "retired",
                retirement_reason: input.reason,
              },
              r.markdown,
              text.includes("\r\n") ? "\r\n" : "\n",
            ) +
            text.slice(r.end);
        changes.set(path, text);
      }
      for (const raw of input.successors) {
        const successor = object(raw);
        const metadata = {
          ...object(successor.metadata),
          uid: randomUUID(),
          ...(this.identity ? { author: this.identity.username } : {}),
          relations: predecessors.map((r) => ({
            type: "supersedes",
            target: r.uid,
          })),
        };
        if (typeof successor.markdown !== "string")
          throw new Problem(
            2,
            "BODY_REQUIRED",
            "Every successor requires Markdown.",
          );
        append(requirementBlock(metadata, successor.markdown, newline));
      }
    } else {
      const metadata: ObjectValue = {
        ...(source?.metadata ?? { uid: randomUUID(), id: input.id }),
        ...object(input.metadata ?? {}),
      };
      let markdown =
        typeof input.markdown === "string"
          ? input.markdown
          : (source?.markdown ?? "");
      if (op === "add" && !markdown) {
        if (
          typeof input.title !== "string" ||
          typeof input.statement !== "string"
        )
          throw new Problem(
            2,
            "BODY_REQUIRED",
            "Provide title and statement, or complete Markdown.",
          );
        markdown = `## ${input.title}\n\n### Statement\n\n${input.statement}`;
      }
      if (source && op !== "clone" && metadata.uid !== source.uid)
        throw new Problem(
          2,
          "IDENTITY_IMMUTABLE",
          "Editing cannot change a requirement UUID.",
        );
      if (op === "renumber") {
        if (typeof input.id !== "string")
          throw new Problem(2, "ID_REQUIRED", "Provide the new id.");
        metadata.id = input.id;
      }
      if (op === "clone") {
        metadata.uid = randomUUID();
        metadata.id = input.id;
        metadata.aliases = [];
        metadata.lifecycle = "draft";
      }
      if (op === "retire") {
        metadata.lifecycle = "retired";
        metadata.retirement_reason = input.reason;
      }
      if (this.identity && (op === "add" || op === "clone"))
        metadata.author = this.identity.username;
      else if (this.identity && source) {
        if (source.metadata.author !== undefined)
          metadata.author = source.metadata.author;
        else delete metadata.author;
      }
      const block = requirementBlock(metadata, markdown, newline);
      if (source && op !== "clone") replace(source, block);
      else append(block);
    }
    const plan = this.plan(s, request.operation, changes);
    if (input.change && !this.identity) {
      const detail = object(input.change);
      const next = this.prospective(s, plan);
      const pairs = compare(s, next).changes.filter(
        (c) =>
          c.before &&
          c.after &&
          c.classes.some((cls) =>
            [
              "definition",
              "governing_context",
              "scope_governance",
              "relationship",
              "retirement",
            ].includes(cls),
          ),
      );
      for (const pair of pairs) {
        const rec = parseRecord({
          format_version: 1,
          uid: randomUUID(),
          kind: "change",
          created_at: new Date().toISOString(),
          actor: detail.actor,
          rationale: detail.rationale,
          subjects: [subject(pair.after!)],
          dependencies: dependencies(next, pair.after!),
          scope: request.scope ?? "project",
          snapshot: next.info,
          ...detail,
          changes: [
            { before: subject(pair.before!), after: subject(pair.after!) },
          ],
        });
        plan.entries.push(
          entry(
            `${s.config.records_root}/changes/${rec.uid}.md`,
            null,
            recordMarkdown(rec),
          ),
        );
      }
    }
    return this.finishPlan(s, request, plan);
  }
  private async record(s: Snapshot, request: Request) {
    this.writable(s);
    const input = request.input ?? {};
    const refs = Array.isArray(input.subjects)
      ? input.subjects
      : [this.target(request)];
    const requirements = refs.map((ref) => resolve(s, String(ref)));
    if (
      input.fileToken !== undefined &&
      requirements.some(
        (r) => input.fileToken !== bytesDigest(s.files.get(r.path)!),
      )
    )
      throw new Problem(
        4,
        "WRITE_CONFLICT",
        "The reviewed document changed after opening. Reload and inspect it before creating a decision.",
      );
    const kind = request.operation.startsWith("assess.")
      ? "assessment"
      : request.operation.split(".")[0];
    const {
      subjects: ignored,
      fileToken,
      base: baseInput,
      head: headInput,
      trigger,
      ...payload
    } = input;
    let binding = {};
    if (kind === "change" || kind === "impact") {
      if (typeof baseInput !== "string" || baseInput === "WORKTREE")
        throw new Problem(
          2,
          "CHANGE_BASE_REQUIRED",
          "Provide an explicit committed base revision.",
        );
      const base = await this.repository.snapshot(baseInput);
      const head =
        typeof headInput === "string"
          ? await this.repository.snapshot(headInput)
          : s;
      requireValid(base, true);
      requireValid(head, true);
      if (
        base.info.project !== s.info.project ||
        head.info.project !== s.info.project
      )
        throw new Problem(
          2,
          "PROJECT_MISMATCH",
          "Change endpoints must belong to this project.",
        );
      const affected = impact(base, head).affected;
      const changes = compare(base, head).changes.filter((c) =>
        kind === "impact"
          ? c.uid === trigger
          : requirements.some((r) => r.uid === c.uid),
      );
      if (
        !changes.length ||
        requirements.some(
          (r) =>
            !head.requirements.some(
              (other) => stable(subject(other)) === stable(subject(r)),
            ),
        )
      )
        throw new Problem(
          4,
          "CHANGE_PAIR_INVALID",
          "The requested change is absent or its subjects differ from the current snapshot.",
        );
      const paths = affected
        .filter(
          (i) =>
            i.trigger === trigger && requirements.some((r) => r.uid === i.uid),
        )
        .map((i) => i.path);
      if (
        kind === "impact" &&
        requirements.some((r) => !paths.some((p) => p.at(-1) === r.uid))
      )
        throw new Problem(
          2,
          "IMPACT_PATH_MISSING",
          "Each impact subject must be reachable from the trigger through a causal relation.",
        );
      binding = {
        changes: changes.map((c) => ({
          before: c.before ? subject(c.before) : null,
          after: c.after ? subject(c.after) : null,
        })),
        ...(kind === "impact" ? { relation_paths: paths } : {}),
      };
    }
    const record = parseRecord({
      format_version: 1,
      uid: randomUUID(),
      kind,
      created_at: new Date().toISOString(),
      scope: request.scope ?? "project",
      supersedes: [],
      evidence: [],
      obligations: [],
      provenance: "local actor claim; unauthenticated",
      ...payload,
      ...(this.identity
        ? {
            actor: this.identity.username,
            provenance: LOGIN_PROVENANCE,
            created_at: new Date().toISOString(),
          }
        : {}),
      ...binding,
      subjects: requirements.map(subject),
      dependencies: [
        ...new Map(
          requirements
            .flatMap((r) => dependencies(s, r))
            .map((d) => [d.uid, d]),
        ).values(),
      ],
      snapshot: s.info,
    });
    assertPassing(s, record);
    const folder = {
      review: "reviews",
      assessment: "assessments",
      evidence: "evidence",
      change: "changes",
      verification: "verification",
      impact: "impacts",
    }[record.kind];
    const plan = this.plan(
      s,
      request.operation,
      new Map([
        [
          `${s.config.records_root}/${folder}/${record.uid}.md`,
          recordMarkdown(record),
        ],
      ]),
    );
    return this.finishPlan(s, request, plan);
  }
  private async baseline(s: Snapshot, request: Request) {
    this.writable(s);
    const input = request.input ?? {};
    if (typeof input.target !== "string" || input.target === "WORKTREE")
      throw new Problem(
        2,
        "BASELINE_COMMIT",
        "A baseline requires an existing committed target.",
      );
    const target = await this.repository.snapshot(input.target);
    requireValid(target);
    if (target.info.project !== s.info.project)
      throw new Problem(
        2,
        "PROJECT_MISMATCH",
        "Baseline target belongs to a different project.",
      );
    const selected = Array.isArray(input.selection)
      ? input.selection.map((ref) => resolve(target, String(ref)))
      : target.requirements;
    const eligibility = baselineEligibility(
      target,
      selected,
      request.scope,
      request.artifact,
    );
    if (eligibility.length)
      throw new Problem(
        1,
        "BASELINE_INELIGIBLE",
        eligibility.map((e) => e.message).join("; "),
      );
    const baseline = parseBaseline({
      format_version: 1,
      uid: randomUUID(),
      project: s.info.project,
      target: target.info.objectId,
      object_format: await gitText(this.repository.root, [
        "rev-parse",
        "--show-object-format",
      ]),
      created_at: new Date().toISOString(),
      actor: input.actor,
      name: input.name,
      description: input.description ?? "",
      config_digest: target.info.configDigest,
      canonicalization: C14N,
      selection: selected.map(subject),
      ...(input.supersedes ? { supersedes: input.supersedes } : {}),
    });
    if (s.baselines.some((b) => b.name === baseline.name))
      throw new Problem(
        4,
        "BASELINE_EXISTS",
        "Baseline names are immutable and unique.",
      );
    return this.finishPlan(
      s,
      request,
      this.plan(
        s,
        request.operation,
        new Map([
          [
            `${s.config.records_root}/baselines/${baseline.uid}.yml`,
            stringify(baseline),
          ],
        ]),
      ),
    );
  }
  private async history(s: Snapshot, request: Request) {
    const r = resolve(s, this.target(request));
    const ref = await commit(
      this.repository.root,
      request.ref === "WORKTREE" || !request.ref ? "HEAD" : request.ref,
    );
    const shallow =
      (await gitText(this.repository.root, [
        "rev-parse",
        "--is-shallow-repository",
      ])) === "true";
    const lines = (
      await gitText(this.repository.root, [
        "log",
        "--format=%H%x09%P%x09%an%x09%aI%x09%s",
        "-n",
        String(limits().history + 1),
        ref,
      ])
    )
      .split("\n")
      .filter(Boolean);
    const history: unknown[] = [];
    let incomplete = shallow || lines.length > limits().history;
    for (const line of lines.slice(0, limits().history)) {
      await checkpoint("Reading history", history.length, lines.length);
      const [oid, parents, author, time, message] = line.split("\t");
      try {
        const current = await this.repository.snapshot(oid);
        const item = current.requirements.find((x) => x.uid === r.uid);
        for (const parent of parents.split(" ").filter(Boolean)) {
          const previous = await this.repository.snapshot(parent);
          const change = compare(previous, current).changes.find(
            (c) => c.uid === r.uid,
          );
          if (change)
            history.push({
              commit: oid,
              parent,
              authorClaim: author,
              time,
              message,
              change,
            });
        }
        if (!parents && item)
          history.push({
            commit: oid,
            parent: null,
            authorClaim: author,
            time,
            message,
            change: { classes: ["addition"], after: item },
          });
      } catch (error) {
        incomplete = true;
        history.push({ commit: oid, unavailable: (error as Error).message });
      }
    }
    return {
      uid: r.uid,
      complete: !incomplete,
      shallow,
      limit: limits().history,
      history,
    };
  }
}
