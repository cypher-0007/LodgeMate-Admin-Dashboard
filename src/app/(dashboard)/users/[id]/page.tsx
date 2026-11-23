import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllUsers, safeQuery } from "@/lib/data/admin-queries";
import { computeTargetModerationMetrics } from "@/lib/moderation/reports";
import { MODERATION_REPORT_THRESHOLD } from "@/lib/constants";
import { formatLagosDateTime, formatNgn } from "@/lib/utils";
import { Card, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { UserActionsClient } from "@/components/features/user-actions-client";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const users = await fetchAllUsers();
  const user = users.find((u) => u.id === id);
  if (!user) notFound();

  const adminDb = getSupabaseAdmin();

  const [listingsRes, paymentsRes, reportsRes, verificationsRes, moderationRes] =
    await Promise.all([
      adminDb
        .from("listings")
        .select("id, title, kind, school, area, price, status, created_at")
        .eq("owner_id", id)
        .order("created_at", { ascending: false }),
      adminDb
        .from("beta_access_passes")
        .select("id, payment_reference, amount_paid, payment_provider, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      adminDb
        .from("reports")
        .select("id, reporter_id, target_user_id, reason, status, created_at")
        .eq("target_user_id", id)
        .order("created_at", { ascending: false }),
      safeQuery(
        () =>
          adminDb
            .from("verification_decisions")
            .select("id, decision, reason, created_at")
            .eq("user_id", id)
            .order("created_at", { ascending: false }),
        [] as Array<{
          id: string;
          decision: string;
          reason: string | null;
          created_at: string;
        }>
      ),
      safeQuery(
        () =>
          adminDb
            .from("moderation_actions")
            .select("id, action_type, reason, previous_status, resulting_status, created_at")
            .eq("target_user_id", id)
            .order("created_at", { ascending: false }),
        [] as Array<{
          id: string;
          action_type: string;
          reason: string;
          previous_status: string | null;
          resulting_status: string | null;
          created_at: string;
        }>
      ),
    ]);

  const reports = reportsRes.data ?? [];
  const metrics = computeTargetModerationMetrics(
    reports.map((r) => ({
      id: r.id,
      reporter_id: r.reporter_id,
      target_user_id: r.target_user_id,
      status: r.status,
    }))
  ).get(id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/users"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Users Directory
        </Link>
      </div>

      <PageHeader
        title={user.full_name || user.email || "User Profile"}
        description={`Account ID: ${user.id} · Registered ${formatLagosDateTime(user.created_at)}`}
        actions={
          <UserActionsClient
            userId={user.id}
            accountStatus={user.account_status}
            isDeleted={Boolean(user.deleted_at)}
          />
        }
      />

      {/* Profile Summary */}
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Account Type</p>
            <div className="mt-1">
              <StatusBadge status={user.account_type} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Verification</p>
            <div className="mt-1">
              <StatusBadge status={user.verified ? "verified" : "unverified"} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Account Status</p>
            <div className="mt-1">
              <StatusBadge status={user.account_status} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Distinct Reporters</p>
            <p className="mt-1 font-display font-bold">
              {metrics?.distinctReporterCount ?? 0}/{MODERATION_REPORT_THRESHOLD}{" "}
              {metrics?.moderationEligible && (
                <StatusBadge status="eligible" label="Eligible" className="ml-1" />
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="mt-0.5 font-medium">{user.email || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phone</p>
            <p className="mt-0.5 font-medium">{user.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Campus / Area</p>
            <p className="mt-0.5 font-medium">
              {user.school || user.operating_area || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Business Name</p>
            <p className="mt-0.5 font-medium">{user.business_name || "—"}</p>
          </div>
        </div>
        {user.moderation_reason && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <strong>Moderation Reason:</strong> {user.moderation_reason}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Associated Listings */}
        <Card className="p-5">
          <h2 className="font-display text-base font-bold">
            Associated Listings ({listingsRes.data?.length ?? 0})
          </h2>
          {!listingsRes.data || listingsRes.data.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No listings created by this user.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {listingsRes.data.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.school} · {l.area} · {formatNgn(l.price)}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Payment History */}
        <Card className="p-5">
          <h2 className="font-display text-base font-bold">
            Verified Payment History ({paymentsRes.data?.length ?? 0})
          </h2>
          {!paymentsRes.data || paymentsRes.data.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No verified payments recorded for this user.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {paymentsRes.data.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <div>
                    <p className="font-mono text-xs">{p.payment_reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_provider} · {formatLagosDateTime(p.created_at)}
                    </p>
                  </div>
                  <span className="font-display font-bold text-primary">
                    {formatNgn(p.amount_paid)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Report & Moderation History */}
        <Card className="p-5">
          <h2 className="font-display text-base font-bold">
            Report &amp; Moderation History
          </h2>
          {reports.length === 0 && moderationRes.data.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Clean moderation record.
            </p>
          ) : (
            <div className="mt-3 space-y-3 text-xs">
              {moderationRes.data.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between">
                    <StatusBadge status={m.action_type} />
                    <span className="text-muted-foreground">
                      {formatLagosDateTime(m.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-foreground">{m.reason}</p>
                </div>
              ))}
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-border p-3"
                >
                  <div>
                    <p className="font-medium text-foreground">{r.reason}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {formatLagosDateTime(r.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Verification History */}
        <Card className="p-5">
          <h2 className="font-display text-base font-bold">
            Verification History ({verificationsRes.data.length})
          </h2>
          {verificationsRes.data.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No verification decisions recorded yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-xs">
              {verificationsRes.data.map((v) => (
                <li
                  key={v.id}
                  className="flex items-start justify-between gap-2 py-2.5"
                >
                  <div>
                    <StatusBadge status={v.decision} />
                    {v.reason && (
                      <p className="mt-1 text-muted-foreground">{v.reason}</p>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {formatLagosDateTime(v.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
