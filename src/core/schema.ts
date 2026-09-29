import { z } from "zod";
import {
  extensionSchema,
  jsonValue,
  label,
  nonempty,
  relativePath,
  uuid,
  readSchema,
} from "./data.js";
import {
  Problem,
  type Config,
  type DurableRecord,
  type Baseline,
} from "./model.js";

export const configSchema = z
  .object({
    format_version: z.literal(1),
    project: z.object({ uid: uuid, name: nonempty }).strict(),
    documents: z
      .object({
        include: z.array(nonempty).min(1),
        exclude: z.array(nonempty).default([]),
      })
      .strict(),
    records_root: relativePath.default(".requirements"),
    specifications: z
      .array(
        z
          .object({
            uid: uuid,
            code: label,
            title: nonempty,
            version_label: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
    fields: z
      .record(
        z
          .object({
            type: z.enum([
              "string",
              "boolean",
              "integer",
              "date",
              "enum",
              "string[]",
              "boolean[]",
              "integer[]",
              "date[]",
              "enum[]",
            ]),
            values: z.array(z.string()).optional(),
            required: z.boolean().default(false),
            change_class: z.enum(["content", "scope", "administrative"]),
          })
          .strict(),
      )
      .default({}),
    policy: z
      .object({
        approval: z
          .object({
            minimum_reviews: z.number().int().min(1).default(1),
            require_distinct_author: z.boolean().default(false),
            roles: z.array(nonempty).default([]),
          })
          .strict()
          .default({}),
        removal: z.literal("require_retirement").default("require_retirement"),
        unknown_fields: z.literal("error").default("error"),
        review_impact: z.literal("conservative").default("conservative"),
        require_rationale: z.boolean().default(false),
        require_acceptance: z.boolean().default(false),
      })
      .strict()
      .default({}),
    extensions: extensionSchema,
  })
  .strict();
export function config(value: unknown): Config {
  const c = readSchema(configSchema, value);
  for (const key of ["uid", "code"] as const)
    if (
      new Set(c.specifications.map((s) => s[key])).size !==
      c.specifications.length
    )
      throw new Problem(
        2,
        "IDENTITY_DUPLICATE",
        `Duplicate specification ${key}.`,
      );
  for (const [name, field] of Object.entries(c.fields))
    if (field.type.startsWith("enum") && !field.values?.length)
      throw new Problem(2, "FIELD_ENUM", `${name} must declare enum values.`);
  return c;
}
export const documentSchema = z
  .object({
    format_version: z.literal(1),
    uid: uuid,
    specification: uuid,
    title: nonempty,
    context: z.enum(["normative", "informative"]).default("normative"),
    normative_files: z.array(relativePath).default([]),
    extensions: extensionSchema,
  })
  .strict();
export const requirementSchema = z
  .object({
    uid: uuid,
    id: label,
    lifecycle: z.enum(["draft", "active", "retired"]).default("draft"),
    disposition: z
      .enum(["in_scope", "deferred", "not_applicable", "transferred"])
      .default("in_scope"),
    reason: z.string().optional(),
    retirement_reason: z.string().optional(),
    target: z.string().optional(),
    author: z.string().optional(),
    owner: z.string().optional(),
    aliases: z.array(nonempty).default([]),
    tags: z.array(z.string()).default([]),
    fields: z.record(jsonValue).default({}),
    relations: z
      .array(
        z
          .object({
            type: z.enum([
              "refines",
              "depends_on",
              "related_to",
              "supersedes",
              "verified_by",
              "implemented_by",
            ]),
            target: nonempty,
          })
          .strict(),
      )
      .default([]),
    normative_files: z.array(relativePath).default([]),
    extensions: extensionSchema,
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      ["deferred", "not_applicable"].includes(r.disposition) &&
      !r.reason?.trim()
    )
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Disposition requires a reason",
      });
    if (r.disposition === "transferred" && !r.target?.trim())
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "Transferred requires a target",
      });
    if (r.lifecycle === "retired" && !r.retirement_reason?.trim())
      ctx.addIssue({
        code: "custom",
        path: ["retirement_reason"],
        message: "Retirement requires a reason",
      });
  });
