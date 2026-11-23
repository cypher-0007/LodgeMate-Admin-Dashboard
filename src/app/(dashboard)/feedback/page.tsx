import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeQuery } from "@/lib/data/admin-queries";
import { MigrationNotice, PageHeader } from "@/components/ui/primitives";
import {
  FeedbackClient,
  type FeedbackItem,
} from "@/components/features/feedback-client";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const adminDb = getSupabaseAdmin();
  const { data, missingTable } = await safeQuery(
    () =>
      adminDb
        .from("platform_feedback")
        .select("*")
        .order("created_at", { ascending: false }),
    [] as FeedbackItem[]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="LodgeMate Feedback & Complaints"
        description="Manage platform bug reports, technical or payment problems, suggestions, and general complaints about LodgeMate itself (separate from user moderation reports)."
      />
      {missingTable && <MigrationNotice />}
      <FeedbackClient items={data} />
    </div>
  );
}
