"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  EmptyState,
  StatusBadge,
} from "@/components/ui/primitives";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/admin-actions";
import type { AdminNotificationItem } from "@/components/layout/notification-bell";
import { cn, formatLagosDateTime } from "@/lib/utils";

export function NotificationsClient({
  initialItems,
}: {
  initialItems: AdminNotificationItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const unreadCount = items.filter((i) => !i.is_read).length;

  const visibleItems =
    filter === "unread" ? items.filter((i) => !i.is_read) : items;

  const markRead = async (id: string) => {
    const previous = items;
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, is_read: true } : i))
    );
    const res = await markNotificationReadAction(id);
    if (!res.ok) {
      setItems(previous);
      toast.error(res.error || "Unable to mark notification as read.");
    }
  };

  const markAllRead = async () => {
    const previous = items;
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    const res = await markAllNotificationsReadAction();
    if (!res.ok) {
      setItems(previous);
      toast.error(res.error || "Unable to mark notifications as read.");
      return;
    }
    toast.success("All notifications marked as read.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={filter === "all" ? "primary" : "outline"}
            onClick={() => setFilter("all")}
          >
            All ({items.length})
          </Button>
          <Button
            size="sm"
            variant={filter === "unread" ? "primary" : "outline"}
            onClick={() => setFilter("unread")}
          >
            Unread ({unreadCount})
          </Button>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <EmptyState
          title={
            filter === "unread"
              ? "All caught up"
              : "No notifications yet"
          }
          description={
            filter === "unread"
              ? "There are no unread notifications right now."
              : "Live platform events will appear here automatically."
          }
          icon={<Bell className="h-5 w-5" />}
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {visibleItems.map((n) => (
            <div
              key={n.id}
              className={cn(
                "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between",
                !n.is_read && "bg-sidebar"
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {n.title}
                  </span>
                  {n.severity === "critical" && (
                    <StatusBadge status="critical" label="Urgent" />
                  )}
                  {!n.is_read && <StatusBadge status="new" label="Unread" />}
                </div>
                <p className="text-sm text-muted-foreground">{n.body}</p>
                <p className="text-xs text-muted-foreground">
                  {formatLagosDateTime(n.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!n.is_read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => markRead(n.id)}
                  >
                    Mark read
                  </Button>
                )}
                <Link
                  href={n.target_url || "/"}
                  onClick={() => {
                    if (!n.is_read) void markRead(n.id);
                  }}
                  className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
                >
                  Open →
                </Link>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
