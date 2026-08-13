import { notFound } from "next/navigation";
import { Chip } from "@heroui/react";
import { Sparkles } from "@gravity-ui/icons";
import { createClient } from "@/lib/supabase/server";
import { FormNavTabs } from "@/components/admin/field-editor/form-nav-tabs";

const STATUS_COLOR = {
  draft: "default",
  published: "success",
  archived: "warning",
} as const;

export default async function FormInsightsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: form } = await supabase
    .from("forms")
    .select("id, title, status")
    .eq("id", id)
    .maybeSingle();

  if (!form) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{form.title}</h1>
          <Chip color={STATUS_COLOR[form.status as keyof typeof STATUS_COLOR] || "default"} size="sm">
            {form.status}
          </Chip>
        </div>
        <FormNavTabs formId={form.id} />
      </div>

      <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border bg-white py-20 px-6 text-center shadow-2xs">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 shadow-xs">
          <Sparkles className="size-7" />
        </div>
        <div className="flex flex-col gap-1.5 max-w-md">
          <h2 className="text-xl font-bold text-foreground">AI Insights — Coming Soon</h2>
          <p className="text-sm text-muted">
            Advanced AI-powered sentiment analysis, response trends, and automated summary reports for this form will be landing soon.
          </p>
        </div>
      </div>
    </div>
  );
}
