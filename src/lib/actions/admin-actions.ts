"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordAdminAction } from "@/lib/audit/logger";
import { computeTargetModerationMetrics } from "@/lib/moderation/reports";
import { MODERATION_REPORT_THRESHOLD } from "@/lib/constants";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };

// ─── 1. REPORTS & MODERATION ACTIONS ─────────────────────────────────────────

const ReportStatusSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["new", "under_review", "dismissed", "action_taken"]),
  resolutionNote: z.string().max(1000).optional(),
});

export async function updateReportStatusAction(
  input: z.infer<typeof ReportStatusSchema>
): Promise<ActionResult> {
  try {
    const admin = await requireAdminApi();
    const parsed = ReportStatusSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid report status payload." };
    }

    const adminDb = getSupabaseAdmin();
    const { data: existing, error: fetchErr } = await adminDb
      .from("reports")
      .select("id, status, target_user_id, listing_id")
      .eq("id", parsed.data.reportId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return { ok: false, error: "Report not found." };
    }

    const isClosed =
      parsed.data.status === "dismissed" || parsed.data.status === "action_taken";

    const { error: updateErr } = await adminDb
      .from("reports")
      .update({
        status: parsed.data.status,
        resolution_note: parsed.data.resolutionNote?.trim() || null,
        resolved_at: isClosed ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.reportId);

    if (updateErr) {
      return { ok: false, error: updateErr.message };
    }

    await recordAdminAction({
      actorId: admin.userId,
      action:
        parsed.data.status === "dismissed"
          ? "report.dismiss"
          : "report.status_updated",
      targetType: "report",
      targetId: parsed.data.reportId,
      previousState: { status: existing.status },
      resultingState: { status: parsed.data.status },
      reason: parsed.data.resolutionNote?.trim() || `Report marked ${parsed.data.status}`,
    });

    revalidatePath("/reports");
    revalidatePath("/");
    revalidatePath("/activity");
    return { ok: true, message: `Report updated to ${parsed.data.status.replace("_", " ")}.` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update report.",
    };
  }
}

const ModerateAccountSchema = z.object({
  targetUserId: z.string().uuid(),
  reportId: z.string().uuid().optional().nullable(),
  actionType: z.enum(["warn", "suspend", "ban", "restore", "soft_delete"]),
  reason: z.string().min(5, "Please provide a clear reason (at least 5 characters).").max(1000),
  suspendedUntil: z.string().optional().nullable(),
});

