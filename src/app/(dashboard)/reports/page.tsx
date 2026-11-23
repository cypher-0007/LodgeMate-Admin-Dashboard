import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllUsers } from "@/lib/data/admin-queries";
import {
  computeTargetModerationMetrics,
  normalizeReportStatus,
} from "@/lib/moderation/reports";
import { PageHeader } from "@/components/ui/primitives";
import {
  ReportsClient,
  type EnrichedReportRow,
} from "@/components/features/reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const adminDb = getSupabaseAdmin();

  const [users, reportsRes, listingsRes] = await Promise.all([
    fetchAllUsers(),
    adminDb
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false }),
    adminDb.from("listings").select("id, title, owner_id, school, area"),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const listingMap = new Map(
    (listingsRes.data ?? []).map((l) => [l.id, l])
  );

  const rawReports = (reportsRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const listing = r.listing_id ? listingMap.get(String(r.listing_id)) : null;
    const resolvedTargetUserId =
      (r.target_user_id as string | null) ?? (listing?.owner_id ?? null);
    return {
      raw: r,
      resolvedTargetUserId,
      listing,
    };
  });

  const targetMetrics = computeTargetModerationMetrics(
    rawReports.map(({ raw, resolvedTargetUserId }) => ({
      id: String(raw.id),
      reporter_id: String(raw.reporter_id),
      target_user_id: resolvedTargetUserId,
      status: String(raw.status ?? "new"),
    }))
  );

  const enriched: EnrichedReportRow[] = rawReports.map(
    ({ raw: r, resolvedTargetUserId, listing }) => {
      const reporter = userMap.get(String(r.reporter_id));
      const targetUser = resolvedTargetUserId
        ? userMap.get(resolvedTargetUserId)
        : null;
      const metrics = resolvedTargetUserId
        ? targetMetrics.get(resolvedTargetUserId)
        : null;

      return {
        id: String(r.id),
        reporterId: String(r.reporter_id),
        reporterName: reporter?.full_name || reporter?.email || "Unknown Reporter",
        reporterEmail: reporter?.email ?? null,
        targetUserId: resolvedTargetUserId,
        targetName:
          targetUser?.full_name ||
          targetUser?.email ||
          listing?.title ||
          "Target Account",
        targetAccountType: targetUser?.account_type ?? "listing",
        targetAccountStatus: targetUser?.account_status ?? "active",
        listingId: (r.listing_id as string | null) ?? null,
        listingTitle: listing?.title ?? null,
        targetType: String(r.target_type ?? (r.listing_id ? "listing" : "landlord")),
        category: String(r.category ?? "general"),
        reason: String(r.reason ?? ""),
        description: (r.description as string | null) ?? null,
        evidenceUrls: Array.isArray(r.evidence_urls)
          ? (r.evidence_urls as string[])
          : [],
        status: normalizeReportStatus(String(r.status ?? "new")),
        resolutionNote: (r.resolution_note as string | null) ?? null,
        createdAt: String(r.created_at),
        distinctReporterCount: metrics?.distinctReporterCount ?? 0,
        moderationEligible: metrics?.moderationEligible ?? false,
      };
    }
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Moderation"
        description="Investigate reports against students, agents, landlords, and listings. Accounts become eligible for manual suspension/ban review at 3 distinct reporters — never auto-banned."
      />
      <ReportsClient initialReports={enriched} />
    </div>
  );
}
