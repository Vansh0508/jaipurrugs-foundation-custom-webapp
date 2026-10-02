import "server-only";
import type { AgentTraceEntry } from "@/lib/mastra/types";

// Mastra returns tool calls/results as chunks: { type, payload: { toolCallId, toolName, args | result, isError } }.
type ToolChunk = { payload?: Record<string, unknown> };

export function collectTrace(output: {
  steps?: { toolCalls?: unknown[]; toolResults?: unknown[] }[];
  toolCalls?: unknown[];
  toolResults?: unknown[];
}): AgentTraceEntry[] {
  const steps = output.steps ?? [];
  const calls = [...steps.flatMap((s) => s.toolCalls ?? []), ...(output.toolCalls ?? [])] as ToolChunk[];
  const results = [...steps.flatMap((s) => s.toolResults ?? []), ...(output.toolResults ?? [])] as ToolChunk[];

  const trace = new Map<string, AgentTraceEntry>();
  for (const call of calls) {
    const id = String(call.payload?.toolCallId ?? "");
    if (!id || trace.has(id)) continue;
    trace.set(id, {
      toolCallId: id,
      toolName: String(call.payload?.toolName ?? "unknown"),
      args: call.payload?.args ?? null,
      result: null,
      isError: false,
    });
  }
  for (const result of results) {
    const id = String(result.payload?.toolCallId ?? "");
    const entry = trace.get(id);
    if (!entry) continue;
    entry.result = result.payload?.result ?? null;
    entry.isError = Boolean(result.payload?.isError);
  }
  return [...trace.values()];
}
