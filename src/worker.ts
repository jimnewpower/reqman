import { parentPort, workerData } from "node:worker_threads";
import { Repository } from "./core/repository.js";
import { Service, failure } from "./core/service.js";
import { operations, type OperationContext } from "./core/operations.js";
import { exportReport, importEvidence, migrate } from "./core/interchange.js";
import { restoreArchive } from "./core/archive.js";
import type { WritePlan } from "./core/files.js";
import type { WorkerTask } from "./core/worker-client.js";
import { json, readSchema } from "./core/data.js";
import { requestSchema, exportRequestSchema } from "./core/requests.js";
import { Problem, type Snapshot } from "./core/model.js";

const service = new Service(
  new Repository(workerData.root, workerData.configPath, workerData.readOnly),
);
parentPort!.on("message", async (task: WorkerTask) => {
  const controller = new AbortController();
  const context: OperationContext = {
    signal: controller.signal,
    lastYield: Date.now(),
    limits: workerData.limits,
    progress: { stage: "Starting analysis", atomic: false },
  };
  let progress = context.progress,
    lastProgress = 0;
  Object.defineProperty(context, "progress", {
    get: () => progress,
    set: (value) => {
      progress = value;
      if (Date.now() - lastProgress >= 200) {
        lastProgress = Date.now();
        parentPort!.postMessage({ progress });
      }
    },
  });
  await operations.run(context, async () => {
    try {
      if (task.raw !== undefined) {
        if (task.kind === "export") {
          const input = readSchema(exportRequestSchema, json(task.raw));
          task.request = { operation: "export", ...input };
          task.format = input.format;
        } else task.request = readSchema(requestSchema, json(task.raw));
        if (task.request.apply)
          throw new Problem(
            2,
            "PREVIEW_REQUIRED",
            "Browser mutations require preview followed by explicit apply.",
          );
      }
      if (task.kind === "prepare") {
        const prepared = await service.prepareSavedPlan(task.plan!);
        parentPort!.postMessage({ prepared, serialized: "{}" });
        return;
      }
      if (task.kind === "export") {
        let snapshot: Snapshot | undefined;
        const report = await exportReport(
          service,
          task.request,
          task.format!,
          (selected) => {
            snapshot = selected;
          },
        );
        parentPort!.postMessage({
          serialized: JSON.stringify(report),
          authority: {
            root: service.repository.root,
            paths: [...snapshot!.files.keys()],
          },
        });
        return;
      }
      const request = task.request;
      const bytes = Buffer.from(String(request.input?.content ?? ""));
      const result =
        request.operation === "restore"
          ? await restoreArchive(service, request, bytes)
          : request.operation === "evidence.import"
            ? await importEvidence(service, request, bytes)
            : request.operation === "migrate"
              ? await migrate(service, request, bytes)
              : await service.execute(request);
      const plan = (result.data as { plan?: WritePlan } | null)?.plan;
      parentPort!.postMessage({
        serialized: JSON.stringify(result),
        ...(plan ? { plan } : {}),
      });
    } catch (error) {
      const result = failure(task.request.operation, error);
      parentPort!.postMessage({
        httpStatus: result.exit_code === 4 ? 409 : 400,
        serialized: JSON.stringify(result),
      });
    }
  });
});
