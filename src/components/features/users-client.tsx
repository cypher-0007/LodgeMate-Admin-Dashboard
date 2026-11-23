"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, Users, X } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatusBadge,
} from "@/components/ui/primitives";
import type { EnrichedUser } from "@/lib/data/admin-queries";
import { formatLagosDate } from "@/lib/utils";

export function UsersClient({ users }: { users: EnrichedUser[] }) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(
    searchParams.get("type") || "all"
  );
  const [verifiedFilter, setVerifiedFilter] = useState(
    searchParams.get("verified") || "all"
  );
  const [statusFilter, setStatusFilter] = useState("all");

  const hasActiveFilters =
    search.trim() !== "" ||
    typeFilter !== "all" ||
    verifiedFilter !== "all" ||
    statusFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setVerifiedFilter("all");
    setStatusFilter("all");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (typeFilter !== "all" && u.account_type !== typeFilter) return false;
      if (verifiedFilter === "verified" && !u.verified) return false;
      if (verifiedFilter === "unverified" && u.verified) return false;
      if (statusFilter !== "all" && u.account_status !== statusFilter)
        return false;
      if (q) {
        const hay =
          `${u.id} ${u.full_name ?? ""} ${u.email ?? ""} ${u.phone ?? ""} ${u.school ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, typeFilter, verifiedFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone, or ID…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Account Types</option>
            <option value="student">Students</option>
            <option value="agent">Agents</option>
            <option value="landlord">Landlords</option>
          </Select>
          <Select
            value={verifiedFilter}
            onChange={(e) => setVerifiedFilter(e.target.value)}
          >
            <option value="all">All Verification States</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Account Statuses</option>
            <option value="active">Active</option>
            <option value="warned">Warned</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing <strong className="text-foreground">{filtered.length}</strong>{" "}
            of {users.length} account(s)
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
          title="No users match your filters"
          description="Try adjusting your search query or account filters."
          icon={<Users className="h-5 w-5" />}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Campus / Area</th>
                  <th className="px-4 py-3 font-semibold">Verification</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 text-right font-semibold">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {u.full_name || "Unnamed User"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {u.email || u.phone || u.id.slice(0, 10)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.account_type} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.school || u.operating_area || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={u.verified ? "verified" : "unverified"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.account_status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatLagosDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/users/${u.id}`}
                        className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {filtered.map((u) => (
              <Link
                key={u.id}
                href={`/users/${u.id}`}
                className="block space-y-2 p-4 hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">
                      {u.full_name || "Unnamed User"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {u.email || u.phone || u.id.slice(0, 10)}
                    </p>
                  </div>
                  <StatusBadge status={u.account_status} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge status={u.account_type} />
                  <StatusBadge
                    status={u.verified ? "verified" : "unverified"}
                  />
                  <span className="ml-auto text-muted-foreground">
                    Joined {formatLagosDate(u.created_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
