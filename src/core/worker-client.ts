import { Worker } from "node:worker_threads";
import { Problem } from "./model.js";
import { failure, type Request } from "./service.js";
import type { WritePlan } from "./files.js";
import type { RuntimeLimits, OperationContext } from "./operations.js";
import type { Identity } from "./auth.js";

export interface WorkerResult {
  serialized: string;
  httpStatus?: number;
  authority?: { root: string; paths: string[] };
  plan?: WritePlan;
  prepared?: { plan: WritePlan; recordsRoot: string };
}
export type WorkerTask = {
  identity?: Identity;
  kind: "command" | "export" | "prepare";
  request: Request;
  raw?: string;
  format?: string;
  plan?: WritePlan;
};
type Queued = {
  task: WorkerTask;
  resolve: (value: WorkerResult) => void;
  signal: AbortSignal;
  progress: (value: OperationContext["progress"]) => void;
  abort: () => void;
};

export class AnalysisWorker {
  private worker?: Worker;
  private queue: Queued[] = [];
  private active?: Queued;
  private closed = false;
  constructor(
    private root: string,
    private configPath: string,
    private readOnly: boolean,
    private limits: RuntimeLimits,
    private workerFile: URL,
  ) {}
  run(
    task: WorkerTask,
    signal: AbortSignal,
    progress: Queued["progress"],
  ): Promise<WorkerResult> {
    return new Promise((resolve) => {
      const item: Queued = {
        task,
        resolve,
        signal,
        progress,
        abort: () => this.cancel(item),
      };
      signal.addEventListener("abort", item.abort, { once: true });
      this.queue.push(item);
      progress({ stage: "Queued for analysis", atomic: false });
      if (signal.aborted) this.cancel(item);
      else this.pump();
    });
  }
  private cancel(item: Queued) {
    if (this.active === item) {
      const worker = this.worker;
      this.worker = undefined;
      this.active = undefined;
      if (worker) void worker.terminate();
    } else this.queue = this.queue.filter((value) => value !== item);
    item.signal.removeEventListener("abort", item.abort);
    item.resolve({
      httpStatus: 400,
      serialized: JSON.stringify(
        failure(
          item.task.request.operation,
          new Problem(
            130,
            "OPERATION_CANCELLED",
            "Analysis cancelled before atomic replacement.",
          ),
        ),
      ),
    });
    this.pump();
  }
  private pump() {
    if (this.closed || this.active || !this.queue.length) return;
    const item = this.queue.shift()!;
    this.active = item;
    if (!this.worker) {
      const worker = new Worker(this.workerFile, {
        workerData: {
          root: this.root,
          configPath: this.configPath,
          readOnly: this.readOnly,
          limits: this.limits,
        },
      });
      this.worker = worker;
      worker.on(
        "message",
        (
          message: WorkerResult & { progress?: OperationContext["progress"] },
        ) => {
          if (this.worker !== worker || !this.active) return;
          if (message.progress) {
            this.active.progress(message.progress);
            return;
          }
          const active = this.active;
          this.active = undefined;
          active.signal.removeEventListener("abort", active.abort);
          active.resolve(message);
          this.pump();
        },
      );
      const failed = (error: Error) => {
        if (this.worker !== worker) return;
        this.worker = undefined;
        const active = this.active;
        this.active = undefined;
        if (active) {
          active.signal.removeEventListener("abort", active.abort);
          active.resolve({
            httpStatus: 400,
            serialized: JSON.stringify(
              failure(active.task.request.operation, error),
            ),
          });
        }
        this.pump();
      };
      worker.on("error", failed);
      worker.on("exit", (code) =>
        failed(
          new Error(`Analysis worker exited (${code}). Retry the operation.`),
        ),
      );
    }
    this.worker.postMessage(item.task);
  }
  async close() {
    this.closed = true;
    for (const item of [...this.queue]) this.cancel(item);
    if (this.active) this.cancel(this.active);
    const worker = this.worker;
    this.worker = undefined;
    if (worker) await worker.terminate();
  }
}
