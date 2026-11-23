import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVerifiedAdminSession } from "@/lib/auth/admin-guard";
import { recordAdminAction } from "@/lib/audit/logger";

export async function POST() {
  try {
    const session = await getVerifiedAdminSession();
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();

    if (session) {
      await recordAdminAction({
        actorId: session.userId,
        action: "auth.logout",
        targetType: "session",
        targetId: session.userId,
        reason: "Shared administrator signed out.",
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
