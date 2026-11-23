import { requireAdminPage } from "@/lib/auth/admin-guard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeQuery } from "@/lib/data/admin-queries";
import { AdminShell } from "@/components/layout/admin-shell";
import type { AdminNotificationItem } from "@/components/layout/notification-bell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdminPage();
  const adminDb = getSupabaseAdmin();

  const { data: notifications } = await safeQuery(
    () =>
      adminDb
        .from("admin_notifications")
        .select("id, event_type, title, body, severity, target_url, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    [] as AdminNotificationItem[]
  );

  return (
    <AdminShell
      adminEmail={admin.email}
      initialNotifications={notifications}
    >
      {children}
    </AdminShell>
  );
}
