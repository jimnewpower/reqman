import { AsyncLocalStorage } from "node:async_hooks";
import { setImmediate } from "node:timers/promises";
import { Problem } from "./model.js";

export interface OperationContext {
  signal: AbortSignal;
  progress: {
    stage: string;
    completed?: number;
    total?: number;
    atomic: boolean;
  };
  lastYield: number;
  limits?: RuntimeLimits;
}
export interface RuntimeLimits {
  fileBytes: number;
  snapshotBytes: number;
  importBytes: number;
  requirements: number;
  edges: number;
  files: number;
  depth: number;
  history: number;
  impacts: number;
}
export const defaultLimits: RuntimeLimits = {
  fileBytes: 10 * 1024 * 1024,
  snapshotBytes: 100 * 1024 * 1024,
  importBytes: 100 * 1024 * 1024,
  requirements: 100000,
  edges: 1000000,
  files: 250000,
  depth: 128,
  history: 200,
  impacts: 100000,
};
export function limits(): RuntimeLimits {
  return operations.getStore()?.limits ?? defaultLimits;
}
export const operations = new AsyncLocalStorage<OperationContext>();
export function cancellation(): void {
  const context = operations.getStore();
  if (context?.signal.aborted && !context.progress.atomic)
    throw new Problem(
      130,
      "OPERATION_CANCELLED",
      "Operation cancelled before atomic replacement. No pending preview was applied.",
    );
}
export async function checkpoint(
  stage: string,
  completed?: number,
  total?: number,
): Promise<void> {
  const context = operations.getStore();
  if (!context) return;
  context.progress = {
    stage,
    completed,
    total,
    atomic: context.progress.atomic,
  };
  cancellation();
  if (Date.now() - context.lastYield > 20) {
    context.lastYield = Date.now();
    await setImmediate();
    cancellation();
  }
}
export function atomic(value: boolean): void {
  const context = operations.getStore();
  if (context) context.progress.atomic = value;
}