export async function moderateUserAccountAction(
  input: z.infer<typeof ModerateAccountSchema>
): Promise<ActionResult> {
  try {
    const admin = await requireAdminApi();
    const parsed = ModerateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid moderation request." };
    }

    const adminDb = getSupabaseAdmin();
    const { targetUserId, actionType, reason, reportId, suspendedUntil } = parsed.data;

    // Prevent moderating the admin account itself
    if (targetUserId === admin.userId) {
      return { ok: false, error: "Cannot apply moderation actions to the shared admin account." };
    }

    const { data: profile, error: profErr } = await adminDb
      .from("profiles")
      .select("id, full_name, banned, account_status")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profErr || !profile) {
      return { ok: false, error: "Target user account not found." };
    }

    // Calculate current distinct reporter count for audit context
    const { data: userReports } = await adminDb
      .from("reports")
      .select("id, reporter_id, target_user_id, status")
      .eq("target_user_id", targetUserId);

    const metrics = computeTargetModerationMetrics(
      (userReports ?? []).map((r) => ({
        id: r.id,
        reporter_id: r.reporter_id,
        target_user_id: r.target_user_id,
        status: r.status,
      }))
    ).get(targetUserId);

    const distinctReporters = metrics?.distinctReporterCount ?? 0;

    // Enforce Three-Distinct-Reporter policy note for report-driven suspension/ban
    if (
      reportId &&
      (actionType === "suspend" || actionType === "ban") &&
      distinctReporters < MODERATION_REPORT_THRESHOLD
    ) {
      return {
        ok: false,
        error: `Report-triggered suspension/ban requires at least ${MODERATION_REPORT_THRESHOLD} distinct reporters (currently ${distinctReporters}). You may issue a warning or dismiss the report.`,
      };
    }

    const previousStatus =
      (profile.account_status as string | null) ?? (profile.banned ? "banned" : "active");

    let updatePayload: Record<string, unknown> = {};
    let resultingStatus = previousStatus;

    if (actionType === "warn") {
      resultingStatus = "warned";
      updatePayload = { account_status: "warned", moderation_reason: reason };
    } else if (actionType === "suspend") {
      resultingStatus = "suspended";
      updatePayload = {
        account_status: "suspended",
        banned: true,
        suspended_until: suspendedUntil || null,
        moderation_reason: reason,
      };
    } else if (actionType === "ban") {
      resultingStatus = "banned";
      updatePayload = {
        account_status: "banned",
        banned: true,
        suspended_until: null,
        moderation_reason: reason,
      };
    } else if (actionType === "restore") {
      resultingStatus = "active";
      updatePayload = {
        account_status: "active",
        banned: false,
        suspended_until: null,
        moderation_reason: null,
      };
    } else if (actionType === "soft_delete") {
      resultingStatus = "banned";
      updatePayload = {
        account_status: "banned",
        banned: true,
        deleted_at: new Date().toISOString(),
        full_name: "Deleted User",
        phone: null,
        bio: null,
        moderation_reason: reason,
      };
    }

    const { error: updErr } = await adminDb
      .from("profiles")
      .update(updatePayload)
      .eq("id", targetUserId);

    if (updErr) {
      return { ok: false, error: updErr.message };
    }

    // Record moderation history (best-effort if table exists)
    await adminDb.from("moderation_actions").insert({
      target_user_id: targetUserId,
      report_id: reportId ?? null,
      action_type: actionType,
      reason,
      distinct_reporter_count_at_action: distinctReporters,
      previous_status: previousStatus,
      resulting_status: resultingStatus,
      actor_id: admin.userId,
    });

    // If triggered from a report, mark report as action_taken
    if (reportId) {
      await adminDb
        .from("reports")
        .update({
          status: "action_taken",
          resolution_note: `[${actionType.toUpperCase()}] ${reason}`,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", reportId);
    }

    await recordAdminAction({
      actorId: admin.userId,
      action: `user.${actionType}`,
      targetType: "user",
      targetId: targetUserId,
      previousState: { account_status: previousStatus, banned: profile.banned },
      resultingState: {
        account_status: resultingStatus,
        distinct_reporters: distinctReporters,
      },
      reason,
    });

    revalidatePath("/reports");
    revalidatePath("/users");
    revalidatePath(`/users/${targetUserId}`);
    revalidatePath("/");
    revalidatePath("/activity");

    return { ok: true, message: `Account action (${actionType.replace("_", " ")}) completed.` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to moderate account.",
    };
  }
}

// ─── 2. ACCOUNT VERIFICATION ACTIONS ─────────────────────────────────────────

const VerificationDecisionSchema = z.object({
  submissionId: z.string().uuid(),
  source: z.enum(["legacy", "provider_request"]).default("legacy"),
  userId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "info_requested", "resubmission_requested"]),
  reason: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
});

export async function decideVerificationAction(
  input: z.infer<typeof VerificationDecisionSchema>
): Promise<ActionResult> {
  try {
    const admin = await requireAdminApi();
    const parsed = VerificationDecisionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid verification decision." };
    }

    const { submissionId, source, userId, decision, reason, notes } = parsed.data;
    if (decision !== "approved" && (!reason || reason.trim().length < 5)) {
      return {
        ok: false,
        error: "A clear reason (at least 5 characters) is required when rejecting or requesting follow-up.",
      };
    }

    const adminDb = getSupabaseAdmin();
    if (source === "provider_request") {
      if (decision !== "approved" && decision !== "rejected") {
        return { ok: false, error: "Provider applications can only be approved or rejected." };
      }
      const status = decision === "approved" ? "approved" : "rejected";
      const { data: request, error: requestError } = await adminDb
        .from("provider_verification_requests")
        .select("id, user_id, status")
        .eq("id", submissionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (requestError || !request) return { ok: false, error: requestError?.message ?? "Provider application not found." };
      const { error: updateError } = await adminDb
        .from("provider_verification_requests")
        .update({ status, review_note: reason?.trim() || notes?.trim() || null, reviewed_at: new Date().toISOString(), reviewed_by: admin.userId, updated_at: new Date().toISOString() })
        .eq("id", submissionId)
        .eq("status", "in_review");
      if (updateError) return { ok: false, error: updateError.message };
      const { error: profileError } = await adminDb.from("profiles").update({ verified: decision === "approved" }).eq("id", userId);
      if (profileError) return { ok: false, error: profileError.message };
      await recordAdminAction({ actorId: admin.userId, action: `verification.${decision}`, targetType: "provider_verification_request", targetId: submissionId, previousState: { status: request.status }, resultingState: { status, profile_verified: decision === "approved" }, reason: reason?.trim() || `Verification ${decision}` });
      revalidatePath("/verifications");
      revalidatePath("/users");
      revalidatePath(`/users/${userId}`);
      revalidatePath("/activity");
      return { ok: true, message: `Provider verification ${decision}.` };
    }
    const { data: prev } = await adminDb
      .from("verification_submissions")
      .select("status, account_type")
      .eq("id", submissionId)
      .maybeSingle();

    const { error: subErr } = await adminDb
      .from("verification_submissions")
      .update({ status: decision })
      .eq("id", submissionId);

    if (subErr) return { ok: false, error: subErr.message };

    // Record immutable decision history
    await adminDb.from("verification_decisions").insert({
      submission_id: submissionId,
      user_id: userId,
      decision,
      reason: reason?.trim() || null,
      notes: notes?.trim() || null,
      decided_by: admin.userId,
    });

    // Sync public.profiles.verified
    await adminDb
      .from("profiles")
      .update({ verified: decision === "approved" })
      .eq("id", userId);

    await recordAdminAction({
      actorId: admin.userId,
      action: `verification.${decision}`,
      targetType: "verification_submission",
      targetId: submissionId,
      previousState: { status: prev?.status ?? "pending" },
      resultingState: { status: decision, profile_verified: decision === "approved" },
      reason: reason?.trim() || `Verification ${decision}`,
    });

    revalidatePath("/verifications");
    revalidatePath("/users");
    revalidatePath(`/users/${userId}`);
    revalidatePath("/");
    revalidatePath("/activity");

    return { ok: true, message: `Verification marked ${decision.replace("_", " ")}.` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save verification decision.",
    };
  }
}

