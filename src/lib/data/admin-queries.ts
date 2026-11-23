import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deriveAccountType, type DerivedAccountType } from "@/lib/utils";
import {
  computeTargetModerationMetrics,
  normalizeReportStatus,
} from "@/lib/moderation/reports";
import {
  calculateMonthlyRevenue,
  getCurrentLagosYearMonth,
} from "@/lib/finance/revenue";

export interface EnrichedUser {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  school: string | null;
  provider_type: string | null;
  account_type: DerivedAccountType;
  verified: boolean;
  banned: boolean;
  account_status: string;
  moderation_reason: string | null;
  deleted_at: string | null;
  business_name: string | null;
  operating_area: string | null;
  created_at: string;
}

/**
 * Fetches auth user emails via service_role safely on the server.
 */
export async function fetchAuthEmailMap(): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>();
  try {
    const adminDb = getSupabaseAdmin();
    const { data, error } = await adminDb.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (!error && data?.users) {
      for (const u of data.users) {
        if (u.email) emailMap.set(u.id, u.email);
      }
    }
  } catch (err) {
    console.warn("[AdminQueries] Could not fetch auth users:", err);
  }
  return emailMap;
}

/**
 * Fetches all LodgeMate users enriched with roles, derived account type, and emails.
 */
export async function fetchAllUsers(): Promise<EnrichedUser[]> {
  const adminDb = getSupabaseAdmin();

  const [profilesRes, rolesRes, emailMap] = await Promise.all([
    adminDb
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false }),
    adminDb.from("user_roles").select("user_id, role"),
    fetchAuthEmailMap(),
  ]);

  if (profilesRes.error) {
    throw new Error(`Failed to load profiles: ${profilesRes.error.message}`);
  }

  const rolesByUser = new Map<string, string[]>();
  for (const row of rolesRes.data ?? []) {
    const list = rolesByUser.get(row.user_id) ?? [];
    list.push(row.role);
    rolesByUser.set(row.user_id, list);
  }

  return (profilesRes.data ?? []).map((p: Record<string, unknown>) => {
    const id = String(p.id);
    const roles = rolesByUser.get(id) ?? [];
    const providerType = (p.provider_type as string | null) ?? null;
    const banned = Boolean(p.banned);
    const accountStatus =
      typeof p.account_status === "string"
        ? p.account_status
        : banned
          ? "banned"
          : "active";

    return {
      id,
      email: emailMap.get(id) ?? null,
      full_name: (p.full_name as string | null) ?? null,
      phone: (p.phone as string | null) ?? null,
      school: (p.school as string | null) ?? null,
      provider_type: providerType,
      account_type: deriveAccountType(roles, providerType),
      verified: Boolean(p.verified),
      banned,
      account_status: accountStatus,
      moderation_reason: (p.moderation_reason as string | null) ?? null,
      deleted_at: (p.deleted_at as string | null) ?? null,
      business_name: (p.business_name as string | null) ?? null,
      operating_area: (p.operating_area as string | null) ?? null,
      created_at: String(p.created_at ?? new Date().toISOString()),
    };
  });
}

/**
 * Safe helper for newly introduced admin tables so pages show an honest
 * migration-pending state instead of crashing if the SQL migration hasn't been applied yet.
 */
export async function safeQuery<T>(
  fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  fallback: T
): Promise<{ data: T; missingTable: boolean; error: string | null }> {
  try {
    const { data, error } = await fn();
    if (error) {
      const isMissing =
        error.message.includes("does not exist") ||
        error.message.includes("Could not find the table");
      return {
        data: fallback,
        missingTable: isMissing,
        error: error.message,
      };
    }
    return { data: data ?? fallback, missingTable: false, error: null };
  } catch (err) {
    return {
      data: fallback,
      missingTable: false,
      error: err instanceof Error ? err.message : "Query failed",
    };
  }
}

