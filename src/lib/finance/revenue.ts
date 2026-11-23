/**
 * Financial calculation helpers for LodgeMate Admin.
 * Strictly groups monthly revenue using Africa/Lagos (WAT, UTC+01:00),
 * counts ONLY verified successful non-test non-duplicate payments,
 * and accounts for refunds separately.
 */

export interface VerifiedPaymentRow {
  id: string;
  payment_reference: string;
  amount_paid: number;
  currency: string;
  is_test?: boolean | null;
  verified_at?: string | null;
  created_at: string;
}

export interface RefundRow {
  id: string;
  payment_reference: string;
  amount_ngn: number;
  currency: string;
  refunded_at: string;
}

export interface MonthlyRevenueSummary {
  year: number;
  month: number; // 1-12
  monthLabel: string;
  grossSuccessfulNgn: number;
  totalRefundsNgn: number;
  netCollectedNgn: number;
  successfulTransactionCount: number;
  refundCount: number;
}

/**
 * Returns the exact UTC start (inclusive) and end (exclusive) ISO timestamps
 * for a calendar month in Africa/Lagos (WAT = UTC+01:00, no DST).
 */
export function getLagosMonthUtcRange(
  year: number,
  month: number
): { startUtc: string; endUtc: string; monthLabel: string } {
  const safeMonth = Math.min(12, Math.max(1, Math.floor(month)));
  // Africa/Lagos is permanently UTC+01:00 (Nigeria does not observe DST).
  // 00:00:00 WAT on day 1 == 23:00:00 UTC on the previous day.
  const startMs = Date.UTC(year, safeMonth - 1, 1, 0, 0, 0, 0) - 60 * 60 * 1000;
  const endMs = Date.UTC(year, safeMonth, 1, 0, 0, 0, 0) - 60 * 60 * 1000;

  const labelDate = new Date(Date.UTC(year, safeMonth - 1, 15, 12, 0, 0));
  const monthLabel = new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    month: "long",
    year: "numeric",
  })
    .format(labelDate)
    .toUpperCase();

  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    monthLabel,
  };
}

export function getCurrentLagosYearMonth(now = new Date()): {
  year: number;
  month: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? now.getUTCFullYear());
  const month = Number(parts.find((p) => p.type === "month")?.value ?? now.getUTCMonth() + 1);
  return { year, month };
}

/**
 * Computes accurate monthly revenue summary:
 * - Excludes test transactions (`is_test === true`)
 * - Deduplicates by `payment_reference`
 * - Uses verified timestamp (`verified_at ?? created_at`) within Africa/Lagos month window
 * - Separately sums refunds within the same Africa/Lagos month window
 */
export function calculateMonthlyRevenue(
  verifiedPayments: VerifiedPaymentRow[],
  refunds: RefundRow[],
  year: number,
  month: number
): MonthlyRevenueSummary {
  const { startUtc, endUtc, monthLabel } = getLagosMonthUtcRange(year, month);
  const startMs = Date.parse(startUtc);
  const endMs = Date.parse(endUtc);

  const seenReferences = new Set<string>();
  let grossSuccessfulNgn = 0;
  let successfulTransactionCount = 0;

  for (const p of verifiedPayments) {
    if (p.is_test === true) continue;
    if (!p.payment_reference || seenReferences.has(p.payment_reference)) continue;

    const ts = Date.parse(p.verified_at || p.created_at);
    if (Number.isNaN(ts) || ts < startMs || ts >= endMs) continue;

    seenReferences.add(p.payment_reference);
    const amount = Number(p.amount_paid) || 0;
    if (amount > 0) {
      grossSuccessfulNgn += amount;
      successfulTransactionCount += 1;
    }
  }

  let totalRefundsNgn = 0;
  let refundCount = 0;

  for (const r of refunds) {
    const ts = Date.parse(r.refunded_at);
    if (Number.isNaN(ts) || ts < startMs || ts >= endMs) continue;
    const amount = Number(r.amount_ngn) || 0;
    if (amount > 0) {
      totalRefundsNgn += amount;
      refundCount += 1;
    }
  }

  return {
    year,
    month,
    monthLabel,
    grossSuccessfulNgn,
    totalRefundsNgn,
    netCollectedNgn: grossSuccessfulNgn - totalRefundsNgn,
    successfulTransactionCount,
    refundCount,
  };
}

/**
 * RFC-4180 compliant CSV serializer with spreadsheet formula injection protection.
 */
export function serializeCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string {
  const escapeCell = (val: string | number | boolean | null | undefined): string => {
    let str = val === null || val === undefined ? "" : String(val);
    // Neutralize CSV formula injection (=, +, -, @)
    if (/^[=+\-@]/.test(str)) {
      str = `'${str}`;
    }
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];
  return lines.join("\r\n");
}
