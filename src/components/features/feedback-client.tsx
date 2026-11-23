"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareWarning, Search, X } from "lucide-react";
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
import { updateFeedbackAction } from "@/lib/actions/admin-actions";
import { FEEDBACK_CATEGORIES } from "@/lib/constants";
import { formatLagosDateTime } from "@/lib/utils";

export interface FeedbackItem {
  id: string;
  sender_name: string | null;
  sender_email: string | null;
  account_type: string | null;
  category: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  internal_notes: string | null;
  created_at: string;
}

export function FeedbackClient({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [status, setStatus] = useState<"open" | "in_progress" | "resolved">("open");
  const [category, setCategory] = useState("general_complaint");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const hasActiveFilters =
    search.trim() !== "" || statusFilter !== "all" || categoryFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter)
        return false;
      if (q) {
        const hay =
          `${item.subject} ${item.message} ${item.sender_name ?? ""} ${item.sender_email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, categoryFilter]);

  const openModal = (item: FeedbackItem) => {
    setSelected(item);
    setStatus(item.status);
    setCategory(item.category);
    setNotes(item.internal_notes ?? "");
  };

  const handleSave = async () => {
    if (!selected) return;
    setBusy(true);
    const res = await updateFeedbackAction({
      id: selected.id,
      status,
      category: category as (typeof FEEDBACK_CATEGORIES)[number]["value"],
      internalNotes: notes,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Feedback updated.");
    setSelected(null);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subject, message, or sender…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing <strong className="text-foreground">{filtered.length}</strong>{" "}
            of {items.length} submission(s)
          </span>
          {hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No feedback or complaints found"
          description="Platform issues, bug reports, suggestions, and complaints submitted to LodgeMate will appear here."
          icon={<MessageSquareWarning className="h-5 w-5" />}
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 p-4 hover:bg-muted/30 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground">
                    {item.subject}
                  </h3>
                  <StatusBadge status={item.status} />
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium capitalize text-secondary-foreground">
                    {item.category.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {item.message}
                </p>
                <p className="text-xs text-muted-foreground">
                  From {item.sender_name || "User"} (
                  {item.sender_email || "no email"}) ·{" "}
                  {formatLagosDateTime(item.created_at)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => openModal(item)}
              >
                Manage
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject || "Feedback Details"}
        description={
          selected
            ? `From ${selected.sender_name || "User"} (${selected.sender_email || "—"}) · ${formatLagosDateTime(selected.created_at)}`
            : undefined
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-foreground break-words">
              {selected.message}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="feedback-category"
                  className="mb-1 block text-xs font-semibold"
                >
                  Category
                </label>
                <Select
                  id="feedback-category"
                  className="w-full"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label
                  htmlFor="feedback-status"
                  className="mb-1 block text-xs font-semibold"
                >
                  Status
                </label>
                <Select
                  id="feedback-status"
                  className="w-full"
                  value={status}
                  onChange={(e) =>
                    setStatus(
                      e.target.value as "open" | "in_progress" | "resolved"
                    )
                  }
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </Select>
              </div>
            </div>
            <div>
              <label
                htmlFor="feedback-notes"
                className="mb-1 block text-xs font-semibold"
              >
                Internal Admin Notes
              </label>
              <Textarea
                id="feedback-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal investigation or resolution notes…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setSelected(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={busy}>
                {busy ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
