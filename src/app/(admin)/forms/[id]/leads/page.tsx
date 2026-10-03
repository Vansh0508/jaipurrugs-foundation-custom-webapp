import { notFound } from "next/navigation";
import { Chip } from "@heroui/react";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { FormNavTabs } from "@/components/admin/field-editor/form-nav-tabs";
import { FormLeadMappingEditor } from "@/components/admin/leads/form-lead-mapping";

const STATUS_COLOR = {
  draft: "default",
  published: "success",
  archived: "warning",
} as const;

export default async function FormLeadSyncPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireActiveTeamMember();
  const supabase = await createClient();

  const { data: form } = await supabase.from("forms").select("id, title, status").eq("id", id).maybeSingle();
  if (!form) notFound();

  const [{ data: fields }, { data: mapping }, { data: lists }, { data: attributes }, { count }] = await Promise.all([
    supabase
      .from("form_fields")
      .select("id, type, label, position")
      .eq("form_id", form.id)
      .is("deleted_at", null)
      .neq("type", "section")
      .order("position"),
    supabase.from("form_lead_mappings").select("*").eq("form_id", form.id).maybeSingle(),
    supabase.from("lead_lists").select("id, name").order("name"),
    supabase.from("lead_attributes").select("*").eq("is_active", true).order("created_at"),
    supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id)
      .eq("status", "completed"),
  ]);

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

      <FormLeadMappingEditor
        attributes={attributes ?? []}
        completedCount={count ?? 0}
        fields={fields ?? []}
        formId={form.id}
        lists={lists ?? []}
        mapping={mapping}
      />
    </div>
  );
}