export const subjectSchema = z
  .object({
    uid: uuid,
    definition: nonempty,
    governance: nonempty,
    canonicalization: nonempty,
  })
  .strict();
const snapshotSchema = z
  .object({
    ref: z.string(),
    objectId: z.string().nullable(),
    captureId: z.string(),
    project: uuid,
    dirty: z.boolean(),
    configDigest: z.string(),
    canonicalization: z.string(),
    repository: z.string(),
    mode: z.enum(["committed", "working"]),
  })
  .strict();
export const recordSchema = z
  .object({
    format_version: z.literal(1),
    uid: uuid,
    kind: z.enum([
      "review",
      "assessment",
      "evidence",
      "change",
      "verification",
      "impact",
    ]),
    created_at: z.string().datetime({ offset: true }),
    actor: nonempty,
    subjects: z.array(subjectSchema),
    dependencies: z.array(subjectSchema),
    scope: nonempty.default("project"),
    rationale: nonempty,
    decision: z.string().optional(),
    category: z.enum(["implementation", "verification"]).optional(),
    supersedes: z.array(uuid).default([]),
    role: z.string().optional(),
    artifact: z
      .object({ repository: nonempty, revision: nonempty })
      .strict()
      .optional(),
    evidence: z.array(uuid).default([]),
    obligations: z.array(uuid).default([]),
    result: z
      .enum(["passed", "failed", "blocked", "inconclusive", "skipped"])
      .optional(),
    method: z
      .enum([
        "test",
        "inspection",
        "analysis",
        "demonstration",
        "manual_acceptance",
      ])
      .optional(),
    run_id: z.string().optional(),
    source_digest: z.string().optional(),
    producer: z.string().optional(),
    location: z.string().optional(),
    test_key: z.string().optional(),
    duration: z.number().int().nonnegative().optional(),
    details: z.record(jsonValue).optional(),
    title: z.string().optional(),
    snapshot: snapshotSchema.optional(),
    provenance: nonempty.default("local actor claim; unauthenticated"),
  })
  .strict()
  .superRefine((r, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (!r.subjects.length) invalid("At least one exact subject is required");
    if (
      r.kind === "review" &&
      !["approved", "changes_requested", "rejected", "revoked"].includes(
        r.decision || "",
      )
    )
      invalid("Invalid review decision");
    if (
      r.kind === "assessment" &&
      (!r.category ||
        !(
          r.category === "implementation"
            ? ["not_started", "partial", "implemented"]
            : ["planned", "passed", "failed", "blocked", "inconclusive"]
        ).includes(r.decision || ""))
    )
      invalid("Invalid assessment category/decision");
    if (
      r.kind === "evidence" &&
      (!r.artifact || !r.result || !r.method || !r.location)
    )
      invalid("Evidence requires artifact, result, method, and location");
    if (r.kind === "verification" && (!r.title || !r.method))
      invalid("Verification definition requires title and method");
    if (
      r.kind === "impact" &&
      (!["rework", "reverify", "no_impact"].includes(r.decision || "") ||
        !r.details)
    )
      invalid("Impact requires decision and exact change details");
  });
export const baselineSchema = z
  .object({
    format_version: z.literal(1),
    uid: uuid,
    name: label,
    project: uuid,
    target: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
    object_format: z.enum(["sha1", "sha256"]),
    created_at: z.string().datetime({ offset: true }),
    actor: nonempty,
    description: z.string(),
    config_digest: nonempty,
    canonicalization: nonempty,
    selection: z.array(subjectSchema),
    supersedes: uuid.optional(),
  })
  .strict();
export function parseRecord(value: unknown): DurableRecord {
  return readSchema(recordSchema, value);
}
export function parseBaseline(value: unknown): Baseline {
  return readSchema(baselineSchema, value);
}
