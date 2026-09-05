import { Button } from "@heroui/react";
import { createClient } from "@/lib/supabase/server";
import { createForm } from "@/lib/actions/forms";
import { FormsSearchField } from "@/components/admin/forms-search-field";
import { FormsStatusTabs } from "@/components/admin/forms-status-tabs";
import { FormsTable } from "@/components/admin/forms-table";
import { Constants, type Enums } from "@/lib/types/supabase";

type StatusFilter = Enums<"form_status"> | "all";

const VALID_STATUSES: readonly string[] = Constants.public.Enums.form_status;

export default async function FormsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status: rawStatus, q } = await searchParams;
  const status: StatusFilter = VALID_STATUSES.includes(rawStatus ?? "")
    ? (rawStatus as StatusFilter)
    : "all";

  const supabase = await createClient();
  let query = supabase
    .from("forms")
    .select("id, title, status, slug, share_token, updated_at")
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (q) {
    query = query.ilike("title", `%${q}%`);
  }

  const { data: forms } = await query;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Forms</h1>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <FormsStatusTabs q={q} status={status} />
        <div className="flex items-center gap-3">
          <FormsSearchField defaultValue={q ?? ""} />
          <form action={createForm}>
            <Button type="submit">Create form</Button>
          </form>
        </div>
      </div>

      <FormsTable forms={forms ?? []} />
    </div>
  );
}