// ─── 3. LISTING MODERATION ACTIONS ───────────────────────────────────────────

const ListingStatusSchema = z.object({
  listingId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "removed"]),
  reason: z.string().max(1000).optional(),
});

export async function updateListingStatusAction(
  input: z.infer<typeof ListingStatusSchema>
): Promise<ActionResult> {
  try {
    const admin = await requireAdminApi();
    const parsed = ListingStatusSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid listing update." };

    const adminDb = getSupabaseAdmin();
    const { data: existing, error: fetchErr } = await adminDb
      .from("listings")
      .select("id, title, status, verified")
      .eq("id", parsed.data.listingId)
      .maybeSingle();

    if (fetchErr || !existing) return { ok: false, error: "Listing not found." };

    const nextVerified = parsed.data.status === "approved";

    const { error: updErr } = await adminDb
      .from("listings")
      .update({
        status: parsed.data.status,
        verified: nextVerified,
        moderation_note: parsed.data.reason?.trim() || null,
        moderated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.listingId);

    if (updErr) return { ok: false, error: updErr.message };

    await recordAdminAction({
      actorId: admin.userId,
      action: `listing.${parsed.data.status}`,
      targetType: "listing",
      targetId: parsed.data.listingId,
      previousState: { status: existing.status, verified: existing.verified },
      resultingState: { status: parsed.data.status, verified: nextVerified },
      reason: parsed.data.reason?.trim() || `Listing "${existing.title}" set to ${parsed.data.status}`,
    });

    revalidatePath("/listings");
    revalidatePath("/");
    revalidatePath("/activity");
    return { ok: true, message: `Listing updated to ${parsed.data.status}.` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update listing.",
    };
  }
}

// ─── 4. PAYMENT REFUND RECORDING ─────────────────────────────────────────────

const RecordRefundSchema = z.object({
  paymentReference: z.string().min(3),
  userId: z.string().uuid().optional().nullable(),
  amountNgn: z.number().int().positive("Refund amount must be greater than ₦0."),
  reason: z.string().min(5, "Provide a refund reason.").max(500),
  providerRefundId: z.string().max(120).optional(),
});

export async function recordPaymentRefundAction(
  input: z.infer<typeof RecordRefundSchema>
): Promise<ActionResult> {
  try {
    const admin = await requireAdminApi();
    const parsed = RecordRefundSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid refund details." };
    }

    const adminDb = getSupabaseAdmin();
    const { data: pass } = await adminDb
      .from("beta_access_passes")
      .select("payment_reference, amount_paid, user_id")
      .eq("payment_reference", parsed.data.paymentReference)
      .maybeSingle();

    if (!pass) {
      return { ok: false, error: "Verified payment reference not found." };
    }

    if (parsed.data.amountNgn > Number(pass.amount_paid)) {
      return {
        ok: false,
        error: `Refund amount cannot exceed original paid amount (₦${Number(pass.amount_paid).toLocaleString()}).`,
      };
    }

    const { error } = await adminDb.from("payment_refunds").insert({
      payment_reference: parsed.data.paymentReference,
      user_id: parsed.data.userId ?? pass.user_id,
      amount_ngn: parsed.data.amountNgn,
      currency: "NGN",
      reason: parsed.data.reason.trim(),
      provider_refund_id: parsed.data.providerRefundId?.trim() || null,
      recorded_by: admin.userId,
    });

    if (error) return { ok: false, error: error.message };

    await recordAdminAction({
      actorId: admin.userId,
      action: "payment.refund_recorded",
      targetType: "payment",
      targetId: parsed.data.paymentReference,
      resultingState: { amount_ngn: parsed.data.amountNgn },
      reason: parsed.data.reason.trim(),
    });

    revalidatePath("/payments");
    revalidatePath("/");
    revalidatePath("/activity");
    return { ok: true, message: "Refund recorded and subtracted from net monthly revenue." };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to record refund.",
    };
  }
}

