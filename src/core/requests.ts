import { z } from "zod";
import { jsonValue } from "./data.js";

export const requestSchema = z
  .object({
    operation: z.string().min(1),
    ref: z.string().optional(),
    target: z.string().optional(),
    base: z.string().optional(),
    head: z.string().optional(),
    scope: z.string().optional(),
    query: z.string().optional(),
    specification: z.string().optional(),
    lifecycle: z.string().optional(),
    disposition: z.string().optional(),
    status: z.string().optional(),
    currency: z.string().optional(),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    indexed: z.boolean().optional(),
    report: z.enum(["inventory", "comparison", "matrix", "gaps"]).optional(),
    input: z.record(jsonValue).optional(),
    apply: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    mergeBase: z.boolean().optional(),
    artifact: z
      .object({ repository: z.string(), revision: z.string() })
      .strict()
      .optional(),
  })
  .strict();
export const exportRequestSchema = z
  .object({
    format: z.string(),
    ref: z.string().optional(),
    report: z.enum(["inventory", "comparison", "matrix", "gaps"]).optional(),
    base: z.string().optional(),
    head: z.string().optional(),
    query: z.string().optional(),
    specification: z.string().optional(),
    lifecycle: z.string().optional(),
    disposition: z.string().optional(),
    status: z.string().optional(),
    currency: z.string().optional(),
    scope: z.string().optional(),
    artifact: z
      .object({ repository: z.string(), revision: z.string() })
      .strict()
      .optional(),
  })
  .strict();
