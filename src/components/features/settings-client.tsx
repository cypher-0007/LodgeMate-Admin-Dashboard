"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CheckCircle2,
  KeyRound,
  Monitor,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  Input,
  Select,
  StatusBadge,
} from "@/components/ui/primitives";
import { updateNotificationPreferencesAction } from "@/lib/actions/admin-actions";
import {
  MODERATION_REPORT_THRESHOLD,
  NOTIFICATION_EVENTS,
  SHARED_ADMIN_ACTOR_LABEL,
} from "@/lib/constants";
import { formatLagosDateTime } from "@/lib/utils";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const PREFS_STORAGE_KEY = "lodgemateadmin_ui_prefs";

interface LocalUiPrefs {
  tableDensity: "comfortable" | "compact";
  defaultPaymentsView: "current_month" | "all_statuses";
  confirmBeforeSignOut: boolean;
}

const DEFAULT_UI_PREFS: LocalUiPrefs = {
  tableDensity: "comfortable",
  defaultPaymentsView: "current_month",
  confirmBeforeSignOut: true,
};

export function SettingsClient({
  adminEmail,
  vapidPublicKey,
  webPushConfigured,
  initialPrefs,
  subscriptions,
}: {
  adminEmail: string;
  vapidPublicKey: string;
  webPushConfigured: boolean;
  initialPrefs: {
    in_app_enabled: boolean;
    push_enabled: boolean;
    events: Record<string, boolean>;
  };
  subscriptions: Array<{
    id: string;
    device_label: string | null;
    user_agent: string | null;
    created_at: string;
    last_used_at: string;
  }>;
}) {
  const router = useRouter();

  // 1. Controlled Password Rotation State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [rotating, setRotating] = useState(false);

  const passwordChecks = {
    length: newPassword.length >= 12,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    match: newPassword.length > 0 && newPassword === confirmPassword,
  };
  const passwordValid =
    passwordChecks.length &&
    passwordChecks.upper &&
    passwordChecks.lower &&
    passwordChecks.number &&
    passwordChecks.match;

  // 2. Notification Preferences State
  const [inAppEnabled, setInAppEnabled] = useState(initialPrefs.in_app_enabled);
  const [pushEnabled, setPushEnabled] = useState(initialPrefs.push_enabled);
  const [events, setEvents] = useState<Record<string, boolean>>(
    initialPrefs.events
  );
  const [savingPrefs, setSavingPrefs] = useState(false);

  // 3. Browser & Mobile Web Push State
  const [pushSupported, setPushSupported] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [isAndroidDevice, setIsAndroidDevice] = useState(false);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [hasBrowserSub, setHasBrowserSub] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // 4. Local Dashboard UI Preferences (frontend-only, stored in localStorage)
  const [uiPrefs, setUiPrefs] = useState<LocalUiPrefs>(DEFAULT_UI_PREFS);
  const [uiPrefsSavedAt, setUiPrefsSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Load local UI preferences
    try {
      const saved = window.localStorage.getItem(PREFS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<LocalUiPrefs>;
        setUiPrefs((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore storage access restrictions
    }

    const ua = navigator.userAgent;
    setIsIosDevice(/iPad|iPhone|iPod/.test(ua));
    setIsAndroidDevice(/Android/i.test(ua));
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalonePwa(standalone);

    if (
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    ) {
      setPushSupported(true);
      setPermission(Notification.permission);
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setHasBrowserSub(Boolean(sub)))
        .catch(() => {});
    }
  }, []);

  const handleRotatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) {
      toast.error("Please satisfy all password strength requirements first.");
      return;
    }

    setRotating(true);
    try {
      const res = await fetch("/api/auth/rotate-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, signOutOthers }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          body.error ||
            "Password rotation could not be completed. Verify backend authentication is connected."
        );
        return;
      }
      toast.success("Shared administrator password rotated and logged.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    } catch {
      toast.error(
        "Unable to reach password rotation endpoint. Backend authentication must be connected to save changes."
      );
    } finally {
      setRotating(false);
    }
  };

  const handleSaveNotificationPrefs = async () => {
    setSavingPrefs(true);
    try {
      const res = await updateNotificationPreferencesAction({
        inAppEnabled,
        pushEnabled,
        events,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message || "Notification preferences saved.");
      router.refresh();
    } catch {
      toast.error(
        "Unable to persist preferences. Connect the backend database to save notification preferences."
      );
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleEnablePush = async () => {
    if (!vapidPublicKey) {
      toast.error(
        "Web Push VAPID public key is not configured in the environment."
      );
      return;
    }
    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error(
          "Browser push permission was denied. In-dashboard notifications remain active."
        );
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          deviceLabel: `${navigator.platform || "Device"} Browser`,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Failed to save push subscription on server.");
        return;
      }

      setHasBrowserSub(true);
      toast.success("Push notifications enabled on this device.");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to enable Web Push."
      );
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setHasBrowserSub(false);
      toast.success("Push notifications disabled on this device.");
      router.refresh();
    } catch {
      toast.error("Failed to disable push notifications on this device.");
    } finally {
      setPushBusy(false);
    }
  };

  const handleSendTestPush = async () => {
    setPushBusy(true);
    try {
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Test push could not be sent.");
        return;
      }
      toast.success(
        body.sent > 0
          ? `Test push dispatched to ${body.sent} device(s).`
          : body.skippedReason || "No active push devices registered."
      );
    } catch {
      toast.error("Failed to contact Web Push test endpoint.");
    } finally {
      setPushBusy(false);
    }
  };

  const handleSaveUiPrefs = () => {
    try {
      window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(uiPrefs));
      setUiPrefsSavedAt("Saved to this browser");
      toast.success("Dashboard display preferences saved locally on this device.");
    } catch {
      toast.error("Unable to save local browser preferences.");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Shared Administrator Account Information */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
              <UserCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                Shared Administrator Account
              </h2>
              <p className="text-xs text-muted-foreground">
                Single dedicated administrator identity for the LodgeMate operations team.
              </p>
            </div>
          </div>
          <StatusBadge status="active" label="Shared Admin Identity" />
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/30 p-3.5">
            <dt className="text-xs text-muted-foreground">Authorised Email</dt>
            <dd className="mt-1 truncate font-semibold text-foreground">
              {adminEmail}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3.5">
            <dt className="text-xs text-muted-foreground">Audit Log Identity</dt>
            <dd className="mt-1 font-semibold text-foreground">
              {SHARED_ADMIN_ACTOR_LABEL}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3.5">
            <dt className="text-xs text-muted-foreground">Public Registration</dt>
            <dd className="mt-1 font-semibold text-primary">
              Disabled (Private Access Only)
            </dd>
          </div>
        </dl>
      </Card>

      {/* 2. Controlled Password Management */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2.5 border-b border-border pb-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">
              Password Rotation
            </h2>
            <p className="text-xs text-muted-foreground">
              Requires current password verification on the server. Every rotation is recorded in the immutable audit log.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleRotatePassword}
          className="mt-5 max-w-xl space-y-4"
        >
          <div>
            <label
              htmlFor="current-password"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Current Shared Password
            </label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="new-password"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                New Password
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 12 characters"
                required
              />
            </div>
            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Confirm New Password
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
              />
            </div>
          </div>

          {/* Live Password Policy Checklist */}
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs sm:grid-cols-3">
            {[
              { ok: passwordChecks.length, text: "12+ characters" },
              { ok: passwordChecks.upper, text: "Uppercase letter" },
              { ok: passwordChecks.lower, text: "Lowercase letter" },
              { ok: passwordChecks.number, text: "At least one number" },
              { ok: passwordChecks.match, text: "Passwords match" },
            ].map((rule) => (
              <div
                key={rule.text}
                className={`flex items-center gap-1.5 ${
                  rule.ok ? "font-medium text-primary" : "text-muted-foreground"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>{rule.text}</span>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={signOutOthers}
              onChange={(e) => setSignOutOthers(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>Sign out all other active administrator sessions after rotation</span>
          </label>

          <Button type="submit" disabled={rotating || !passwordValid}>
            {rotating ? "Rotating password…" : "Rotate Shared Admin Password"}
          </Button>
        </form>
      </Card>

      {/* 3. Browser & Mobile Web Push Notifications */}
      <Card className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
              <Smartphone className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                Browser &amp; Mobile Web Push
              </h2>
              <p className="text-xs text-muted-foreground">
                Receive alerts on Android browsers and iPhone Home Screen web apps even when the dashboard is closed.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              status={
                permission === "granted"
                  ? "verified"
                  : permission === "denied"
                    ? "rejected"
                    : "pending"
              }
              label={`Permission: ${permission}`}
            />
            <StatusBadge
              status={webPushConfigured ? "verified" : "pending"}
              label={
                webPushConfigured ? "VAPID Configured" : "VAPID Env Pending"
              }
            />
          </div>
        </div>

        {/* Mobile Installation Instructions (iOS & Android) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-primary/20 bg-sidebar p-4 text-xs leading-relaxed text-foreground">
            <p className="font-display text-sm font-bold text-primary">
              iPhone / iPad (iOS) Installation
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>Open LodgeMate Admin in <strong className="text-foreground">Safari</strong>.</li>
              <li>Tap the <strong className="text-foreground">Share</strong> icon at the bottom of the screen.</li>
              <li>Select <strong className="text-foreground">Add to Home Screen</strong>, then tap <strong className="text-foreground">Add</strong>.</li>
              <li>Launch <strong className="text-foreground">LodgeMate Admin</strong> from your Home Screen and enable Push below.</li>
            </ol>
            {isIosDevice && !isStandalonePwa && (
              <p className="mt-2 rounded-lg bg-warning/15 px-2.5 py-1.5 font-semibold text-clay">
                Detected standard iOS Safari — install to Home Screen first to unlock Web Push.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs leading-relaxed text-foreground">
            <p className="font-display text-sm font-bold text-foreground">
              Android Installation (Chrome / Edge)
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>Open LodgeMate Admin in <strong className="text-foreground">Chrome</strong> over HTTPS.</li>
              <li>Tap the browser menu (<strong className="text-foreground">⋮</strong>) and choose <strong className="text-foreground">Install app</strong> or <strong className="text-foreground">Add to Home screen</strong>.</li>
              <li>Tap <strong className="text-foreground">Enable Push on This Device</strong> below and allow notification permissions.</li>
            </ol>
            {isAndroidDevice && isStandalonePwa && (
              <p className="mt-2 font-semibold text-primary">
                Running in installed Android web app mode.
              </p>
            )}
          </div>
        </div>

        {/* Push Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {pushSupported ? (
            hasBrowserSub ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pushBusy}
                  onClick={handleSendTestPush}
                >
                  Send Test Push
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pushBusy}
                  onClick={handleDisablePush}
                >
                  Disable Push on This Device
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={pushBusy || !webPushConfigured}
                onClick={handleEnablePush}
              >
                <BellRing className="h-4 w-4" />
                Enable Push on This Device
              </Button>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Web Push is unavailable in this browser context. In-dashboard notifications remain fully active.
            </p>
          )}
          <span className="text-xs text-muted-foreground">
            {subscriptions.length} registered device(s)
          </span>
        </div>

        {subscriptions.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border text-xs">
            {subscriptions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
              >
                <span className="font-medium text-foreground">
                  {s.device_label || "Registered Admin Device"}
                </span>
                <span className="text-muted-foreground">
                  Last active {formatLagosDateTime(s.last_used_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 4. Notification Preferences */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="border-b border-border pb-4">
          <h2 className="font-display text-lg font-bold text-foreground">
            Notification Preferences
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose which platform events appear in the notification bell and dispatch to subscribed devices.
          </p>
        </div>

        <div className="flex flex-wrap gap-6 border-b border-border pb-4 text-sm">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={inAppEnabled}
              onChange={(e) => setInAppEnabled(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="font-medium text-foreground">
              In-Dashboard Notification Bell
            </span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={pushEnabled}
              onChange={(e) => setPushEnabled(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="font-medium text-foreground">
              Browser &amp; Mobile Web Push
            </span>
          </label>
        </div>

        <div className="divide-y divide-border">
          {NOTIFICATION_EVENTS.map((ev) => (
            <label
              key={ev.key}
              className="flex items-start justify-between gap-4 py-3 cursor-pointer"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {ev.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ev.description}
                </p>
              </div>
              <input
                type="checkbox"
                checked={events[ev.key] !== false}
                onChange={(e) =>
                  setEvents((prev) => ({
                    ...prev,
                    [ev.key]: e.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
            </label>
          ))}
        </div>

        <Button onClick={handleSaveNotificationPrefs} disabled={savingPrefs}>
          {savingPrefs ? "Saving preferences…" : "Save Notification Preferences"}
        </Button>
      </Card>

      {/* 5. General Dashboard Display Preferences (Frontend-Only / Local Device) */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
              <Monitor className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                General Dashboard Preferences
              </h2>
              <p className="text-xs text-muted-foreground">
                Stored locally in this browser for your display comfort.
              </p>
            </div>
          </div>
          {uiPrefsSavedAt && (
            <StatusBadge status="verified" label={uiPrefsSavedAt} />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="table-density"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Table Row Density
            </label>
            <Select
              id="table-density"
              className="w-full"
              value={uiPrefs.tableDensity}
              onChange={(e) =>
                setUiPrefs((prev) => ({
                  ...prev,
                  tableDensity: e.target.value as "comfortable" | "compact",
                }))
              }
            >
              <option value="comfortable">Comfortable (Recommended)</option>
              <option value="compact">Compact</option>
            </Select>
          </div>
          <div>
            <label
              htmlFor="reporting-timezone"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Financial Reporting Timezone
            </label>
            <Input
              id="reporting-timezone"
              value="Africa/Lagos (WAT · UTC+01:00)"
              disabled
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={uiPrefs.confirmBeforeSignOut}
            onChange={(e) =>
              setUiPrefs((prev) => ({
                ...prev,
                confirmBeforeSignOut: e.target.checked,
              }))
            }
            className="h-4 w-4 accent-primary"
          />
          <span>Prompt for confirmation before signing out of the dashboard</span>
        </label>

        <Button variant="outline" onClick={handleSaveUiPrefs}>
          Save Local Display Preferences
        </Button>
      </Card>

      {/* 6. Locked Moderation Policy */}
      <Card className="border-primary/20 bg-sidebar p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-display text-base font-bold text-foreground">
              Locked Moderation Policy
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The LodgeMate moderation eligibility threshold is permanently
              locked at{" "}
              <strong className="text-foreground">
                {MODERATION_REPORT_THRESHOLD} distinct reporting users
              </strong>{" "}
              (excluding dismissed reports). Accounts are never automatically
              banned, and this threshold cannot be modified from the dashboard.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
