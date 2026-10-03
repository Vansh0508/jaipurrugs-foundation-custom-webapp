import { isLeadFieldRef, type LeadFieldRef } from "@/lib/leads/fields";
import type { TemplateVariableBinding } from "@/lib/whatsapp/bindings";
import {
  placeholdersIn,
  summarizeTemplate,
  VARIABLE_PATTERN,
  type TemplateSummary,
} from "@/lib/whatsapp/templates";
import type { WhatsAppTemplate, WhatsAppTemplateComponent } from "@/lib/zernio/types";

// Draft model for the in-app template builder, Meta's authoring rules, and
// the component payload Zernio forwards to Meta (POST /v1/whatsapp/templates).
// Text headers only for now — media headers need Meta's upload flow.

export const TEMPLATE_CATEGORIES = [
  { id: "UTILITY", label: "Utility", hint: "Updates about something the contact started (receipts, reminders, status)." },
  { id: "MARKETING", label: "Marketing", hint: "Announcements, offers, invitations. Higher Meta fee, stricter review." },
] as const;

export const TEMPLATE_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "en_US", label: "English (US)" },
  { id: "en_GB", label: "English (UK)" },
  { id: "hi", label: "Hindi" },
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]["id"];
export type ParameterFormat = "POSITIONAL" | "NAMED";

export type TemplateButtonDraft =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phoneNumber: string };

export interface VariableDraft {
  /** Sample value Meta's reviewers see. Required by Meta for every variable. */
  example: string;
  field: LeadFieldRef | "";
  fallback: string;
}

export interface TemplateDraft {
  name: string;
  category: TemplateCategory;
  language: string;
  parameterFormat: ParameterFormat;
  headerText: string;
  bodyText: string;
  footerText: string;
  buttons: TemplateButtonDraft[];
  /** Keyed by TemplateVariable.key. */
  variables: Record<string, VariableDraft>;
}

export const EMPTY_DRAFT: TemplateDraft = {
  name: "",
  category: "UTILITY",
  language: "en",
  parameterFormat: "POSITIONAL",
  headerText: "",
  bodyText: "",
  footerText: "",
  buttons: [],
  variables: {},
};

export const LIMITS = {
  name: 512,
  header: 60,
  body: 1024,
  footer: 60,
  buttonText: 25,
  buttons: 10,
  urlButtons: 2,
  phoneButtons: 1,
} as const;

/** Uppercase component shape, matching what Zernio's list endpoint returns. */
function draftComponents(draft: TemplateDraft): WhatsAppTemplateComponent[] {
  const components: WhatsAppTemplateComponent[] = [];
  if (draft.headerText.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: draft.headerText.trim() });
  }
  components.push({ type: "BODY", text: draft.bodyText });
  if (draft.footerText.trim()) components.push({ type: "FOOTER", text: draft.footerText.trim() });
  if (draft.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: draft.buttons.map((b) =>
        b.type === "URL"
          ? { type: "URL", text: b.text, url: b.url }
          : b.type === "PHONE_NUMBER"
            ? { type: "PHONE_NUMBER", text: b.text, phone_number: b.phoneNumber }
            : { type: "QUICK_REPLY", text: b.text },
      ),
    });
  }
  return components;
}

/** The draft as a template summary, so the builder previews exactly like a live template. */
export function summarizeDraft(draft: TemplateDraft): TemplateSummary {
  const template: WhatsAppTemplate = {
    id: "draft",
    name: draft.name || "untitled",
    status: "DRAFT",
    category: draft.category,
    language: draft.language,
    components: draftComponents(draft),
  };
  return summarizeTemplate(template);
}

export function draftExampleParams(draft: TemplateDraft, summary = summarizeDraft(draft)): string[] {
  return summary.variables.map((v) => draft.variables[v.key]?.example ?? "");
}

const NAMED_PLACEHOLDER = /^[a-z][a-z0-9_]*$/;
const POSITIONAL_PLACEHOLDER = /^[1-9][0-9]*$/;

function checkPlaceholders(
  label: string,
  text: string,
  format: ParameterFormat,
  errors: string[],
) {
  const placeholders = placeholdersIn(text);
  if (format === "POSITIONAL") {
    const bad = placeholders.filter((p) => !POSITIONAL_PLACEHOLDER.test(p));
    if (bad.length) errors.push(`${label}: use {{1}}, {{2}}… for positional variables (found {{${bad[0]}}}).`);
    else if (placeholders.some((p, i) => Number(p) !== i + 1)) {
      errors.push(`${label}: number variables in order starting at {{1}}.`);
    }
  } else {
    const bad = placeholders.filter((p) => !NAMED_PLACEHOLDER.test(p));
    if (bad.length) {
      errors.push(`${label}: named variables are lowercase letters, numbers and _ (found {{${bad[0]}}}).`);
    }
  }
  return placeholders;
}

