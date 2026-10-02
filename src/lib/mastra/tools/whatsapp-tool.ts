import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/mastra/context";
import { formatPhone, toWhatsAppParticipantId } from "@/lib/mastra/phone";
import {
  renderTemplatePreview,
  summarizeTemplate,
  type TemplateSummary,
} from "@/lib/mastra/templates";
import { listWhatsAppTemplates, sendWhatsAppTemplate } from "@/lib/zernio/client";

// Both tools share one approved-template lookup per turn.
function createTemplateLoader(ctx: AgentToolContext) {
  let cached: Promise<{ templates: TemplateSummary[]; error?: string }> | null = null;

  return () => {
    cached ??= (async () => {
      const accountId = await ctx.getWhatsAppAccountId();
      if (!accountId) {
        return { templates: [], error: "No WhatsApp account is connected in Settings." };
      }
      const result = await listWhatsAppTemplates(accountId, { status: "APPROVED" });
      if (!result.success) {
        return { templates: [], error: result.error ?? "Could not load templates." };
      }
      return {
        templates: result.templates
          .filter((t) => t.status === "APPROVED")
          .map(summarizeTemplate),
      };
    })();
    return cached;
  };
}

export function createWhatsAppTemplateTools(ctx: AgentToolContext) {
  const loadTemplates = createTemplateLoader(ctx);

  const getWhatsAppTemplates = createTool({
    id: "get-whatsapp-templates",
    description:
      "List the approved WhatsApp message templates the foundation can send, with each template's " +
      "language, its text, and the variables it needs (in order).",
    inputSchema: z.object({}),
    execute: async () => {
      const { templates, error } = await loadTemplates();
      if (error) return { templates: [], error };
      return {
        templates: templates.map((t) => ({
          name: t.name,
          language: t.language,
          category: t.category,
          text: t.bodyText,
          variables: t.variables.map((v) => `${v.index + 1}. ${v.source} {{${v.placeholder}}}`),
        })),
      };
    },
  });

  const sendWhatsAppTemplateTool = createTool({
    id: "send-whatsapp-template",
    description:
      "Send one approved WhatsApp template to the contact you are chatting with. Takes no phone " +
      "number: it always goes to the current contact. Call get-whatsapp-templates first and pass " +
      "exactly one value per variable, in order.",
    inputSchema: z.object({
      templateName: z.string().min(1),
      language: z.string().min(2).describe("The template's language code, e.g. en or en_US."),
      params: z.array(z.string().max(500)).max(20).describe("Variable values in template order."),
    }),
    execute: async ({ templateName, language, params }) => {
      const { templates, error } = await loadTemplates();
      if (error) return { sent: false, error };

      const template = templates.find((t) => t.name === templateName && t.language === language);
      if (!template) {
        return { sent: false, error: `No approved template "${templateName}" (${language}).` };
      }
      if (params.length !== template.variables.length) {
        return {
          sent: false,
          error: `"${templateName}" needs ${template.variables.length} value(s), got ${params.length}.`,
        };
      }

      const participantId = toWhatsAppParticipantId(ctx.phone);
      if (!participantId) {
        return { sent: false, error: "The contact's number can't be used for WhatsApp." };
      }

      const preview = renderTemplatePreview(template, params);
      const recipient = formatPhone(ctx.phone);

      if (!ctx.liveSend) {
        return {
          sent: false,
          mode: "preview" as const,
          recipient,
          templateName,
          language,
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

      return {
        sent: true,
        mode: "live" as const,
        recipient,
        templateName,
        language,
        preview,
        conversationId: result.conversationId,
      };
    },
  });

  return { getWhatsAppTemplates, sendWhatsAppTemplate: sendWhatsAppTemplateTool };
}
