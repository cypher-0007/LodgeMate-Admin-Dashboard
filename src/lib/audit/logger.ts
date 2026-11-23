import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SHARED_ADMIN_ACTOR_LABEL } from "@/lib/constants";

export interface AuditLogInput {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  previousState?: Record<string, unknown> | null;
  resultingState?: Record<string, unknown> | null;
  reason?: string | null;
}

/**
 * Appends an immutable record to `public.admin_activity_logs` using the shared
 * administrator identity. Never claims to distinguish individual human operators
 * when all admins authenticate via the single shared account.
 */
export async function recordAdminAction(input: AuditLogInput): Promise<void> {
  try {
    const adminDb = getSupabaseAdmin();
    const { error } = await adminDb.from("admin_activity_logs").insert({
      actor_id: input.actorId,
      actor_label: SHARED_ADMIN_ACTOR_LABEL,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      previous_state: input.previousState ?? null,
      resulting_state: input.resultingState ?? null,
      reason: input.reason ?? null,
    });

    if (error) {
      console.error("[AuditLog] Failed to record admin action:", error.message);
    }
  } catch (err) {
    console.error("[AuditLog] Unexpected error:", err);
  }
}