/** Meta's authoring rules we can check before submitting. Empty array = valid. */
export function validateDraft(draft: TemplateDraft): string[] {
  const errors: string[] = [];

  if (!/^[a-z][a-z0-9_]*$/.test(draft.name)) {
    errors.push("Name: lowercase letters, numbers and underscores, starting with a letter.");
  } else if (draft.name.length > LIMITS.name) {
    errors.push(`Name: at most ${LIMITS.name} characters.`);
  }

  const header = draft.headerText.trim();
  if (header.length > LIMITS.header) errors.push(`Header: at most ${LIMITS.header} characters.`);
  const headerVars = checkPlaceholders("Header", header, draft.parameterFormat, errors);
  if (headerVars.length > 1) errors.push("Header: at most one variable.");

  const body = draft.bodyText.trim();
  if (!body) errors.push("Body is required.");
  if (draft.bodyText.length > LIMITS.body) errors.push(`Body: at most ${LIMITS.body} characters.`);
  checkPlaceholders("Body", body, draft.parameterFormat, errors);
  if (/^\{\{[^}]+\}\}/.test(body) || /\{\{[^}]+\}\}[.!?]?$/.test(body)) {
    errors.push("Body: Meta rejects templates that start or end with a variable — add text around it.");
  }

  const footer = draft.footerText.trim();
  if (footer.length > LIMITS.footer) errors.push(`Footer: at most ${LIMITS.footer} characters.`);
  if (placeholdersIn(footer).length > 0) errors.push("Footer: variables aren't allowed.");

  if (draft.buttons.length > LIMITS.buttons) errors.push(`At most ${LIMITS.buttons} buttons.`);
  const urlButtons = draft.buttons.filter((b) => b.type === "URL");
  const phoneButtons = draft.buttons.filter((b) => b.type === "PHONE_NUMBER");
  if (urlButtons.length > LIMITS.urlButtons) errors.push(`At most ${LIMITS.urlButtons} website buttons.`);
  if (phoneButtons.length > LIMITS.phoneButtons) errors.push("At most one call button.");

  draft.buttons.forEach((button, i) => {
    const label = `Button ${i + 1}`;
    if (!button.text.trim()) errors.push(`${label}: text is required.`);
    if (button.text.length > LIMITS.buttonText) errors.push(`${label}: at most ${LIMITS.buttonText} characters.`);
    if (button.type === "URL") {
      if (!/^https:\/\/[^\s]+$/.test(button.url)) errors.push(`${label}: URL must start with https://.`);
      const vars = placeholdersIn(button.url);
      if (vars.length > 1 || (vars.length === 1 && !/\{\{1\}\}$/.test(button.url))) {
        errors.push(`${label}: a website button can only have {{1}}, at the end of the URL.`);
      }
    }
    if (button.type === "PHONE_NUMBER" && !/^\+[1-9][0-9]{7,14}$/.test(button.phoneNumber.replace(/\s/g, ""))) {
      errors.push(`${label}: phone number in international format, e.g. +919876543210.`);
    }
  });

  const summary = summarizeDraft(draft);
  for (const variable of summary.variables) {
    const v = draft.variables[variable.key];
    const name = `{{${variable.placeholder}}} (${variable.source === "button" ? "button" : variable.source})`;
    if (!v?.example.trim()) errors.push(`${name}: add an example value for Meta's review.`);
    if (!v?.field || !isLeadFieldRef(v.field)) errors.push(`${name}: choose which lead field fills it.`);
  }

  return errors;
}

/** The request body's `components` for Zernio, with Meta's example values. */
export function draftToZernioComponents(draft: TemplateDraft) {
  const summary = summarizeDraft(draft);
  const example = (key: string) => draft.variables[key]?.example.trim() ?? "";
  const named = draft.parameterFormat === "NAMED";
  const components: Record<string, unknown>[] = [];

  const header = draft.headerText.trim();
  if (header) {
    const vars = summary.variables.filter((v) => v.source === "header");
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: header,
      ...(vars.length
        ? {
            example: named
              ? { header_text_named_params: vars.map((v) => ({ param_name: v.placeholder, example: example(v.key) })) }
              : { header_text: vars.map((v) => example(v.key)) },
          }
        : {}),
    });
  }

  const bodyVars = summary.variables.filter((v) => v.source === "body");
  components.push({
    type: "BODY",
    text: draft.bodyText.trim(),
    ...(bodyVars.length
      ? {
          example: named
            ? { body_text_named_params: bodyVars.map((v) => ({ param_name: v.placeholder, example: example(v.key) })) }
            : { body_text: [bodyVars.map((v) => example(v.key))] },
        }
      : {}),
  });

  const footer = draft.footerText.trim();
  if (footer) components.push({ type: "FOOTER", text: footer });

  if (draft.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: draft.buttons.map((button, i) => {
        if (button.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: button.text.trim() };
        if (button.type === "PHONE_NUMBER") {
          return { type: "PHONE_NUMBER", text: button.text.trim(), phone_number: button.phoneNumber.replace(/\s/g, "") };
        }
        const urlVar = summary.variables.find((v) => v.source === "button" && v.buttonIndex === i);
        return {
          type: "URL",
          text: button.text.trim(),
          url: button.url,
          ...(urlVar ? { example: [button.url.replace(VARIABLE_PATTERN, example(urlVar.key))] } : {}),
        };
      }),
    });
  }

  return components;
}

export function draftToBindings(draft: TemplateDraft): TemplateVariableBinding[] {
  return summarizeDraft(draft).variables.flatMap((variable) => {
    const v = draft.variables[variable.key];
    if (!v?.field || !isLeadFieldRef(v.field)) return [];
    return [{ key: variable.key, field: v.field, fallback: v.fallback.trim() || null }];
  });
}
