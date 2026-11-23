import "server-only";
import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { NotificationEventKey } from "@/lib/constants";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  eventType?: NotificationEventKey;
}

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

let vapidInitialized = false;

function ensureVapidConfigured(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!vapidInitialized) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    vapidInitialized = true;
  }
  return true;
}

/**
 * Dispatches a Web Push notification to all active admin push subscriptions.
 * - Respects `admin_notification_preferences` (global push toggle & per-event toggle).
 * - Uses `tag` for browser-level duplicate prevention.
 * - Automatically prunes expired/revoked subscriptions returning HTTP 404 or 410.
 */
export async function dispatchAdminWebPush(
  payload: PushPayload
): Promise<{ sent: number; pruned: number; skippedReason?: string }> {
  if (!ensureVapidConfigured()) {
    return { sent: 0, pruned: 0, skippedReason: "VAPID keys not configured" };
  }

  const adminDb = getSupabaseAdmin();

  // Check notification preferences
  const { data: prefs } = await adminDb
    .from("admin_notification_preferences")
    .select("push_enabled, events")
    .eq("id", "default")
    .maybeSingle();

  if (prefs && prefs.push_enabled === false) {
    return { sent: 0, pruned: 0, skippedReason: "Push notifications disabled in preferences" };
  }

  if (
    payload.eventType &&
    prefs?.events &&
    typeof prefs.events === "object" &&
    (prefs.events as Record<string, boolean>)[payload.eventType] === false
  ) {
    return { sent: 0, pruned: 0, skippedReason: `Event ${payload.eventType} muted` };
  }

  const { data: subs, error } = await adminDb
    .from("admin_push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error || !subs || subs.length === 0) {
    return { sent: 0, pruned: 0, skippedReason: "No active push subscriptions" };
  }

  let sent = 0;
  let pruned = 0;
  const serialized = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          serialized,
          { TTL: 3600 }
        );
        sent += 1;
        await adminDb
          .from("admin_push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await adminDb
            .from("admin_push_subscriptions")
            .delete()
            .eq("id", sub.id);
          pruned += 1;
        } else {
          console.error("[WebPush] Delivery failed:", statusCode, err);
        }
      }
    })
  );

  return { sent, pruned };
}
