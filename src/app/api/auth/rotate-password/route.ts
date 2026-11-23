import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordAdminAction } from "@/lib/audit/logger";

const RotateSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z
    .string()
    .min(12, "New password must be at least 12 characters.")
    .regex(/[A-Z]/, "Include at least one uppercase letter.")
    .regex(/[a-z]/, "Include at least one lowercase letter.")
    .regex(/[0-9]/, "Include at least one number."),
  signOutOthers: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminApi();
    const body = await request.json();
    const parsed = RotateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid password format." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Re-verify current shared admin password before rotating
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: admin.email,
      password: parsed.data.currentPassword,
    });

    if (verifyErr) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 403 }
      );
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password: parsed.data.newPassword,
    });

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message || "Failed to update password." },
        { status: 500 }
      );
    }

    if (parsed.data.signOutOthers) {
      await supabase.auth.signOut({ scope: "others" });
    }

    await recordAdminAction({
      actorId: admin.userId,
      action: "settings.password_rotated",
      targetType: "admin_account",
      targetId: admin.userId,
      resultingState: { signOutOthers: Boolean(parsed.data.signOutOthers) },
      reason: "Controlled shared administrator password rotation completed.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Unable to rotate password right now." },
      { status: 500 }
    );
  }
}