export async function fetchOverviewData() {
  const adminDb = getSupabaseAdmin();
  const { year, month } = getCurrentLagosYearMonth();

  const [
    users,
    listingsRes,
    reportsRes,
    passesRes,
    verificationsRes,
    refundsRes,
    activityRes,
  ] = await Promise.all([
    fetchAllUsers(),
    adminDb
      .from("listings")
      .select("id, title, status, school, area, created_at")
      .order("created_at", { ascending: false }),
    adminDb
      .from("reports")
      .select("id, listing_id, reporter_id, target_user_id, target_type, reason, status, created_at")
      .order("created_at", { ascending: false }),
    adminDb
      .from("beta_access_passes")
      .select("id, user_id, payment_reference, payment_provider, amount_paid, currency, is_test, verified_at, created_at")
      .order("created_at", { ascending: false }),
    safeQuery(
      () =>
        adminDb
          .from("verification_submissions")
          .select("id, user_id, account_type, status, submitted_at")
          .order("submitted_at", { ascending: false }),
      [] as Array<{
        id: string;
        user_id: string;
        account_type: string;
        status: string;
        submitted_at: string;
      }>
    ),
    safeQuery(
      () =>
        adminDb
          .from("payment_refunds")
          .select("id, payment_reference, amount_ngn, currency, refunded_at"),
      [] as Array<{
        id: string;
        payment_reference: string;
        amount_ngn: number;
        currency: string;
        refunded_at: string;
      }>
    ),
    safeQuery(
      () =>
        adminDb
          .from("admin_activity_logs")
          .select("id, actor_label, action, target_type, target_id, reason, created_at")
          .order("created_at", { ascending: false })
          .limit(8),
      [] as Array<{
        id: string;
        actor_label: string;
        action: string;
        target_type: string;
        target_id: string | null;
        reason: string | null;
        created_at: string;
      }>
    ),
  ]);

  const nonAdminUsers = users.filter((u) => u.account_type !== "admin" && !u.deleted_at);
  const studentsCount = nonAdminUsers.filter((u) => u.account_type === "student").length;
  const agentsCount = nonAdminUsers.filter((u) => u.account_type === "agent").length;
  const landlordsCount = nonAdminUsers.filter((u) => u.account_type === "landlord").length;
  const verifiedCount = nonAdminUsers.filter((u) => u.verified).length;

  const listings = listingsRes.data ?? [];
  const activeListingsCount = listings.filter((l) => l.status === "approved").length;

  const reports = reportsRes.data ?? [];
  const reportsAwaitingReview = reports.filter((r) => {
    const s = normalizeReportStatus(r.status);
    return s === "new" || s === "under_review";
  }).length;

  const targetMetrics = computeTargetModerationMetrics(
    reports.map((r) => ({
      id: r.id,
      reporter_id: r.reporter_id,
      target_user_id: r.target_user_id ?? null,
      status: r.status,
    }))
  );
  const eligibleTargetsCount = Array.from(targetMetrics.values()).filter(
    (m) => m.moderationEligible
  ).length;

  const passes = (passesRes.data ?? []).filter(
    (p: Record<string, unknown>) => p.is_test !== true
  );
  const monthlyRevenue = calculateMonthlyRevenue(
    passes.map((p: Record<string, unknown>) => ({
      id: String(p.id),
      payment_reference: String(p.payment_reference),
      amount_paid: Number(p.amount_paid) || 0,
      currency: String(p.currency || "NGN"),
      is_test: Boolean(p.is_test),
      verified_at: (p.verified_at as string | null) ?? null,
      created_at: String(p.created_at),
    })),
    refundsRes.data,
    year,
    month
  );

  const pendingVerifications = verificationsRes.data.filter(
    (v) => v.status === "pending"
  ).length;

  const userMap = new Map(users.map((u) => [u.id, u]));

  return {
    stats: {
      totalUsers: nonAdminUsers.length,
      studentsCount,
      agentsCount,
      landlordsCount,
      verifiedCount,
      pendingVerifications,
      activeListingsCount,
      reportsAwaitingReview,
      eligibleTargetsCount,
      successfulPaymentsCount: passes.length,
      currentMonthRevenueNgn: monthlyRevenue.netCollectedNgn,
      currentMonthLabel: monthlyRevenue.monthLabel,
    },
    recent: {
      registrations: nonAdminUsers.slice(0, 6),
      verifications: verificationsRes.data.slice(0, 6).map((v) => ({
        ...v,
        userName: userMap.get(v.user_id)?.full_name || userMap.get(v.user_id)?.email || "Unknown User",
      })),
      reports: reports.slice(0, 6).map((r) => ({
        ...r,
        normalizedStatus: normalizeReportStatus(r.status),
        reporterName: userMap.get(r.reporter_id)?.full_name || "User",
        targetName: r.target_user_id
          ? userMap.get(r.target_user_id)?.full_name || "Account"
          : "Listing",
      })),
      payments: passes.slice(0, 6).map((p: Record<string, unknown>) => ({
        id: String(p.id),
        reference: String(p.payment_reference),
        amount: Number(p.amount_paid) || 0,
        provider: String(p.payment_provider || "paystack"),
        createdAt: String(p.verified_at || p.created_at),
        userName:
          userMap.get(String(p.user_id))?.full_name ||
          userMap.get(String(p.user_id))?.email ||
          "Student",
      })),
      adminActions: activityRes.data,
    },
    migrationsPending:
      verificationsRes.missingTable ||
      refundsRes.missingTable ||
      activityRes.missingTable,
  };
}
