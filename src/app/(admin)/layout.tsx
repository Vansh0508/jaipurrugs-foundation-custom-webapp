import { requireActiveTeamMember } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireActiveTeamMember();

  return <AdminShell email={email}>{children}</AdminShell>;
}