// ─── 5. LODGEMATE FEEDBACK & COMPLAINTS ──────────────────────────────────────

const FeedbackUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved"]),
  category: z.enum([
    "technical_problem",
    "app_bug",
    "payment_problem",
    "account_problem",
    "suggestion",
    "general_complaint",
    "other",
  ]),
  internalNotes: z.string().max(2000).optional(),
});

export async function updateFeedbackAction(
  input: z.infer<typeof FeedbackUpdateSchema>
): Promise<ActionResult> {
  try {
    const admin = await requireAdminApi();
    const parsed = FeedbackUpdateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid feedback update." };

    const adminDb = getSupabaseAdmin();
    const { data: prev } = await adminDb
      .from("platform_feedback")
      .select("status, category")
      .eq("id", parsed.data.id)
      .maybeSingle();

    const { error } = await adminDb
      .from("platform_feedback")
      .update({
        status: parsed.data.status,
        category: parsed.data.category,
        internal_notes: parsed.data.internalNotes?.trim() || null,
        resolved_at: parsed.data.status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.id);

    if (error) return { ok: false, error: error.message };

    await recordAdminAction({
      actorId: admin.userId,
      action: "feedback.updated",
      targetType: "platform_feedback",
      targetId: parsed.data.id,
      previousState: prev ?? null,
      resultingState: { status: parsed.data.status, category: parsed.data.category },
      reason: parsed.data.internalNotes?.trim() || `Feedback marked ${parsed.data.status}`,
    });

    revalidatePath("/feedback");
    revalidatePath("/activity");
    return { ok: true, message: "Feedback record updated." };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update feedback.",
    };
  }
}

// ─── 6. NOTIFICATIONS & PREFERENCES ──────────────────────────────────────────

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  try {
    await requireAdminApi();
    const adminDb = getSupabaseAdmin();
    const { error } = await adminDb
      .from("admin_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { ok: false, error: error.message };
    revalidatePath("/notifications");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to mark read." };
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  try {
    await requireAdminApi();
    const adminDb = getSupabaseAdmin();
    const { error } = await adminDb
      .from("admin_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("is_read", false);

    if (error) return { ok: false, error: error.message };
    revalidatePath("/notifications");
    return { ok: true, message: "All notifications marked as read." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to mark all read." };
  }
}

const NotificationPrefsSchema = z.object({
  inAppEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  events: z.record(z.string(), z.boolean()),
});

export async function updateNotificationPreferencesAction(
  input: z.infer<typeof NotificationPrefsSchema>
): Promise<ActionResult> {
  try {
    const admin = await requireAdminApi();
    const parsed = NotificationPrefsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Invalid preferences payload." };

    const adminDb = getSupabaseAdmin();
    const { error } = await adminDb.from("admin_notification_preferences").upsert({
      id: "default",
      in_app_enabled: parsed.data.inAppEnabled,
      push_enabled: parsed.data.pushEnabled,
      events: parsed.data.events,
      updated_at: new Date().toISOString(),
    });

    if (error) return { ok: false, error: error.message };

    await recordAdminAction({
      actorId: admin.userId,
      action: "settings.notification_preferences_updated",
      targetType: "settings",
      targetId: "default",
      resultingState: {
        in_app_enabled: parsed.data.inAppEnabled,
        push_enabled: parsed.data.pushEnabled,
      },
      reason: "Updated admin notification preferences.",
    });

    revalidatePath("/settings");
    revalidatePath("/activity");
    return { ok: true, message: "Notification preferences saved." };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save preferences.",
    };
  }
}
