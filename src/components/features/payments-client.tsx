"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, CreditCard, Download, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui/primitives";
import { recordPaymentRefundAction } from "@/lib/actions/admin-actions";
import type { MonthlyRevenueSummary } from "@/lib/finance/revenue";
import { formatLagosDateTime, formatNgn } from "@/lib/utils";

export interface PaymentTransactionRow {
  id: string;
  userId: string;
  userName: string;
  accountType: string;
  purpose: string;
  amount: number;
  currency: string;
  provider: string;
  reference: string;
  status: string;
  date: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function PaymentsClient({
  summary,
  transactions,
  selectedYear,
  selectedMonth,
}: {
  summary: MonthlyRevenueSummary;
  transactions: PaymentTransactionRow[];
  selectedYear: number;
  selectedMonth: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountTypeFilter, setAccountTypeFilter] = useState("all");
  const [purposeFilter, setPurposeFilter] = useState("all");
  const [selectedTx, setSelectedTx] = useState<PaymentTransactionRow | null>(
    null
  );
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [busy, setBusy] = useState(false);

  const years = [selectedYear - 1, selectedYear, selectedYear + 1];

  const purposes = useMemo(() => {
    const set = new Set<string>(["beta_lodges_pass"]);
    for (const t of transactions) set.add(t.purpose);
    return Array.from(set);
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (accountTypeFilter !== "all" && t.accountType !== accountTypeFilter)
        return false;
      if (purposeFilter !== "all" && t.purpose !== purposeFilter) return false;
      if (q) {
        const hay =
          `${t.id} ${t.userName} ${t.reference} ${t.provider} ${t.purpose}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, search, statusFilter, accountTypeFilter, purposeFilter]);

  const navigatePeriod = (year: number, month: number) => {
    router.push(`/payments?year=${year}&month=${month}`);
  };

  const exportCsvUrl = `/api/admin/payments/export?year=${selectedYear}&month=${selectedMonth}&status=${encodeURIComponent(
    statusFilter
  )}&accountType=${encodeURIComponent(
    accountTypeFilter
  )}&purpose=${encodeURIComponent(purposeFilter)}&q=${encodeURIComponent(
    search
  )}`;

  const handleRecordRefund = async () => {
    if (!selectedTx) return;
    const amt = Number(refundAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid positive refund amount.");
      return;
    }
    setBusy(true);
    const res = await recordPaymentRefundAction({
      paymentReference: selectedTx.reference,
      userId: selectedTx.userId,
      amountNgn: Math.round(amt),
      reason: refundReason.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message || "Refund recorded.");
    setRefundOpen(false);
    setSelectedTx(null);
    setRefundAmount("");
    setRefundReason("");
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {/* Month / Year Selector & Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Select month"
            value={selectedMonth}
            onChange={(e) => navigatePeriod(selectedYear, Number(e.target.value))}
          >
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Select year"
            value={selectedYear}
            onChange={(e) =>
              navigatePeriod(Number(e.target.value), selectedMonth)
            }
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>

        <a
          href={exportCsvUrl}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-2xs hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </div>

      {/* Monthly Revenue Summary (4 Clean Numeric Cards — Zero Charts) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/30 bg-sidebar p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Total Collected — {summary.monthLabel}
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-primary">
            {formatNgn(summary.netCollectedNgn)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Net amount collected (Africa/Lagos)
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground">
            Gross Successful Payments
          </p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground">
            {formatNgn(summary.grossSuccessfulNgn)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Verified non-test transactions only
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground">
            Total Refunds
          </p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-clay">
            {formatNgn(summary.totalRefundsNgn)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.refundCount} refund record(s)
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium text-muted-foreground">
            Successful Transactions
          </p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-foreground">
            {summary.successfulTransactionCount.toLocaleString("en-NG")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pending &amp; failed excluded from totals
          </p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search user, reference, or ID…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value)}
          >
            <option value="all">All Purposes</option>
            {purposes.map((p) => (
              <option key={p} value={p}>
                {p.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
          <Select
            value={accountTypeFilter}
            onChange={(e) => setAccountTypeFilter(e.target.value)}
          >
            <option value="all">All Account Types</option>
            <option value="student">Student</option>
            <option value="agent">Agent</option>
            <option value="landlord">Landlord</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="successful">Successful</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </Select>
        </div>
      </Card>

      {/* Transactions Table / Mobile Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          title={`No transactions found for ${summary.monthLabel}`}
          description="Verified payments and checkout attempts for the selected month and filters will appear here."
          icon={<CreditCard className="h-5 w-5" />}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Purpose</th>
                  <th className="px-4 py-3 font-semibold">Reference &amp; Provider</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date (WAT)</th>
                  <th className="px-4 py-3 text-right font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => (
                  <tr key={`${t.status}-${t.id}`} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{t.userName}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {t.accountType}
                      </p>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {t.purpose.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-foreground">
                        {t.reference}
                      </p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {t.provider}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-display font-bold tabular-nums">
                      {formatNgn(t.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatLagosDateTime(t.date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedTx(t)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {filtered.map((t) => (
              <div key={`${t.status}-${t.id}`} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{t.userName}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {t.purpose.replace(/_/g, " ")} · {t.provider}
                    </p>
                  </div>
                  <span className="font-display font-bold tabular-nums text-primary">
                    {formatNgn(t.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <StatusBadge status={t.status} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedTx(t)}
                  >
                    Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Transaction Detail & Refund Modal */}
      <Modal
        open={Boolean(selectedTx)}
        onClose={() => {
          setSelectedTx(null);
          setRefundOpen(false);
        }}
        title="Transaction Details"
        description={selectedTx?.reference}
      >
        {selectedTx && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-4 text-xs">
              <div>
                <dt className="text-muted-foreground">Transaction Reference</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-mono font-medium break-all">
                  <span>{selectedTx.reference}</span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(selectedTx.reference)
                        .then(() => toast.success("Reference copied to clipboard"));
                    }}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label="Copy reference"
                    title="Copy reference"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={selectedTx.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">User</dt>
                <dd className="mt-0.5 font-medium">{selectedTx.userName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Account Type</dt>
                <dd className="mt-0.5 capitalize">{selectedTx.accountType}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="mt-0.5 font-display text-sm font-bold text-primary">
                  {formatNgn(selectedTx.amount)} ({selectedTx.currency})
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Payment Date (WAT)</dt>
                <dd className="mt-0.5">{formatLagosDateTime(selectedTx.date)}</dd>
              </div>
            </dl>

            {selectedTx.status === "successful" && !refundOpen && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRefundAmount(String(selectedTx.amount));
                    setRefundOpen(true);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Record Refund
                </Button>
              </div>
            )}

            {refundOpen && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    Refund Amount (NGN)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={selectedTx.amount}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    Refund Reason (Audit Logged)
                  </label>
                  <Textarea
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Reason for refunding this verified transaction…"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRefundOpen(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleRecordRefund}
                    disabled={busy}
                  >
                    {busy ? "Recording…" : "Confirm Refund"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
