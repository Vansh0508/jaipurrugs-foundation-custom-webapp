"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/supabase";
import {
  bindingSchema,
  bindingStatus,
  parseBindings,
  type BindingStatus,
  type TemplateVariableBinding,
} from "@/lib/whatsapp/bindings";
import {
  draftToBindings,
  draftToZernioComponents,
  validateDraft,
  type TemplateDraft,
} from "@/lib/whatsapp/template-builder";
import { summarizeTemplate, type TemplateSummary } from "@/lib/whatsapp/templates";
import { getPrimaryWhatsAppAccount } from "@/lib/zernio/account";
import {
  createWhatsAppTemplate,
  deleteWhatsAppTemplate,
  listWhatsAppTemplates,
} from "@/lib/zernio/client";

export interface TemplateRow {
  summary: TemplateSummary;
  bindings: TemplateVariableBinding[];
  bindingStatus: BindingStatus;
}

export interface TemplatesOverview {
  accountLabel: string | null;
  templates: TemplateRow[];
  error?: string;
}

export async function listTemplatesAction(): Promise<TemplatesOverview> {
  await requireActiveTeamMember();
  const { account, error } = await getPrimaryWhatsAppAccount();
  if (!account) {
    return { accountLabel: null, templates: [], error: error ?? "No WhatsApp account is connected in Settings." };
  }

  const supabase = await createClient();
  const [list, { data: bindingRows }, { data: attributes }] = await Promise.all([
    listWhatsAppTemplates(account.accountId),
    supabase.from("whatsapp_template_bindings").select("template_name, language, variables"),
    supabase.from("lead_attributes").select("key, is_active"),
  ]);

  const templates = list.templates.map((template) => {
    const summary = summarizeTemplate(template);
    const row = (bindingRows ?? []).find(
      (b) => b.template_name === template.name && b.language === template.language,
    );
    const bindings = parseBindings(row?.variables);
    return { summary, bindings, bindingStatus: bindingStatus(summary, bindings, attributes ?? []) };
  });

  return {
    accountLabel: account.verifiedName || account.displayName || account.phoneNumber || null,
    templates: templates.sort((a, b) => a.summary.name.localeCompare(b.summary.name)),
    error: list.success ? undefined : list.error,
  };
}

const variableDraftSchema = z.object({
  example: z.string().max(200),
  field: z.string(),
  fallback: z.string().max(200),
});

const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string() }),
  z.object({ type: z.literal("URL"), text: z.string(), url: z.string() }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string(), phoneNumber: z.string() }),
]);

const draftSchema = z.object({
  name: z.string(),
  category: z.enum(["UTILITY", "MARKETING"]),
  language: z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/),
  parameterFormat: z.enum(["POSITIONAL", "NAMED"]),
  headerText: z.string(),
  bodyText: z.string(),
  footerText: z.string(),
  buttons: z.array(buttonSchema).max(10),
  variables: z.record(z.string(), variableDraftSchema),
});

/** Submits the template to Meta (via Zernio) and saves its variable bindings. */
export async function createTemplateAction(
  input: TemplateDraft,
): Promise<{ error?: string; errors?: string[]; status?: string }> {
  const { email } = await requireActiveTeamMember();
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { error: "The template draft is malformed." };

  const draft = parsed.data as TemplateDraft;
  const errors = validateDraft(draft);
  if (errors.length > 0) return { errors };

  const { account, error: accountError } = await getPrimaryWhatsAppAccount();
  if (!account) return { error: accountError ?? "No WhatsApp account is connected in Settings." };

  const created = await createWhatsAppTemplate({
    accountId: account.accountId,
    name: draft.name,
    category: draft.category,
    language: draft.language,
    parameterFormat: draft.parameterFormat,
    components: draftToZernioComponents(draft),
  });
  if (!created.success) return { error: `Meta/Zernio rejected the template: ${created.error}` };

  // The template now exists on Meta's side; a bindings failure is recoverable
  // from the template list, so report it without pretending creation failed.
  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_template_bindings").upsert({
    template_name: draft.name,
    language: draft.language,
    variables: draftToBindings(draft) as unknown as Json,
    updated_by: email,
  });

  revalidatePath("/templates");
  if (error) {
    return {
      status: created.template?.status,
      error: "Template submitted, but its variable setup didn't save — set it again from the template list.",
    };
  }
  return { status: created.template?.status };
}

export async function saveTemplateBindingsAction(
  templateName: string,
  language: string,
  bindings: TemplateVariableBinding[],
): Promise<{ error?: string }> {
  const { email } = await requireActiveTeamMember();
  const parsed = z.array(bindingSchema).max(50).safeParse(bindings);
  if (!parsed.success) return { error: "Every variable needs a valid lead field." };

  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_template_bindings").upsert({
    template_name: templateName,
    language,
    variables: parsed.data as unknown as Json,
    updated_by: email,
  });
  if (error) return { error: "Could not save the variable setup." };

  revalidatePath("/templates");
  return {};
}

export async function deleteTemplateAction(
  templateName: string,
  language: string,
): Promise<{ error?: string }> {
  await requireActiveTeamMember();
  const { account, error: accountError } = await getPrimaryWhatsAppAccount();
  if (!account) return { error: accountError ?? "No WhatsApp account is connected." };

  const result = await deleteWhatsAppTemplate({ accountId: account.accountId, name: templateName, language });
  if (!result.success) return { error: result.error ?? "Could not delete the template." };

  const supabase = await createClient();
  await supabase
    .from("whatsapp_template_bindings")
    .delete()
    .eq("template_name", templateName)
    .eq("language", language);

  revalidatePath("/templates");
  return {};
}
