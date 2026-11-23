"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Modal, Textarea } from "@/components/ui/primitives";
import { moderateUserAccountAction } from "@/lib/actions/admin-actions";

export function UserActionsClient({
  userId,
  accountStatus,
  isDeleted,
}: {
  userId: string;
  accountStatus: string;
  isDeleted: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<
    "warn" | "suspend" | "ban" | "restore" | "soft_delete" | null
  >(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!mode) return;
    if (reason.trim().length < 5) {
      toast.error("Please enter a reason (at least 5 characters).");
      return;
    }
    setBusy(true);
    const res = await moderateUserAccountAction({
      targetUserId: userId,
      actionType: mode,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message || "Account updated.");
    setMode(null);
    setReason("");
    router.refresh();
  };

  if (isDeleted) {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
        Soft-Deleted / Anonymised
      </span>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(accountStatus === "suspended" || accountStatus === "banned") && (
          <Button size="sm" onClick={() => setMode("restore")}>
            Restore Account
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setMode("warn")}>
          Warn
        </Button>
        {accountStatus !== "suspended" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMode("suspend")}
          >
            Suspend
          </Button>
        )}
        {accountStatus !== "banned" && (
          <Button size="sm" variant="destructive" onClick={() => setMode("ban")}>
            Ban
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => setMode("soft_delete")}
        >
          Soft Delete
        </Button>
      </div>

      <Modal
        open={Boolean(mode)}
        onClose={() => setMode(null)}
        title={`Confirm Account Action: ${mode?.replace("_", " ").toUpperCase()}`}
        description={
          mode === "soft_delete"
            ? "Soft deletion anonymises personal details while preserving financial, report, and audit records."
            : "This action will be enforced immediately and recorded in the immutable admin activity log."
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold">
              Reason (Mandatory)
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Document why this account action is being taken…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setMode(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant={
                mode === "ban" || mode === "suspend" || mode === "soft_delete"
                  ? "destructive"
                  : "primary"
              }
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? "Applying…" : "Confirm"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
