import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllUsers, safeQuery } from "@/lib/data/admin-queries";
import {
  calculateMonthlyRevenue,
  getCurrentLagosYearMonth,
  getLagosMonthUtcRange,
} from "@/lib/finance/revenue";
import { MigrationNotice, PageHeader } from "@/components/ui/primitives";
import {
  PaymentsClient,
  type PaymentTransactionRow,
} from "@/components/features/payments-client";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const current = getCurrentLagosYearMonth();
  const year = Number(params.year) || current.year;
  const month = Number(params.month) || current.month;

  const { startUtc, endUtc } = getLagosMonthUtcRange(year, month);
  const adminDb = getSupabaseAdmin();

  const [users, allPassesRes, pendingRes, refundsRes] = await Promise.all([
    fetchAllUsers(),
    adminDb
      .from("beta_access_passes")
      .select("*")
      .order("created_at", { ascending: false }),
    adminDb
      .from("beta_pending_payments")
      .select("*")
      .neq("status", "completed")
      .gte("created_at", startUtc)
      .lt("created_at", endUtc)
      .order("created_at", { ascending: false }),
    safeQuery(
      () =>
        adminDb
          .from("payment_refunds")
          .select("*")
          .order("refunded_at", { ascending: false }),
      [] as Array<{
        id: string;
        payment_reference: string;
        amount_ngn: number;
        currency: string;
        reason: string;
        refunded_at: string;
      }>
    ),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));

  const verifiedPasses = (allPassesRes.data ?? []).map(
    (p: Record<string, unknown>) => ({
      id: String(p.id),
      user_id: String(p.user_id),
      payment_reference: String(p.payment_reference),
      payment_provider: String(p.payment_provider || "paystack"),
      amount_paid: Number(p.amount_paid) || 0,
      currency: String(p.currency || "NGN"),
      is_test: Boolean(p.is_test),
      payment_purpose: String(p.payment_purpose || "beta_lodges_pass"),
      verified_at: (p.verified_at as string | null) ?? null,
      created_at: String(p.created_at),
    })
  );

  const summary = calculateMonthlyRevenue(
    verifiedPasses,
    refundsRes.data,
    year,
    month
  );

  const startMs = Date.parse(startUtc);
  const endMs = Date.parse(endUtc);

  const monthSuccessful: PaymentTransactionRow[] = verifiedPasses
    .filter((p) => {
      if (p.is_test) return false;
      const ts = Date.parse(p.verified_at || p.created_at);
      return !Number.isNaN(ts) && ts >= startMs && ts < endMs;
    })
    .map((p) => {
      const u = userMap.get(p.user_id);
      return {
        id: p.id,
        userId: p.user_id,
        userName: u?.full_name || u?.email || "Unknown User",
        accountType: u?.account_type || "student",
        purpose: p.payment_purpose,
        amount: p.amount_paid,
        currency: p.currency,
        provider: p.payment_provider,
        reference: p.payment_reference,
        status: "successful",
        date: p.verified_at || p.created_at,
      };
    });

  const monthNonSuccessful: PaymentTransactionRow[] = (pendingRes.data ?? []).map(
    (p: Record<string, unknown>) => {
      const uid = String(p.user_id);
      const u = userMap.get(uid);
      return {
        id: String(p.id),
        userId: uid,
        userName: u?.full_name || u?.email || "Unknown User",
        accountType: u?.account_type || "student",
        purpose: "beta_lodges_pass",
        amount: Number(p.snapshot_fee_ngn) || 0,
        currency: String(p.snapshot_currency || "NGN"),
        provider: String(p.payment_provider || "paystack"),
        reference: String(p.payment_reference),
        status: String(p.status || "pending"),
        date: String(p.created_at),
      };
    }
  );

  const transactions = [...monthSuccessful, ...monthNonSuccessful].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & Revenue"
        description="Connected directly to LodgeMate's verified payment records. Only verified successful non-test transactions count toward revenue; refunds are tracked separately in Africa/Lagos (WAT)."
      />
      {refundsRes.missingTable && <MigrationNotice />}
      <PaymentsClient
        summary={summary}
        transactions={transactions}
        selectedYear={year}
        selectedMonth={month}
      />
    </div>
  );
}
