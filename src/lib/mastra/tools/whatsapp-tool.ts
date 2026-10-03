import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { leadFieldLabel } from "@/lib/leads/fields";
import type { AgentToolContext } from "@/lib/mastra/context";
import type { LeadLoader } from "@/lib/mastra/lead-context";
import { formatPhone, toWhatsAppParticipantId } from "@/lib/mastra/phone";
import {
  bindingStatus,
  parseBindings,
  resolveTemplateParams,
  type TemplateVariableBinding,
} from "@/lib/whatsapp/bindings";
import {
  renderTemplatePreview,
  summarizeTemplate,
  type TemplateSummary,
} from "@/lib/whatsapp/templates";
import { listWhatsAppTemplates, sendWhatsAppTemplate } from "@/lib/zernio/client";

interface LoadedTemplate {
  summary: TemplateSummary;
  bindings: TemplateVariableBinding[];
}

// Approved templates + their variable bindings, loaded once per turn.
function createTemplateLoader(ctx: AgentToolContext) {
  let cached: Promise<{ templates: LoadedTemplate[]; error?: string }> | null = null;

  return () => {
    cached ??= (async () => {
      const accountId = await ctx.getWhatsAppAccountId();
      if (!accountId) {
        return { templates: [], error: "No WhatsApp account is connected in Settings." };
      }
      const [result, { data: bindingRows }] = await Promise.all([
        listWhatsAppTemplates(accountId, { status: "APPROVED" }),
        ctx.supabase.from("whatsapp_template_bindings").select("template_name, language, variables"),
      ]);
      if (!result.success) {
        return { templates: [], error: result.error ?? "Could not load templates." };
      }
      return {
        templates: result.templates
          .filter((t) => t.status === "APPROVED")
          .map((t) => ({
            summary: summarizeTemplate(t),
            bindings: parseBindings(
              (bindingRows ?? []).find((b) => b.template_name === t.name && b.language === t.language)?.variables,
            ),
          })),
      };
    })();
    return cached;
  };
}

export function createWhatsAppTemplateTools(ctx: AgentToolContext, leads: LeadLoader) {
  const loadTemplates = createTemplateLoader(ctx);

  const getWhatsAppTemplates = createTool({
    id: "get-whatsapp-templates",
    description:
      "List the approved WhatsApp templates the foundation can send, what each one says, and which " +
      "of the contact's details it needs. `missingForThisContact` lists details you'd have to collect " +
      "(and save) before sending it.",
    inputSchema: z.object({}),
    execute: async () => {
      const [{ templates, error }, { lead, attributes }] = await Promise.all([loadTemplates(), leads.get()]);
      if (error) return { templates: [], error };

      return {
        templates: templates.map(({ summary, bindings }) => {
          const status = bindingStatus(summary, bindings, attributes);
          const resolved = resolveTemplateParams(summary, bindings, lead, attributes);
          return {
            name: summary.name,
            language: summary.language,
            category: summary.category,
            text: summary.bodyText,
            usesDetails: [...new Set(bindings.map((b) => leadFieldLabel(b.field, attributes)))],
            sendable: status.ready,
            ...(status.ready ? {} : { notSendableReason: "Its variables aren't set up yet in Templates." }),
            missingForThisContact: resolved.ok ? [] : resolved.missing.map((m) => m.label),
          };
        }),
      };
    },
  });

  // The model learns whether it worked and which template went out — never
  // the recipient, the filled values or the rendered text, any of which can
  // contain the contact's number. The raw result (with those) stays in the
  // staff-visible tool trace.
  type SendResult = {
    sent: boolean;
    mode?: "preview" | "live";
    templateName?: string;
    error?: string;
    missing?: unknown;
    note?: string;
  };
  const toModel = (output: SendResult) => ({
    type: "json" as const,
    value: {
      sent: output.sent,
      ...(output.mode ? { mode: output.mode } : {}),
      ...(output.templateName ? { templateName: output.templateName } : {}),
      ...(output.error ? { error: output.error } : {}),
      ...(output.missing ? { missing: output.missing } : {}),
      ...(output.note ? { note: output.note } : {}),
    },
  });

  const sendWhatsAppTemplateTool = createTool({
    id: "send-whatsapp-template",
    description:
      "Send one approved WhatsApp template to the contact you are chatting with. Every variable is " +
      "filled automatically from the contact's saved details — you only choose the template. If " +
      "details are missing, the result lists them: ask the contact, save them with save-lead-details, " +
      "then call this again. Takes no phone number: it always goes to the current contact.",
    inputSchema: z.object({
      templateName: z.string().min(1),
      language: z.string().min(2).describe("The template's language code, e.g. en or en_US."),
    }),
    execute: async ({ templateName, language }) => {
      const [{ templates, error }, { lead, attributes }] = await Promise.all([loadTemplates(), leads.get()]);
      if (error) return { sent: false, error };

      const template = templates.find((t) => t.summary.name === templateName && t.summary.language === language);
      if (!template) {
        return { sent: false, error: `No approved template "${templateName}" (${language}).` };
      }

      const resolved = resolveTemplateParams(template.summary, template.bindings, lead, attributes);
      if (!resolved.ok) {
        if (resolved.unbound.length > 0) {
          return {
            sent: false,
            error: `"${templateName}" isn't set up yet: a team member needs to choose which lead details fill its variables in Templates.`,
          };
        }
        return {
          sent: false,
          missing: resolved.missing.map((m) => ({
            field: m.field.startsWith("attr:") ? m.field.slice(5) : m.field,
            label: m.label,
            whatToAsk: m.description ?? undefined,
          })),
          note: "Ask the contact for these details, save them with save-lead-details, then send again.",
        };
      }

      const participantId = toWhatsAppParticipantId(ctx.phone);
      if (!participantId) {
        return { sent: false, error: "The contact's number can't be used for WhatsApp." };
      }

      const params = resolved.params;
      const preview = renderTemplatePreview(template.summary, params);
      const recipient = formatPhone(ctx.phone);

      if (!ctx.liveSend) {
        return {
          sent: false,
          mode: "preview" as const,
          recipient,
          templateName,
          language,
          params,
          preview,
          note: "Preview only — live sending is off in the workbench, so nothing was delivered.",
        };
      }

      const accountId = await ctx.getWhatsAppAccountId();
      if (!accountId) return { sent: false, error: "No WhatsApp account is connected." };

      const result = await sendWhatsAppTemplate({
        accountId,
        participantId,
        templateName,
        templateLanguage: language,
        templateParams: params,
      });

      if (!result.success) return { sent: false, mode: "live" as const, error: result.error };

      await ctx.onTemplateSent?.({
        templateName,
        language,
        preview,
        platformMessageId: result.messageId,
        zernioConversationId: result.conversationId,
      });

      return {
        sent: true,
        mode: "live" as const,
        recipient,
        templateName,
        language,
        params,
        preview,
        conversationId: result.conversationId,
      };
    },
    toModelOutput: (output) => toModel(output as SendResult),
  });

  return { getWhatsAppTemplates, sendWhatsAppTemplate: sendWhatsAppTemplateTool };
}
