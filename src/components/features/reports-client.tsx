"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, FileText, Flag, Search, ShieldAlert, X } from "lucide-react";
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
import {
  moderateUserAccountAction,
  updateReportStatusAction,
} from "@/lib/actions/admin-actions";
import { MODERATION_REPORT_THRESHOLD } from "@/lib/constants";
import { formatLagosDateTime } from "@/lib/utils";
import type { NormalizedReportStatus } from "@/lib/moderation/reports";

export interface EnrichedReportRow {
  id: string;
  reporterId: string;
  reporterName: string;
  reporterEmail: string | null;
  targetUserId: string | null;
  targetName: string;
  targetAccountType: string;
  targetAccountStatus: string;
  listingId: string | null;
  listingTitle: string | null;
  targetType: string;
  category: string;
  reason: string;
  description: string | null;
  evidenceUrls: string[];
  status: NormalizedReportStatus;
  resolutionNote: string | null;
  createdAt: string;
  distinctReporterCount: number;
  moderationEligible: boolean;
}

export function ReportsClient({
  initialReports,
}: {
  initialReports: EnrichedReportRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState("all");
  const [eligibilityFilter, setEligibilityFilter] = useState(
    searchParams.get("eligible") === "true" ? "eligible" : "all"
  );
  const [selected, setSelected] = useState<EnrichedReportRow | null>(null);
  const [actionMode, setActionMode] = useState<
    "dismiss" | "warn" | "suspend" | "ban" | null
  >(null);
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    targetTypeFilter !== "all" ||
    eligibilityFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTargetTypeFilter("all");
    setEligibilityFilter("all");
  };

  const openEvidence = async (path: string) => {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const res = await fetch("/api/admin/documents/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "report-evidence", path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.signedUrl) {
        toast.error(data.error || "Unable to load evidence file.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to retrieve signed evidence URL.");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialReports.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (targetTypeFilter !== "all" && r.targetType !== targetTypeFilter)
        return false;
      if (eligibilityFilter === "eligible" && !r.moderationEligible) return false;
      if (q) {
        const hay =
          `${r.id} ${r.reporterName} ${r.targetName} ${r.reason} ${r.category} ${r.listingTitle ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [initialReports, search, statusFilter, targetTypeFilter, eligibilityFilter]);

  const targetHistory = useMemo(() => {
    if (!selected?.targetUserId) return [];
    return initialReports.filter(
      (r) => r.targetUserId === selected.targetUserId
    );
  }, [initialReports, selected]);

  const handleMarkUnderReview = async (report: EnrichedReportRow) => {
    setBusy(true);
    const res = await updateReportStatusAction({
      reportId: report.id,
      status: "under_review",
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Report marked Under Review");
    router.refresh();
  };

  const handleConfirmAction = async () => {
    if (!selected || !actionMode) return;
    if (reasonText.trim().length < 5) {
      toast.error("Please provide a clear reason (at least 5 characters).");
      return;
    }

    setBusy(true);
    if (actionMode === "dismiss") {
      const res = await updateReportStatusAction({
        reportId: selected.id,
        status: "dismissed",
        resolutionNote: reasonText.trim(),
      });
      setBusy(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Report dismissed (excluded from actionable threshold).");
    } else {
      if (!selected.targetUserId) {
        setBusy(false);
        toast.error("No target account linked to this report.");
        return;
      }
      const res = await moderateUserAccountAction({
        targetUserId: selected.targetUserId,
        reportId: selected.id,
        actionType: actionMode,
        reason: reasonText.trim(),
      });
      setBusy(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message || "Moderation action applied.");
    }

    setActionMode(null);
    setSelected(null);
    setReasonText("");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Policy Banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-sidebar p-4 text-xs text-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <strong className="font-semibold">
            Three-Distinct-Reporter Policy (Locked at {MODERATION_REPORT_THRESHOLD}):
          </strong>{" "}
          Repeated submissions from the same reporter are deduplicated and
          dismissed reports are excluded. Accounts reaching{" "}
          {MODERATION_REPORT_THRESHOLD} distinct reporters are flagged as{" "}
          <strong>Moderation Eligible</strong> for manual administrator review —
          accounts are never automatically banned.
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search report ID, reporter, target, listing, or reason…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
          >
            <option value="all">All Target Types</option>
            <option value="student">Students</option>
            <option value="agent">Agents</option>
            <option value="landlord">Landlords</option>
            <option value="listing">Listings</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="under_review">Under Review</option>
            <option value="dismissed">Dismissed</option>
            <option value="action_taken">Action Taken</option>
          </Select>
          <Select
            value={eligibilityFilter}
            onChange={(e) => setEligibilityFilter(e.target.value)}
          >
            <option value="all">All Eligibility Levels</option>
            <option value="eligible">Moderation Eligible (3+ Reporters)</option>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing <strong className="text-foreground">{filtered.length}</strong>{" "}
            of {initialReports.length} report(s)
          </span>
          {hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* Responsive List / Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No reports match your filters"
          description="When users submit reports against students, agents, landlords, or listings, they will appear here for review."
          icon={<Flag className="h-5 w-5" />}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Report &amp; Reason</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold">Reporter</th>
                  <th className="px-4 py-3 font-semibold">Distinct Reporters</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate font-medium text-foreground">
                        {r.reason}
                      </p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {r.category.replace(/_/g, " ")} · #{r.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {r.targetName}
                      </p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {r.targetType}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.reporterName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold tabular-nums">
                          {r.distinctReporterCount}/{MODERATION_REPORT_THRESHOLD}
                        </span>
                        {r.moderationEligible && (
                          <StatusBadge status="eligible" label="Eligible" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatLagosDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(r);
                          setActionMode(null);
                          setReasonText("");
                        }}
                      >
                        Investigate
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="divide-y divide-border md:hidden">
            {filtered.map((r) => (
              <div key={r.id} className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{r.targetName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.targetType} · Reported by {r.reporterName}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-sm text-foreground">{r.reason}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold">
                      {r.distinctReporterCount}/{MODERATION_REPORT_THRESHOLD} distinct reporters
                    </span>
                    {r.moderationEligible && (
                      <StatusBadge status="eligible" label="Eligible" />
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelected(r);
                      setActionMode(null);
                      setReasonText("");
                    }}
                  >
                    Investigate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Investigation & Moderation Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setActionMode(null);
        }}
        title={selected ? `Report #${selected.id.slice(0, 8)}` : "Report Details"}
        description={
          selected
            ? `Submitted ${formatLagosDateTime(selected.createdAt)} · Distinct reporters against target: ${selected.distinctReporterCount}/${MODERATION_REPORT_THRESHOLD}`
            : undefined
        }
        maxWidth="max-w-2xl"
      >
        {selected && (
          <div className="space-y-5 text-sm">
            <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Reported Target</p>
                <p className="font-semibold text-foreground">
                  {selected.targetName}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={selected.targetAccountStatus} />
                  {selected.targetUserId && (
                    <Link
                      href={`/users/${selected.targetUserId}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Open Profile →
                    </Link>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reporting User</p>
                <p className="font-semibold text-foreground">
                  {selected.reporterName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selected.reporterEmail || selected.reporterId.slice(0, 8)}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Report Reason &amp; Details
              </p>
              <p className="mt-1 font-medium text-foreground">
                {selected.reason}
              </p>
              {selected.description && (
                <p className="mt-1 text-muted-foreground">
                  {selected.description}
                </p>
              )}
              {selected.listingTitle && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Related Listing:{" "}
                  <strong className="text-foreground">
                    {selected.listingTitle}
                  </strong>
                </p>
              )}
              {selected.evidenceUrls.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Supporting Evidence ({selected.evidenceUrls.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.evidenceUrls.map((url, idx) => (
                      <Button
                        key={url}
                        size="sm"
                        variant="outline"
                        onClick={() => openEvidence(url)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Evidence {idx + 1}
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Target Report History */}
            {targetHistory.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Target Report History ({targetHistory.length})
                </p>
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border p-2.5 text-xs">
                  {targetHistory.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2.5 py-2"
                    >
                      <span className="truncate">
                        <strong>{h.reporterName}:</strong> {h.reason}
                      </span>
                      <StatusBadge status={h.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Moderation Actions */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2">
                {selected.status === "new" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => handleMarkUnderReview(selected)}
                  >
                    Mark Under Review
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={actionMode === "dismiss" ? "primary" : "outline"}
                  onClick={() => setActionMode("dismiss")}
                >
                  1. Dismiss Report
                </Button>
                <Button
                  size="sm"
                  variant={actionMode === "warn" ? "primary" : "outline"}
                  onClick={() => setActionMode("warn")}
                >
                  2. Issue Warning
                </Button>
                <Button
                  size="sm"
                  variant={actionMode === "suspend" ? "destructive" : "outline"}
                  disabled={!selected.moderationEligible}
                  title={
                    selected.moderationEligible
                      ? "Suspend account (reversible)"
                      : `Requires ${MODERATION_REPORT_THRESHOLD} distinct reporters`
                  }
                  onClick={() => setActionMode("suspend")}
                >
                  3. Suspend Account
                </Button>
                <Button
                  size="sm"
                  variant={actionMode === "ban" ? "destructive" : "outline"}
                  disabled={!selected.moderationEligible}
                  title={
                    selected.moderationEligible
                      ? "Ban account from LodgeMate"
                      : `Requires ${MODERATION_REPORT_THRESHOLD} distinct reporters`
                  }
                  onClick={() => setActionMode("ban")}
                >
                  4. Ban Account
                </Button>
              </div>

              {!selected.moderationEligible && (
                <p className="text-xs text-muted-foreground">
                  Suspend and Ban via reports unlock once{" "}
                  {MODERATION_REPORT_THRESHOLD} distinct reporters have reported
                  this account (currently {selected.distinctReporterCount}/
                  {MODERATION_REPORT_THRESHOLD}).
                </p>
              )}

              {actionMode && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                  <label className="block text-xs font-semibold text-foreground">
                    Mandatory Reason for{" "}
                    <span className="uppercase">{actionMode}</span>
                  </label>
                  <Textarea
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="Document the investigation findings and reason (recorded in immutable audit log)…"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActionMode(null)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        actionMode === "suspend" || actionMode === "ban"
                          ? "destructive"
                          : "primary"
                      }
                      onClick={handleConfirmAction}
                      disabled={busy}
                    >
                      {busy ? "Applying…" : `Confirm ${actionMode}`}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
