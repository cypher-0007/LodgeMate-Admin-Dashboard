import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeQuery } from "@/lib/data/admin-queries";
import { MigrationNotice, PageHeader } from "@/components/ui/primitives";
import {
  ActivityClient,
  type ActivityLogRow,
} from "@/components/features/activity-client";

export const dynamic = "force-dynamic";

export default async function ActivityLogPage() {
  const adminDb = getSupabaseAdmin();
  const { data, missingTable } = await safeQuery(
    () =>
      adminDb
        .from("admin_activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    [] as ActivityLogRow[]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Activity Log"
        description="Immutable, append-only audit trail of all administrative actions performed under the shared LodgeMate administrator identity. Records cannot be edited or deleted."
      />
      {missingTable && <MigrationNotice />}
      <ActivityClient logs={data} />
    </div>
  );
}
