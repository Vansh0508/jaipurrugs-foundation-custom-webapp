import type { WhatsAppTemplate } from "@/lib/zernio/types";

// Zernio's templateParams is one flat array in the order variables appear
// across the template: text header first, then body, then dynamic URL
// buttons. These helpers derive that order so the agent knows what to fill.

const VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

export interface TemplateVariable {
  /** Position in the flat templateParams array. */
  index: number;
  source: "header" | "body" | "button";
  /** The placeholder as written in the template, e.g. "1" or "customer_name". */
  placeholder: string;
}

export interface TemplateSummary {
  name: string;
  language: string;
  category: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  variables: TemplateVariable[];
}

function variablesIn(text: string | undefined): string[] {
  if (!text) return [];
  const seen: string[] = [];
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

function componentOf(template: WhatsAppTemplate, type: string) {
  return template.components.find((c) => c.type?.toUpperCase() === type);
}

export function summarizeTemplate(template: WhatsAppTemplate): TemplateSummary {
  const header = componentOf(template, "HEADER");
  const body = componentOf(template, "BODY");
  const footer = componentOf(template, "FOOTER");
  const buttons = componentOf(template, "BUTTONS");

  const headerText = header?.format?.toUpperCase() === "TEXT" ? (header.text ?? null) : null;

  const variables: TemplateVariable[] = [];
  const push = (source: TemplateVariable["source"], placeholders: string[]) => {
    for (const placeholder of placeholders) {
      variables.push({ index: variables.length, source, placeholder });
    }
  };

  push("header", variablesIn(headerText ?? undefined));
  push("body", variablesIn(body?.text));
  for (const button of buttons?.buttons ?? []) {
    if (button.type?.toUpperCase() === "URL") push("button", variablesIn(button.url));
  }

  return {
    name: template.name,
    language: template.language,
    category: template.category,
    headerText,
    bodyText: body?.text ?? "",
    footerText: footer?.text ?? null,
    variables,
  };
}

/** Fill the header/body text with params, for previews and the tool trace. */
export function renderTemplatePreview(summary: TemplateSummary, params: string[]): string {
  const valueFor = (source: TemplateVariable["source"], placeholder: string) => {
    const variable = summary.variables.find(
      (v) => v.source === source && v.placeholder === placeholder,
    );
    return variable ? (params[variable.index] ?? `{{${placeholder}}}`) : `{{${placeholder}}}`;
  };

  const fill = (text: string, source: TemplateVariable["source"]) =>
    text.replace(VARIABLE_PATTERN, (_, placeholder: string) => valueFor(source, placeholder.trim()));

  return [
    summary.headerText ? fill(summary.headerText, "header") : null,
    fill(summary.bodyText, "body"),
    summary.footerText,
  ]
    .filter(Boolean)
    .join("\n\n");
}
