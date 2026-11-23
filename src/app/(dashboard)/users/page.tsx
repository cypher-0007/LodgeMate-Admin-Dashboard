import { fetchAllUsers } from "@/lib/data/admin-queries";
import { PageHeader } from "@/components/ui/primitives";
import { UsersClient } from "@/components/features/users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await fetchAllUsers();
  const directoryUsers = users.filter((u) => u.account_type !== "admin");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users Directory"
        description="Search and manage LodgeMate students, agents, and landlords. Open any profile to inspect verification, listing, payment, report, and moderation history."
      />
      <UsersClient users={directoryUsers} />
    </div>
  );
}
