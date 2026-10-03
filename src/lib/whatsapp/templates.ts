import type { WhatsAppTemplate, WhatsAppTemplateComponent } from "@/lib/zernio/types";

// Zernio's templateParams is one flat array in the order variables appear
// across the template: text header first, then body, then dynamic URL
// buttons. These helpers derive that order so values land in the right slot.

export const VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

export type VariableSource = "header" | "body" | "button";

export interface TemplateVariable {
  /** Position in the flat templateParams array. */
  index: number;
  source: VariableSource;
  /** The placeholder as written in the template, e.g. "1" or "customer_name". */
  placeholder: string;
  /** Which button, for source "button" (URL buttons each have their own {{1}}). */
  buttonIndex?: number;
  /** Stable identity used by template bindings: "body:1", "header:name", "button.0:1". */
  key: string;
}

export interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface TemplateSummary {
  name: string;
  language: string;
  category: string;
  status: string;
  headerText: string | null;
  /** Non-text header format (IMAGE/VIDEO/DOCUMENT/LOCATION), if any. */
  headerMediaFormat: string | null;
  bodyText: string;
  footerText: string | null;
  buttons: TemplateButton[];
  variables: TemplateVariable[];
}

export function variableKey(source: VariableSource, placeholder: string, buttonIndex?: number) {
  return source === "button" ? `button.${buttonIndex ?? 0}:${placeholder}` : `${source}:${placeholder}`;
}

export function placeholdersIn(text: string | undefined | null): string[] {
  if (!text) return [];
  const seen: string[] = [];
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

function componentOf(components: WhatsAppTemplateComponent[], type: string) {
  return components.find((c) => c.type?.toUpperCase() === type);
}

export function summarizeTemplate(template: WhatsAppTemplate): TemplateSummary {
  const header = componentOf(template.components, "HEADER");
  const body = componentOf(template.components, "BODY");
  const footer = componentOf(template.components, "FOOTER");
  const buttonsComponent = componentOf(template.components, "BUTTONS");

  const headerFormat = header?.format?.toUpperCase() ?? null;
  const headerText = headerFormat === "TEXT" ? (header?.text ?? null) : null;

  const variables: TemplateVariable[] = [];
  const push = (source: VariableSource, placeholders: string[], buttonIndex?: number) => {
    for (const placeholder of placeholders) {
      variables.push({
        index: variables.length,
        source,
        placeholder,
        buttonIndex,
        key: variableKey(source, placeholder, buttonIndex),
      });
    }
  };

  push("header", placeholdersIn(headerText));
  push("body", placeholdersIn(body?.text));

  const buttons: TemplateButton[] = (buttonsComponent?.buttons ?? []).map((button, i) => {
    const raw = button as Record<string, unknown>;
    if (button.type?.toUpperCase() === "URL") push("button", placeholdersIn(button.url), i);
    return {
      type: String(button.type ?? "").toUpperCase(),
      text: String(button.text ?? ""),
      url: typeof raw.url === "string" ? raw.url : undefined,
      phoneNumber: typeof raw.phone_number === "string" ? raw.phone_number : undefined,
    };
  });

  return {
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    headerText,
    headerMediaFormat: headerFormat && headerFormat !== "TEXT" ? headerFormat : null,
    bodyText: body?.text ?? "",
    footerText: footer?.text ?? null,
    buttons,
    variables,
  };
}

function fill(text: string, summary: TemplateSummary, params: string[], source: VariableSource, buttonIndex?: number) {
  return text.replace(VARIABLE_PATTERN, (_, raw: string) => {
    const key = variableKey(source, raw.trim(), buttonIndex);
    const variable = summary.variables.find((v) => v.key === key);
    const value = variable ? params[variable.index] : undefined;
    return value !== undefined && value !== "" ? value : `{{${raw.trim()}}}`;
  });
}

/** Fill header/body text with params, for previews and the tool trace. */
export function renderTemplatePreview(summary: TemplateSummary, params: string[]): string {
  return [
    summary.headerText ? fill(summary.headerText, summary, params, "header") : null,
    fill(summary.bodyText, summary, params, "body"),
    summary.footerText,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The filled parts separately, for the WhatsApp-style preview bubble. */
export function renderTemplateParts(summary: TemplateSummary, params: string[]) {
  return {
    header: summary.headerText ? fill(summary.headerText, summary, params, "header") : null,
    body: fill(summary.bodyText, summary, params, "body"),
    footer: summary.footerText,
    buttons: summary.buttons.map((button, i) => ({
      ...button,
      url: button.url ? fill(button.url, summary, params, "button", i) : undefined,
    })),
  };
}
