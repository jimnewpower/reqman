import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { json as parseJson, utf8 } from "./core/data.js";
import { Problem } from "./core/model.js";
import { Service, failure, type Request } from "./core/service.js";
import type { WritePlan } from "./core/files.js";
import { AnalysisWorker } from "./core/worker-client.js";
import { Writer } from "./core/files.js";
import {
  operations,
  limits,
  type OperationContext,
} from "./core/operations.js";

export async function serve(service: Service, port = 0, uiDirectory?: string) {
  const configuredLimits = { ...limits() };
  const analysis = new AnalysisWorker(
    service.repository.root,
    service.repository.configPath,
    service.repository.readOnly,
    configuredLimits,
    new URL("../dist/worker.js", import.meta.url),
  );
  const token = randomBytes(32).toString("hex");
  const plans = new Map<string, WritePlan>();
  const ui =
    uiDirectory ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/ui");
  let origin = "";
  const jobs = new Map<
    string,
    { controller: AbortController; context: OperationContext }
  >();
  const server = createServer(async (req, res) => {
    const controller = new AbortController();
    const context: OperationContext = {
      signal: controller.signal,
      lastYield: Date.now(),
      limits: configuredLimits,
      progress: { stage: "Starting", atomic: false },
    };
    const suppliedId = req.headers["x-reqman-operation"];
    const id =
      typeof suppliedId === "string" && /^[a-f0-9-]{36}$/.test(suppliedId)
        ? suppliedId
        : randomBytes(16).toString("hex");
    jobs.set(id, { controller, context });
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    await operations.run(context, async () => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
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
      const send = (serialized: string, status = 200) => {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(serialized);
      };
      const analyze = (task: Parameters<AnalysisWorker["run"]>[0]) =>
        analysis.run(task, controller.signal, (progress) => {
          context.progress = progress;
        });
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
          throw new Problem(
            4,
            "HTTP_ORIGIN",
            "Cross-site access is forbidden.",
          );
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
          const raw = await readBody(
            req,
            ["/api/apply", "/api/progress", "/api/cancel"].includes(
              url.pathname,
            )
              ? 4096
              : limits().importBytes,
          );
          if (url.pathname === "/api/progress") {
            json(200, {
              jobs: [...jobs]
                .filter(([key]) => key !== id)
                .map(([key, job]) => ({ id: key, ...job.context.progress })),
            });
            return;
          }
          if (url.pathname === "/api/cancel") {
            const target = z
              .object({ operation: z.string() })
              .strict()
              .parse(parseJson(raw)).operation;
            const job = jobs.get(target);
            const accepted = Boolean(job && !job.context.progress.atomic);
            if (accepted) job!.controller.abort();
            json(200, {
              accepted,
              atomic: job?.context.progress.atomic ?? false,
            });
            return;
          }
          if (url.pathname === "/api/apply") {
            const id = z
              .object({ plan: z.string() })
              .strict()
              .parse(parseJson(raw)).plan;
            const plan = plans.get(id);
            if (!plan)
              throw new Problem(
                4,
                "PLAN_EXPIRED",
                "Preview expired. Generate another preview.",
              );
            const prepared = await analyze({
              kind: "prepare",
              request: { operation: "apply-plan" },
              plan,
            });
            if (!prepared.prepared) {
              send(prepared.serialized, prepared.httpStatus);
              return;
            }
            await new Writer(
              service.repository.root,
              prepared.prepared.recordsRoot,
              service.repository.readOnly,
            ).apply(prepared.prepared.plan);
            plans.delete(id);
            json(200, { applied: true });
            return;
          }
          if (url.pathname === "/api/export") {
            const report = await analyze({
              kind: "export",
              request: { operation: "export" },
              raw,
            });
            send(report.serialized, report.httpStatus);
            return;
          }
          if (url.pathname !== "/api/command")
            throw new Problem(2, "HTTP_ROUTE", "Unknown API route.");
          const result = await analyze({
            kind: "command",
            request: { operation: "http" },
            raw,
          });
          const plan = result.plan;
          if (plan) {
            if (plans.size >= 50) plans.delete(plans.keys().next().value!);
            plans.set(plan.uid, plan);
          }
          send(result.serialized, result.httpStatus);
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
          ? "text/javascript; charset=utf-8"
          : name.endsWith(".css")
            ? "text/css; charset=utf-8"
            : name.endsWith(".png")
              ? "image/png"
              : name.endsWith(".jpg") || name.endsWith(".jpeg")
                ? "image/jpeg"
                : "text/html; charset=utf-8";
        res.writeHead(200, { "Content-Type": type });
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
      } finally {
        jobs.delete(id);
      }
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 32;
  server.on("close", () => {
    void analysis.close();
  });
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
async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new Problem(
        3,
        "HTTP_LIMIT",
        `Request exceeds ${limit} bytes. Use --max-import-mib for an explicit override.`,
      );
    chunks.push(chunk);
  }
  return utf8(Buffer.concat(chunks));
}
