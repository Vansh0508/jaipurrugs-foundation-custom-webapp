import { notFound } from "next/navigation";
import { Chip } from "@heroui/react";
import { createClient } from "@/lib/supabase/server";
import { getFormSubmissions } from "@/lib/actions/submissions";
import { FormNavTabs } from "@/components/admin/field-editor/form-nav-tabs";
import { SubmissionsTable } from "@/components/admin/submissions/submissions-table";

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

  const initialData = await getFormSubmissions(form.id, { page: 1, limit: 25 });

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{form.title}</h1>
          <Chip color={STATUS_COLOR[form.status]} size="sm">
            {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
          </Chip>
        </div>
        <FormNavTabs formId={form.id} />
      </div>

      <SubmissionsTable formId={form.id} initialData={initialData as any} />
    </div>
  );
}
