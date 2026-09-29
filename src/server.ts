import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { jsonValue, readSchema } from "./core/data.js";
import { FILE_LIMIT, Problem } from "./core/model.js";
import { Service, failure, type Request } from "./core/service.js";
import { exportReport, importEvidence, migrate } from "./core/interchange.js";
import type { WritePlan } from "./core/files.js";

const requestSchema = z
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
    input: z.record(jsonValue).optional(),
    apply: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    mergeBase: z.boolean().optional(),
    artifact: z
      .object({ repository: z.string(), revision: z.string() })
      .optional(),
  })
  .strict();
export async function serve(service: Service, port = 0, uiDirectory?: string) {
  const token = randomBytes(32).toString("hex");
  const plans = new Map<string, WritePlan>();
  const ui =
    uiDirectory ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/ui");
  let origin = "";
  const server = createServer(async (req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    const json = (status: number, value: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    try {
      if (
        req.headers.host !== origin.replace("http://", "") ||
        (req.headers.origin && req.headers.origin !== origin)
      )
        throw new Problem(
          4,
          "HTTP_ORIGIN",
          "Host or Origin is not this local session.",
        );
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new Problem(4, "HTTP_ORIGIN", "Cross-site access is forbidden.");
      const url = new URL(req.url ?? "/", origin);
      if (url.pathname.startsWith("/api/")) {
        const supplied = Buffer.from(
          req.headers.authorization?.replace(/^Bearer /, "") ?? "",
        );
        const expected = Buffer.from(token);
        if (
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        )
          throw new Problem(
            4,
            "HTTP_AUTH",
            "Enter the access key printed by reqman serve.",
          );
        if (
          req.method !== "POST" ||
          !req.headers["content-type"]?.startsWith("application/json")
        )
          throw new Problem(2, "HTTP_METHOD", "API requests must POST JSON.");
        const body = await readBody(req);
        if (url.pathname === "/api/apply") {
          const id = z.object({ plan: z.string() }).strict().parse(body).plan;
          const plan = plans.get(id);
          if (!plan)
            throw new Problem(
              4,
              "PLAN_EXPIRED",
              "Preview expired. Generate another preview.",
            );
          await service.applySavedPlan(plan);
          plans.delete(id);
          json(200, { applied: true });
          return;
        }
        if (url.pathname === "/api/export") {
          const exportInput = z
            .object({
              format: z.string(),
              ref: z.string().optional(),
              scope: z.string().optional(),
              artifact: z
                .object({ repository: z.string(), revision: z.string() })
                .strict()
                .optional(),
            })
            .strict()
            .parse(body);
          const report = await exportReport(
            service,
            { operation: "export", ...exportInput },
            exportInput.format,
          );
          json(200, report);
          return;
        }
        if (url.pathname !== "/api/command")
          throw new Problem(2, "HTTP_ROUTE", "Unknown API route.");
        const request = readSchema(requestSchema, body) as Request;
        if (request.apply)
          throw new Problem(
            2,
            "PREVIEW_REQUIRED",
            "Browser mutations require preview followed by explicit apply.",
          );
        const result =
          request.operation === "evidence.import"
            ? await importEvidence(
                service,
                request,
                Buffer.from(String(request.input?.content ?? "")),
              )
            : request.operation === "migrate"
              ? await migrate(
                  service,
                  request,
                  Buffer.from(String(request.input?.content ?? "")),
                )
              : await service.execute(request);
        const plan = (result.data as { plan?: WritePlan } | null)?.plan;
        if (plan) {
          if (plans.size >= 50) plans.delete(plans.keys().next().value!);
          plans.set(plan.uid, plan);
        }
        json(200, result);
        return;
      }
      if (req.method !== "GET")
        throw new Problem(2, "HTTP_METHOD", "Static resources require GET.");
      const name =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname.slice(1));
      if (!/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(name)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const file = path.resolve(ui, name);
      const content = await readFile(file);
      const type = name.endsWith(".js")
        ? "text/javascript"
        : name.endsWith(".css")
          ? "text/css"
          : "text/html";
      res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
      res.end(content);
    } catch (error) {
      const result = failure("http", error);
      json(
        result.diagnostics[0].code === "HTTP_AUTH"
          ? 401
          : result.exit_code === 4
            ? 409
            : 400,
        result,
      );
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 32;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No loopback address");
  origin = `http://127.0.0.1:${address.port}`;
  return { server, origin, token };
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > FILE_LIMIT)
      throw new Problem(3, "HTTP_LIMIT", "Request exceeds 10 MiB.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Problem(2, "JSON_INVALID", "Invalid request JSON.");
  }
}
