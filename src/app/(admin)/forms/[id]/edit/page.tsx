// The field-editing canvas — see docs/phases/03-field-registry-editor.md.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditorShell } from "@/components/admin/field-editor/editor-shell";

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: form }, { data: fields }] = await Promise.all([
    supabase.from("forms").select("id, title, slug, status, share_token, settings").eq("id", id).maybeSingle(),
    supabase
      .from("form_fields")
      .select("*")
      .eq("form_id", id)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
  ]);

  if (!form) {
    notFound();
  }

  return <EditorShell form={form} initialFields={fields ?? []} />;
}
