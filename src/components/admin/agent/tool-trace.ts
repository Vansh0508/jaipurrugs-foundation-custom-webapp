import type { AgentTraceEntry } from "@/lib/mastra/types";

// Display helpers for the simulator's tool trace. Tool results are stored
// as-is from the tool's execute(); these read them defensively since old
// sessions may predate a result-shape change.

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec {
  return typeof value === "object" && value !== null ? (value as Rec) : {};
}

export function traceSummary(entry: AgentTraceEntry): string {
  const result = asRecord(entry.result);
  if (entry.isError) return "error";
  if (typeof result.error === "string") return result.error;

  switch (entry.toolName) {
    case "getUserSubmissions":
      return `found ${Number(result.found ?? 0)} submission(s)`;
    case "searchKnowledgeBase":
      return `${Number(result.matched ?? 0)} article(s) matched`;
    case "getWhatsAppTemplates":
      return `${Array.isArray(result.templates) ? result.templates.length : 0} template(s)`;
    case "sendWhatsAppTemplate":
      if (Array.isArray(result.missing)) return `needs ${result.missing.length} detail(s) first`;
      return result.sent ? "sent via Zernio" : result.mode === "preview" ? "preview only" : "not sent";
    case "getLeadProfile":
      return result.exists ? `lead found${result.name ? `: ${String(result.name)}` : ""}` : "no lead yet";
    case "saveLeadDetails": {
      const saved = Array.isArray(result.saved) ? result.saved.length : 0;
      const rejected = Array.isArray(result.rejected) ? result.rejected.length : 0;
      return `saved ${saved + (result.savedName ? 1 : 0)} detail(s)${rejected ? `, ${rejected} rejected` : ""}`;
    }
    default:
      return "done";
  }
}

export function traceFailed(entry: AgentTraceEntry): boolean {
  return entry.isError || typeof asRecord(entry.result).error === "string";
}

export interface TemplateCard {
  templateName: string;
  language: string;
  preview: string;
  sent: boolean;
}

export function templateCardsIn(trace: AgentTraceEntry[]): TemplateCard[] {
  return trace
    .filter((entry) => entry.toolName === "sendWhatsAppTemplate")
    .map((entry) => asRecord(entry.result))
    .filter((result) => typeof result.preview === "string")
    .map((result) => ({
      templateName: String(result.templateName ?? ""),
      language: String(result.language ?? ""),
      preview: String(result.preview),
      sent: Boolean(result.sent),
    }));
}
