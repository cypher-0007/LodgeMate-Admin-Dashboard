import { requireAdminPage } from "@/lib/auth/admin-guard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeQuery } from "@/lib/data/admin-queries";
import { isWebPushConfigured } from "@/lib/push/web-push";
import { MigrationNotice, PageHeader } from "@/components/ui/primitives";
import { SettingsClient } from "@/components/features/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await requireAdminPage();
  const adminDb = getSupabaseAdmin();

  const [prefsRes, subsRes] = await Promise.all([
    safeQuery(
      () =>
        adminDb
          .from("admin_notification_preferences")
          .select("*")
          .eq("id", "default")
          .maybeSingle(),
      null as {
        in_app_enabled: boolean;
        push_enabled: boolean;
        events: Record<string, boolean>;
      } | null
    ),
    safeQuery(
      () =>
        adminDb
          .from("admin_push_subscriptions")
          .select("id, device_label, user_agent, created_at, last_used_at")
          .order("created_at", { ascending: false }),
      [] as Array<{
        id: string;
        device_label: string | null;
        user_agent: string | null;
        created_at: string;
        last_used_at: string;
      }>
    ),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Settings & Security"
        description="Manage shared administrator password rotation, in-dashboard & Web Push notification preferences, and review locked platform policies."
      />
      {(prefsRes.missingTable || subsRes.missingTable) && <MigrationNotice />}
      <SettingsClient
        adminEmail={admin.email}
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        webPushConfigured={isWebPushConfigured()}
        initialPrefs={
          prefsRes.data ?? {
            in_app_enabled: true,
            push_enabled: true,
            events: {
              new_report: true,
              three_reports_threshold: true,
              new_verification: true,
              successful_payment: true,
              payment_exception: true,
              new_complaint: true,
              new_listing: true,
            },
          }
        }
        subscriptions={subsRes.data}
      />
    </div>
  );
}
