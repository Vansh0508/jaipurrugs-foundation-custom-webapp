// Submissions table + CSV export + Realtime — see docs/phases/06-submissions-metrics.md.
// Placeholder: implemented in Phase 6.
import { notFound } from "next/navigation";
import { Chip } from "@heroui/react";
import { createClient } from "@/lib/supabase/server";
import { FormNavTabs } from "@/components/admin/field-editor/form-nav-tabs";

const STATUS_COLOR = {
  draft: "default",
  published: "success",
  archived: "warning",
} as const;

export default async function FormSubmissionsPage({
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{form.title}</h1>
          <Chip color={STATUS_COLOR[form.status]} size="sm">
            {form.status}
          </Chip>
        </div>
        <FormNavTabs formId={form.id} />
      </div>
      <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted">
        Submissions land in Phase 6.
      </div>
    </div>
  );
}
