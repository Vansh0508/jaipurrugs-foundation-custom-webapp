"use client";

import { Chip, Disclosure } from "@heroui/react";
import type { AgentTraceEntry } from "@/lib/mastra/types";
import { traceFailed, traceSummary } from "./tool-trace";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-neutral-50 p-2 text-[11px] leading-relaxed text-neutral-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function ToolTracePanel({ trace }: { trace: AgentTraceEntry[] | null }) {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">Tool trace</h2>
        <p className="text-xs text-muted">
          {trace ? "Tool calls for the selected reply." : "Select an agent reply to inspect its tool calls."}
        </p>
      </div>

      {trace && trace.length === 0 ? (
        <p className="text-xs text-muted">No tools were called for this reply.</p>
      ) : null}

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {(trace ?? []).map((entry) => (
          <Disclosure key={entry.toolCallId} className="rounded-xl border border-border/70 bg-white">
            <Disclosure.Heading>
              <Disclosure.Trigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-xs font-medium">{entry.toolName}</span>
                  <span className="truncate text-xs text-muted">{traceSummary(entry)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Chip color={traceFailed(entry) ? "danger" : "success"} size="sm" variant="soft">
                    {traceFailed(entry) ? "Failed" : "OK"}
                  </Chip>
                  <Disclosure.Indicator />
                </span>
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="flex flex-col gap-2 px-3 pb-3">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Input</span>
                <Json value={entry.args} />
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Output</span>
                <Json value={entry.result} />
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        ))}
      </div>
    </div>
  );
}
