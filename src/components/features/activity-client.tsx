"use client";

import { useMemo, useState } from "react";
import { Activity, Search, X } from "lucide-react";
import { Button, Card, EmptyState, Input, Select } from "@/components/ui/primitives";
import { formatLagosDateTime } from "@/lib/utils";

export interface ActivityLogRow {
  id: string;
  actor_label: string;
  action: string;
  target_type: string;
  target_id: string | null;
  previous_state: Record<string, unknown> | null;
  resulting_state: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export function ActivityClient({ logs }: { logs: ActivityLogRow[] }) {
  const [search, setSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState("all");

  const hasActiveFilters = search.trim() !== "" || targetFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setTargetFilter("all");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (targetFilter !== "all" && l.target_type !== targetFilter) return false;
      if (q) {
        const hay =
          `${l.action} ${l.target_type} ${l.target_id ?? ""} ${l.reason ?? ""} ${l.actor_label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, targetFilter]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search action, target ID, or reason…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
          >
            <option value="all">All Target Types</option>
            <option value="user">Users</option>
            <option value="report">Reports</option>
            <option value="verification_submission">Verifications</option>
            <option value="listing">Listings</option>
            <option value="payment">Payments</option>
            <option value="platform_feedback">Feedback</option>
            <option value="settings">Settings</option>
            <option value="session">Sessions</option>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing <strong className="text-foreground">{filtered.length}</strong>{" "}
            of {logs.length} audit record(s)
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
          title="No administrative actions recorded"
          description="Every verification decision, moderation action, listing update, refund, and settings change will be permanently logged here."
          icon={<Activity className="h-5 w-5" />}
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {filtered.map((log) => (
            <div key={log.id} className="space-y-1.5 p-4 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                    {log.action}
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {log.target_type}
                    {log.target_id ? ` · ${log.target_id}` : ""}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {log.actor_label} · {formatLagosDateTime(log.created_at)}
                </span>
              </div>
              {log.reason && (
                <p className="text-xs text-muted-foreground">{log.reason}</p>
              )}
              {(log.previous_state || log.resulting_state) && (
                <div className="flex flex-col gap-1.5 pt-1 font-mono text-[11px] text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-3">
                  {log.previous_state && (
                    <span className="break-all">
                      Before: {JSON.stringify(log.previous_state)}
                    </span>
                  )}
                  {log.resulting_state && (
                    <span className="break-all">
                      After: {JSON.stringify(log.resulting_state)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
