"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui/primitives";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    urlError === "unauthorized"
      ? "Access denied. Only the authorised LodgeMate administrator account may enter."
      : urlError === "config"
        ? "Supabase environment variables are not configured on the server."
        : null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const body = await res.json();
      if (!res.ok) {
        const msg = body?.error || "Authentication failed.";
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      toast.success("Signed in to LodgeMate Admin");
      router.push(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch {
      const msg = "Network error while signing in. Please try again.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-card sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="bg-canopy flex h-12 w-12 items-center justify-center rounded-xl text-primary-foreground shadow-sm">
            <MapPin className="h-6 w-6" />
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Private Administration Portal
          </span>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground">
            LodgeMate Admin
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with the authorised shared administrator credentials.
          </p>
        </div>

        {errorMsg && (
          <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="admin-email"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Administrator Email
            </label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="email"
              placeholder="admin@lodgemate.ng"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Password
            </label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter shared admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loading}
          >
            <Lock className="h-4 w-4" />
            {loading ? "Verifying credentials…" : "Sign In to Admin Dashboard"}
          </Button>
        </form>

        <div className="mt-6 rounded-xl border border-border bg-sidebar p-3.5 text-xs leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">
            Restricted Access:
          </strong>{" "}
          Public registration is disabled. Ordinary LodgeMate student, agent,
          and landlord accounts cannot access this portal. Every sign-in and
          administrative action is recorded in the audit log.
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Loading LodgeMate Admin…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
