"use client";

import { ArrowUpRightFromSquare, Handset } from "@gravity-ui/icons";
import { renderTemplateParts, type TemplateSummary } from "@/lib/whatsapp/templates";

/** WhatsApp-style bubble. Unfilled variables stay visible as {{…}}. */
export function TemplatePreview({ summary, params }: { summary: TemplateSummary; params: string[] }) {
  const parts = renderTemplateParts(summary, params);

  return (
    <div className="rounded-2xl bg-[#efeae2] p-4">
      <div className="max-w-sm overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
          {summary.headerMediaFormat ? (
            <div className="flex h-24 items-center justify-center rounded-lg bg-neutral-100 text-xs text-muted">
              {summary.headerMediaFormat.toLowerCase()} header
            </div>
          ) : null}
          {parts.header ? <p className="font-semibold">{parts.header}</p> : null}
          <p className="whitespace-pre-wrap">{parts.body || <span className="text-muted">Body text…</span>}</p>
          {parts.footer ? <p className="text-xs text-neutral-500">{parts.footer}</p> : null}
          <span className="self-end text-[10px] text-neutral-400">12:00</span>
        </div>
        {parts.buttons.length > 0 ? (
          <div className="divide-y divide-neutral-200 border-t border-neutral-200">
            {parts.buttons.map((button, i) => (
              <div
                key={i}
                className="flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-[#00a5f4]"
                title={button.url ?? button.phoneNumber}
              >
                {button.type === "URL" ? <ArrowUpRightFromSquare className="size-3.5" /> : null}
                {button.type === "PHONE_NUMBER" ? <Handset className="size-3.5" /> : null}
                {button.text || "Button"}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
