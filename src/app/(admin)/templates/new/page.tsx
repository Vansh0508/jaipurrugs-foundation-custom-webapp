import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TemplateBuilder } from "@/components/admin/templates/template-builder";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { data: attributes } = await supabase.from("lead_attributes").select("*").order("created_at");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">New WhatsApp template</h1>
        <p className="text-sm text-muted">
          Submitted to Meta for review through Zernio — approval usually takes minutes, up to 24 hours. It can be
          sent once approved.
        </p>
      </div>
      <TemplateBuilder attributes={attributes ?? []} />
    </div>
  );
}
