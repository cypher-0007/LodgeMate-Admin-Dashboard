import { MODERATION_REPORT_THRESHOLD } from "@/lib/constants";

export type NormalizedReportStatus =
  | "new"
  | "under_review"
  | "dismissed"
  | "action_taken";

export interface ReportRecordForCounting {
  id: string;
  reporter_id: string;
  target_user_id: string | null;
  status: string;
}

export interface TargetModerationMetrics {
  targetUserId: string;
  distinctReporterCount: number;
  actionableReportCount: number;
  dismissedReportCount: number;
  moderationEligible: boolean;
}

/**
 * Maps legacy LodgeMate report statuses ('open', 'resolved') to the canonical
 * admin moderation statuses without breaking existing rows.
 */
export function normalizeReportStatus(status: string | null | undefined): NormalizedReportStatus {
  switch ((status || "").toLowerCase()) {
    case "under_review":
      return "under_review";
    case "dismissed":
      return "dismissed";
    case "action_taken":
    case "resolved":
      return "action_taken";
    case "new":
    case "open":
    default:
      return "new";
  }
}

/**
 * Enforces the mandatory LodgeMate Three-Distinct-Reporter Policy:
 * - Counts DISTINCT reporting user IDs per target user.
 * - Excludes dismissed reports from the actionable count.
 * - Flags `moderationEligible = true` ONLY when distinct reporters >= 3.
 * - NEVER auto-bans an account; manual administrator decision is always required.
 */
export function computeTargetModerationMetrics(
  reports: ReportRecordForCounting[]
): Map<string, TargetModerationMetrics> {
  const reportersByTarget = new Map<string, Set<string>>();
  const actionableCounts = new Map<string, number>();
  const dismissedCounts = new Map<string, number>();

  for (const report of reports) {
    const targetId = report.target_user_id;
    if (!targetId) continue;

    const normalized = normalizeReportStatus(report.status);
    if (normalized === "dismissed") {
      dismissedCounts.set(targetId, (dismissedCounts.get(targetId) ?? 0) + 1);
      continue;
    }

    let set = reportersByTarget.get(targetId);
    if (!set) {
      set = new Set<string>();
      reportersByTarget.set(targetId, set);
    }
    set.add(report.reporter_id);
    actionableCounts.set(targetId, (actionableCounts.get(targetId) ?? 0) + 1);
  }

  const allTargets = new Set<string>([
    ...reportersByTarget.keys(),
    ...dismissedCounts.keys(),
  ]);

  const result = new Map<string, TargetModerationMetrics>();
  for (const targetUserId of allTargets) {
    const distinctReporterCount = reportersByTarget.get(targetUserId)?.size ?? 0;
    result.set(targetUserId, {
      targetUserId,
      distinctReporterCount,
      actionableReportCount: actionableCounts.get(targetUserId) ?? 0,
      dismissedReportCount: dismissedCounts.get(targetUserId) ?? 0,
      moderationEligible: distinctReporterCount >= MODERATION_REPORT_THRESHOLD,
    });
  }

  return result;
}
