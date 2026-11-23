import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeQuery } from "@/lib/data/admin-queries";
import { MigrationNotice, PageHeader } from "@/components/ui/primitives";
import { NotificationsClient } from "@/components/features/notifications-client";
import type { AdminNotificationItem } from "@/components/layout/notification-bell";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const adminDb = getSupabaseAdmin();
  const { data, missingTable } = await safeQuery(
    () =>
      adminDb
        .from("admin_notifications")
        .select("id, event_type, title, body, severity, target_url, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    [] as AdminNotificationItem[]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Real-time operational alerts for reports, 3-reporter escalations, verification submissions, verified payments, complaints, and new listings."
      />
      {missingTable && <MigrationNotice />}
      <NotificationsClient initialItems={data} />
    </div>
  );
}
