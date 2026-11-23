import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllUsers, safeQuery } from "@/lib/data/admin-queries";
import { MigrationNotice, PageHeader } from "@/components/ui/primitives";
import {
  VerificationsClient,
  type EnrichedVerificationSubmission,
} from "@/components/features/verifications-client";

export const dynamic = "force-dynamic";

export default async function VerificationsPage() {
  const adminDb = getSupabaseAdmin();

  const [users, submissionsRes, decisionsRes] = await Promise.all([
    fetchAllUsers(),
    safeQuery(
      () =>
        adminDb
          .from("verification_submissions")
          .select("*")
          .order("submitted_at", { ascending: false }),
      [] as Array<Record<string, unknown>>
    ),
    safeQuery(
      () =>
        adminDb
          .from("verification_decisions")
          .select("*")
          .order("created_at", { ascending: false }),
      [] as Array<Record<string, unknown>>
    ),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const decisionsByUser = new Map<
    string,
    Array<{
      id: string;
      decision: string;
      reason: string | null;
      notes: string | null;
      createdAt: string;
    }>
  >();

  for (const d of decisionsRes.data) {
    const uid = String(d.user_id);
    const list = decisionsByUser.get(uid) ?? [];
    list.push({
      id: String(d.id),
      decision: String(d.decision),
      reason: (d.reason as string | null) ?? null,
      notes: (d.notes as string | null) ?? null,
      createdAt: String(d.created_at),
    });
    decisionsByUser.set(uid, list);
  }

  const enriched: EnrichedVerificationSubmission[] = submissionsRes.data.map(
    (s) => {
      const uid = String(s.user_id);
      const user = userMap.get(uid);
      return {
        id: String(s.id),
        userId: uid,
        userName: user?.full_name || user?.email || "Unknown User",
        userEmail: user?.email ?? null,
        userPhone: user?.phone ?? null,
        accountType: String(s.account_type || user?.account_type || "student"),
        status: String(s.status || "pending"),
        documentPaths: Array.isArray(s.document_paths)
          ? (s.document_paths as string[])
          : [],
        submittedMetadata:
          typeof s.submitted_metadata === "object" && s.submitted_metadata !== null
            ? (s.submitted_metadata as Record<string, unknown>)
            : {},
        submittedAt: String(s.submitted_at),
        previousDecisions: decisionsByUser.get(uid) ?? [],
      };
    }
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account Verification"
        description="Review identity and verification submissions across separate queues for students, agents, and landlords. Documents are private and served via short-lived signed URLs."
      />
      {submissionsRes.missingTable && <MigrationNotice />}
      <VerificationsClient submissions={enriched} />
    </div>
  );
}
