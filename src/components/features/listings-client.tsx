"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Search, X } from "lucide-react";
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
import { updateListingStatusAction } from "@/lib/actions/admin-actions";
import { formatLagosDate, formatNgn } from "@/lib/utils";

export interface EnrichedListingRow {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerType: string;
  title: string;
  kind: string;
  school: string;
  area: string;
  price: number;
  period: string;
  imageUrl: string | null;
  description: string;
  verified: boolean;
  isBeta: boolean;
  status: string;
  reportCount: number;
  createdAt: string;
}

export function ListingsClient({
  listings,
}: {
  listings: EnrichedListingRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "all"
  );
  const [locationFilter, setLocationFilter] = useState("all");
  const [reportedOnly, setReportedOnly] = useState(false);
  const [selected, setSelected] = useState<EnrichedListingRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    locationFilter !== "all" ||
    reportedOnly;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setLocationFilter("all");
    setReportedOnly(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (locationFilter !== "all" && l.school !== locationFilter) return false;
      if (reportedOnly && l.reportCount === 0) return false;
      if (q) {
        const hay =
          `${l.title} ${l.area} ${l.school} ${l.ownerName} ${l.kind}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [listings, search, statusFilter, locationFilter, reportedOnly]);

  const handleStatusChange = async (
    listingId: string,
    status: "approved" | "rejected" | "removed" | "pending"
  ) => {
    setBusy(true);
    const res = await updateListingStatusAction({
      listingId,
      status,
      reason: note.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message || "Listing updated.");
    setSelected(null);
    setNote("");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search title, area, or host…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Publication Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="removed">Removed / Unpublished</option>
          </Select>
          <Select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          >
            <option value="all">All Campuses</option>
            <option value="MOUAU">MOUAU</option>
            <option value="ABSU">ABSU</option>
          </Select>
          <label className="flex items-center gap-2 rounded-xl border border-input bg-background px-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={reportedOnly}
              onChange={(e) => setReportedOnly(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>Reported listings only</span>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing <strong className="text-foreground">{filtered.length}</strong>{" "}
            of {listings.length} listing(s)
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
          title="No listings match your filters"
          description="Accommodation listings submitted by landlords, agents, and students will appear here."
          icon={<Building2 className="h-5 w-5" />}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Listing</th>
                  <th className="px-4 py-3 font-semibold">Host</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Reports</th>
                  <th className="px-4 py-3 text-right font-semibold">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate font-medium text-foreground">
                        {l.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {l.kind}
                        {l.isBeta ? " · Beta Lodge" : ""} ·{" "}
                        {formatLagosDate(l.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/users/${l.ownerId}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {l.ownerName}
                      </Link>
                      <p className="text-xs capitalize text-muted-foreground">
                        {l.ownerType}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {l.school} · {l.area || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-display font-bold tabular-nums">
                      {formatNgn(l.price)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="px-4 py-3">
                      {l.reportCount > 0 ? (
                        <StatusBadge
                          status="critical"
                          label={`${l.reportCount} report(s)`}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(l);
                          setNote("");
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
            {filtered.map((l) => (
              <div key={l.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.school} · {l.area} · {formatNgn(l.price)} {l.period}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Host: {l.ownerName}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelected(l);
                      setNote("");
                    }}
                  >
                    Manage
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title || "Listing Details"}
        description={
          selected
            ? `${selected.kind} · ${selected.school} (${selected.area}) · ${formatNgn(selected.price)} ${selected.period}`
            : undefined
        }
        maxWidth="max-w-2xl"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            {selected.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.imageUrl}
                alt={selected.title}
                className="h-52 w-full rounded-xl border border-border object-cover"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              {selected.isBeta && <StatusBadge status="verified" label="Beta Lodge" />}
              {selected.reportCount > 0 && (
                <StatusBadge
                  status="critical"
                  label={`${selected.reportCount} active report(s)`}
                />
              )}
            </div>
            <p className="text-muted-foreground">{selected.description}</p>
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
              Host: <strong>{selected.ownerName}</strong> ({selected.ownerType}) ·{" "}
              <Link
                href={`/users/${selected.ownerId}`}
                className="font-semibold text-primary hover:underline"
              >
                View host profile →
              </Link>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">
                Moderation Note (Optional, Audit Logged)
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for approval, rejection, removal, or restoration…"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {selected.status !== "approved" && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => handleStatusChange(selected.id, "approved")}
                >
                  {selected.status === "removed" ? "Restore & Publish" : "Approve & Verify"}
                </Button>
              )}
              {selected.status !== "rejected" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => handleStatusChange(selected.id, "rejected")}
                >
                  Reject
                </Button>
              )}
              {selected.status !== "removed" && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => handleStatusChange(selected.id, "removed")}
                >
                  Unpublish / Remove
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
