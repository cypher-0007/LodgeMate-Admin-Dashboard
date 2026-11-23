"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, ExternalLink, FileText, Search } from "lucide-react";
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
import { decideVerificationAction } from "@/lib/actions/admin-actions";
import { cn, formatLagosDateTime } from "@/lib/utils";

export interface EnrichedVerificationSubmission {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  userPhone: string | null;
  accountType: string;
  status: string;
  documentPaths: string[];
  submittedMetadata: Record<string, unknown>;
  submittedAt: string;
  previousDecisions: Array<{
    id: string;
    decision: string;
    reason: string | null;
    notes: string | null;
    createdAt: string;
  }>;
}

const QUEUE_TABS = [
  { key: "student", label: "Students" },
  { key: "agent", label: "Agents" },
  { key: "landlord", label: "Landlords" },
] as const;

export function VerificationsClient({
  submissions,
}: {
  submissions: EnrichedVerificationSubmission[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get("tab");
  const initialTab: "student" | "agent" | "landlord" =
    initialTabParam === "agent" || initialTabParam === "landlord"
      ? initialTabParam
      : "student";
  const [activeTab, setActiveTab] = useState<"student" | "agent" | "landlord">(
    initialTab
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] =
    useState<EnrichedVerificationSubmission | null>(null);
  const [decisionMode, setDecisionMode] = useState<
    "approved" | "rejected" | "info_requested" | "resubmission_requested" | null
  >(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const countsByTab = useMemo(() => {
    const counts = { student: 0, agent: 0, landlord: 0 };
    for (const s of submissions) {
      if (s.status === "pending" && s.accountType in counts) {
        counts[s.accountType as keyof typeof counts] += 1;
      }
    }
    return counts;
  }, [submissions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((s) => {
      if (s.accountType !== activeTab) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q) {
        const hay = `${s.userName} ${s.userEmail ?? ""} ${s.userPhone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, activeTab, statusFilter, search]);

  const openSignedDocument = async (path: string) => {
    try {
      const res = await fetch("/api/admin/documents/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "verification-documents", path }),
      });
      const data = await res.json();
      if (!res.ok || !data.signedUrl) {
        toast.error(data.error || "Unable to open private document.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to retrieve signed document URL.");
    }
  };

  const handleSubmitDecision = async () => {
    if (!selected || !decisionMode) return;
    setBusy(true);
    const res = await decideVerificationAction({
      submissionId: selected.id,
      userId: selected.userId,
      decision: decisionMode,
      reason: reason.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setBusy(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    toast.success(res.message || "Verification decision recorded.");
    setSelected(null);
    setDecisionMode(null);
    setReason("");
    setNotes("");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Separate Queues Tabs */}
      <div className="flex flex-wrap gap-2">
        {QUEUE_TABS.map((tab) => {
          const active = activeTab === tab.key;
          const pendingCount = countsByTab[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors cursor-pointer",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent"
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-bold",
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {pendingCount} pending
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${activeTab}s by name, email, or phone…`}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="info_requested">Info Requested</option>
            <option value="resubmission_requested">Resubmission Requested</option>
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title={`No ${activeTab} verification submissions`}
          description={`Submissions from ${activeTab} accounts will appear here for private document inspection and approval.`}
          icon={<BadgeCheck className="h-5 w-5" />}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Applicant</th>
                  <th className="px-4 py-3 font-semibold">Account Type</th>
                  <th className="px-4 py-3 font-semibold">Documents</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 text-right font-semibold">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{s.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.userEmail || s.userPhone || s.userId.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-4 py-3 capitalize">{s.accountType}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.documentPaths.length} file(s)
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatLagosDateTime(s.submittedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(s);
                          setDecisionMode(null);
                          setReason("");
                          setNotes("");
                        }}
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {filtered.map((s) => (
              <div key={s.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{s.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.documentPaths.length} document(s) ·{" "}
                      {formatLagosDateTime(s.submittedAt)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelected(s);
                    setDecisionMode(null);
                    setReason("");
                    setNotes("");
                  }}
                >
                  Review Submission
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Inspection Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setDecisionMode(null);
        }}
        title={selected ? `Verify ${selected.userName}` : "Verification"}
        description={
          selected
            ? `${selected.accountType.toUpperCase()} · Submitted ${formatLagosDateTime(selected.submittedAt)}`
            : undefined
        }
        maxWidth="max-w-2xl"
      >
        {selected && (
          <div className="space-y-5 text-sm">
            {/* Submitted Metadata */}
            {Object.keys(selected.submittedMetadata).length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Submitted Details
                </p>
                <dl className="mt-2 grid grid-cols-1 gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                  {Object.entries(selected.submittedMetadata).map(([k, v]) => (
                    <div key={k}>
                      <dt className="capitalize text-muted-foreground">
                        {k.replace(/_/g, " ")}
                      </dt>
                      <dd className="font-medium text-foreground break-words">
                        {String(v ?? "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Private Documents */}
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Submitted Identity Documents (Private · 60s Signed Access)
              </p>
              {selected.documentPaths.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No document paths attached to this submission.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.documentPaths.map((path, idx) => (
                    <Button
                      key={path}
                      size="sm"
                      variant="outline"
                      onClick={() => openSignedDocument(path)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Document {idx + 1}
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Previous Decisions */}
            {selected.previousDecisions.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Previous Verification Decisions
                </p>
                <ul className="mt-2 space-y-1.5 rounded-xl border border-border p-3 text-xs">
                  {selected.previousDecisions.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-start justify-between gap-2"
                    >
                      <div>
                        <StatusBadge status={d.decision} />
                        {d.reason && (
                          <p className="mt-1 text-muted-foreground">
                            {d.reason}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-muted-foreground">
                        {formatLagosDateTime(d.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decision Controls */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={decisionMode === "approved" ? "primary" : "outline"}
                  onClick={() => setDecisionMode("approved")}
                >
                  Approve Verification
                </Button>
                <Button
                  size="sm"
                  variant={
                    decisionMode === "info_requested" ? "primary" : "outline"
                  }
                  onClick={() => setDecisionMode("info_requested")}
                >
                  Request Additional Info
                </Button>
                <Button
                  size="sm"
                  variant={
                    decisionMode === "resubmission_requested"
                      ? "primary"
                      : "outline"
                  }
                  onClick={() => setDecisionMode("resubmission_requested")}
                >
                  Request Resubmission
                </Button>
                <Button
                  size="sm"
                  variant={
                    decisionMode === "rejected" ? "destructive" : "outline"
                  }
                  onClick={() => setDecisionMode("rejected")}
                >
                  Reject
                </Button>
              </div>

              {decisionMode && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                  <label className="block text-xs font-semibold text-foreground">
                    {decisionMode === "approved"
                      ? "Approval Note (Optional)"
                      : "Reason (Mandatory)"}
                  </label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      decisionMode === "approved"
                        ? "Optional verification remarks…"
                        : "Explain why verification is rejected or what needs to be resubmitted…"
                    }
                  />
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-foreground">
                      Internal Reviewer Notes (Optional)
                    </label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Private internal verification notes for the admin team…"
                      className="min-h-16"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDecisionMode(null)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        decisionMode === "rejected" ? "destructive" : "primary"
                      }
                      onClick={handleSubmitDecision}
                      disabled={busy}
                    >
                      {busy
                        ? "Saving…"
                        : `Confirm ${decisionMode.replace(/_/g, " ")}`}
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
