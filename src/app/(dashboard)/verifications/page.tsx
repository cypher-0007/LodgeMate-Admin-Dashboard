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

  const [users, submissionsRes, providerRequestsRes, decisionsRes] = await Promise.all([
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
      () => adminDb.from("provider_verification_requests").select("*").order("submitted_at", { ascending: false }),
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

  const legacy: EnrichedVerificationSubmission[] = submissionsRes.data.map(
    (s) => {
      const uid = String(s.user_id);
      const user = userMap.get(uid);
      return {
        id: String(s.id),
        source: "legacy",
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
  const providerRequests: EnrichedVerificationSubmission[] = providerRequestsRes.data
    .filter((s) => s.status === "in_review" || s.status === "approved" || s.status === "rejected")
    .map((s) => {
      const uid = String(s.user_id);
      const user = userMap.get(uid);
      return {
        id: String(s.id),
        source: "provider_request",
        userId: uid,
        userName: user?.full_name || user?.email || "Unknown User",
        userEmail: user?.email ?? null,
        userPhone: user?.phone ?? null,
        accountType: String(s.provider_type || "landlord"),
        status: String(s.status === "in_review" ? "pending" : s.status),
        documentPaths: [s.id_document_path, s.selfie_path, s.property_proof_path].filter((p): p is string => typeof p === "string" && p.length > 0),
        submittedMetadata: { review_note: s.review_note ?? null },
        submittedAt: String(s.submitted_at ?? s.created_at),
        previousDecisions: [],
      };
    });
  const enriched = [...legacy, ...providerRequests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

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
