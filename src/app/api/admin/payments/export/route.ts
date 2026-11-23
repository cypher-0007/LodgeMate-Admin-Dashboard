import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllUsers } from "@/lib/data/admin-queries";
import {
  getCurrentLagosYearMonth,
  getLagosMonthUtcRange,
  serializeCsv,
} from "@/lib/finance/revenue";
import { formatLagosDateTime } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    await requireAdminApi();
    const { searchParams } = new URL(request.url);
    const current = getCurrentLagosYearMonth();
    const year = Number(searchParams.get("year")) || current.year;
    const month = Number(searchParams.get("month")) || current.month;
    const statusFilter = (searchParams.get("status") || "all").toLowerCase();
    const purposeFilter = (searchParams.get("purpose") || "all").toLowerCase();
    const accountTypeFilter = (searchParams.get("accountType") || "all").toLowerCase();
    const query = (searchParams.get("q") || "").trim().toLowerCase();

    const { startUtc, endUtc } = getLagosMonthUtcRange(year, month);
    const adminDb = getSupabaseAdmin();

    const [users, passesRes, pendingRes] = await Promise.all([
      fetchAllUsers(),
      adminDb
        .from("beta_access_passes")
        .select("*")
        .gte("created_at", startUtc)
        .lt("created_at", endUtc)
        .order("created_at", { ascending: false }),
      adminDb
        .from("beta_pending_payments")
        .select("*")
        .neq("status", "completed")
        .gte("created_at", startUtc)
        .lt("created_at", endUtc)
        .order("created_at", { ascending: false }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));

    const combined = [
      ...(passesRes.data ?? [])
        .filter((p: Record<string, unknown>) => p.is_test !== true)
        .map((p: Record<string, unknown>) => {
          const u = userMap.get(String(p.user_id));
          return {
            id: String(p.id),
            userName: u?.full_name || u?.email || "Unknown User",
            accountType: u?.account_type || "student",
            purpose: String(p.payment_purpose || "beta_lodges_pass"),
            amount: Number(p.amount_paid) || 0,
            currency: String(p.currency || "NGN"),
            provider: String(p.payment_provider || "paystack"),
            reference: String(p.payment_reference),
            status: "successful",
            date: String(p.verified_at || p.created_at),
          };
        }),
      ...(pendingRes.data ?? []).map((p: Record<string, unknown>) => {
        const u = userMap.get(String(p.user_id));
        return {
          id: String(p.id),
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
      }),
    ].filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (purposeFilter !== "all" && row.purpose.toLowerCase() !== purposeFilter) return false;
      if (accountTypeFilter !== "all" && row.accountType !== accountTypeFilter) return false;
      if (query) {
        const hay = `${row.id} ${row.userName} ${row.reference} ${row.provider} ${row.purpose}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    const csv = serializeCsv(
      [
        "Transaction ID",
        "User Name",
        "Account Type",
        "Payment Purpose",
        "Amount",
        "Currency",
        "Payment Provider",
        "Transaction Reference",
        "Status",
        "Payment Date (Africa/Lagos)",
      ],
      combined.map((r) => [
        r.id,
        r.userName,
        r.accountType,
        r.purpose,
        r.amount,
        r.currency,
        r.provider,
        r.reference,
        r.status,
        formatLagosDateTime(r.date),
      ])
    );

    const filename = `lodgemate-payments-${year}-${String(month).padStart(2, "0")}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    return NextResponse.json({ error: "CSV export failed." }, { status: 500 });
  }
}
