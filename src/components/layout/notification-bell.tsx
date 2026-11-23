"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  createBrowserSupabaseClient,
  isSupabaseClientConfigured,
} from "@/lib/supabase/client";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/admin-actions";
import { cn, formatLagosDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/primitives";

export interface AdminNotificationItem {
  id: string;
  event_type: string;
  title: string;
  body: string;
  severity: string;
  target_url: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell({
  initialItems,
}: {
  initialItems: AdminNotificationItem[];
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotificationItem[]>(initialItems);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = items.filter((n) => !n.is_read).length;

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Subscribe to live database events via Supabase Realtime
  useEffect(() => {
    if (!isSupabaseClientConfigured()) return;
    let supabase: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      supabase = createBrowserSupabaseClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel("admin-notifications-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          const next = payload.new as AdminNotificationItem;
          setItems((prev) => {
            if (prev.some((i) => i.id === next.id)) return prev;
            return [next, ...prev].slice(0, 30);
          });
          toast.info(next.title, { description: next.body });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const handleMarkRead = async (id: string) => {
    const previous = items;
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    const res = await markNotificationReadAction(id);
    if (!res.ok) {
      setItems(previous);
      toast.error(res.error || "Unable to update notification status.");
    }
  };

  const handleMarkAllRead = async () => {
    const previous = items;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const res = await markAllNotificationsReadAction();
    if (!res.ok) {
      setItems(previous);
      toast.error(res.error || "Unable to mark notifications as read.");
      return;
    }
    toast.success("All notifications marked as read");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-accent cursor-pointer"
        aria-label="Open notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-3 shadow-lift z-50 sm:w-96">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div>
              <h3 className="font-display text-sm font-bold text-foreground">
                Notifications
              </h3>
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-secondary cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
            {items.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No notifications yet.
              </p>
            ) : (
              items.slice(0, 12).map((n) => (
                <Link
                  key={n.id}
                  href={n.target_url || "/"}
                  onClick={() => {
                    if (!n.is_read) void handleMarkRead(n.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "block rounded-xl border p-3 transition-colors hover:bg-muted/60",
                    n.is_read
                      ? "border-transparent bg-transparent"
                      : "border-primary/20 bg-sidebar"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {n.title}
                    </span>
                    {n.severity === "critical" && (
                      <StatusBadge status="critical" label="Urgent" />
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {n.body}
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {formatLagosDateTime(n.created_at)}
                  </p>
                </Link>
              ))
            )}
          </div>

          <div className="mt-2.5 border-t border-border pt-2.5 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View full notification history →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
