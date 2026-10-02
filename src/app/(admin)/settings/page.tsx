import { Suspense } from "react";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { getWhatsAppStatusAction } from "@/lib/actions/zernio";
import { SettingsView } from "@/components/admin/settings/settings-view";
import { Spinner } from "@heroui/react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { email } = await requireActiveTeamMember();
  const initialStatus = await getWhatsAppStatusAction();

  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <SettingsView initialStatus={initialStatus} userEmail={email} />
    </Suspense>
  );
}
