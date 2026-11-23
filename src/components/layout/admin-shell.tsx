"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  Bell,
  Building2,
  CreditCard,
  Flag,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquareWarning,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, Modal } from "@/components/ui/primitives";
import {
  NotificationBell,
  type AdminNotificationItem,
} from "@/components/layout/notification-bell";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/reports", label: "Reports & Moderation", icon: Flag },
  { href: "/verifications", label: "Account Verification", icon: BadgeCheck },
  { href: "/payments", label: "Payments & Revenue", icon: CreditCard },
  { href: "/users", label: "Users Directory", icon: Users },
  { href: "/listings", label: "Listings", icon: Building2 },
  { href: "/feedback", label: "Feedback & Complaints", icon: MessageSquareWarning },
  { href: "/activity", label: "Activity Log", icon: Activity },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Admin Settings", icon: Settings },
];

export function AdminShell({
  adminEmail,
  initialNotifications,
  children,
}: {
  adminEmail: string;
  initialNotifications: AdminNotificationItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const activeNav = NAV_ITEMS.find((item) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  // Close mobile drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll and support Escape key when mobile drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  // Register Service Worker for Web Push support (graceful no-op if unsupported)
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ignore registration errors in restricted dev contexts
      });
    }
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Signed out of LodgeMate Admin");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Failed to sign out");
    } finally {
      setSigningOut(false);
      setSignOutOpen(false);
    }
  };

  const renderNavLinks = () => (
    <nav className="space-y-1" aria-label="Admin navigation">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:shrink-0 lg:flex-col lg:border-r lg:border-sidebar-border lg:bg-sidebar transition-all duration-200",
          sidebarCollapsed ? "lg:w-20" : "lg:w-64"
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border",
            sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="bg-canopy flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary-foreground shadow-xs">
              <MapPin className="h-4 w-4" />
            </span>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-display text-base font-bold leading-none text-foreground">
                  LodgeMate
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-clay">
                  Admin Console
                </div>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {sidebarCollapsed ? (
            <nav className="flex flex-col items-center gap-1.5" aria-label="Admin navigation">
              {NAV_ITEMS.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-2xs"
                        : "text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
            </nav>
          ) : (
            renderNavLinks()
          )}
        </div>

        <div className="border-t border-sidebar-border p-3">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSignOutOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 cursor-pointer"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground">
                Shared Admin Account
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {adminEmail}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2.5 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setSignOutOpen(true)}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Slide-Out Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation menu"
            className="flex h-full w-[82vw] max-w-[300px] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
              <div className="flex items-center gap-2">
                <span className="bg-canopy flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground">
                  <MapPin className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-display text-sm font-bold leading-none">
                    LodgeMate
                  </div>
                  <div className="text-[11px] font-semibold text-clay">
                    Admin Console
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              {renderNavLinks()}
            </div>
            <div className="border-t border-sidebar-border p-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setDrawerOpen(false);
                  setSignOutOpen(true);
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign out ({adminEmail})
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground lg:hidden cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="truncate font-display text-sm font-bold text-foreground lg:hidden">
              {activeNav?.label ?? "LodgeMate Admin"}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground sm:inline-flex">
              Africa/Lagos (WAT)
            </span>
            <NotificationBell initialItems={initialNotifications} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {/* Sign Out Confirmation Modal */}
      <Modal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title="Sign out of LodgeMate Admin?"
        description="Your current administrator session on this device will end and be recorded in the audit log."
        maxWidth="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setSignOutOpen(false)}
            disabled={signingOut}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Yes, Sign Out"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
