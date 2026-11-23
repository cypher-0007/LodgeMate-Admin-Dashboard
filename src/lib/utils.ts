import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNgn(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `₦${Math.round(safe).toLocaleString("en-NG")}`;
}

export function formatLagosDate(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  }
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    ...options,
  }).format(date);
}

export function formatLagosDateTime(iso: string | null | undefined): string {
  return formatLagosDate(iso, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type DerivedAccountType = "student" | "agent" | "landlord" | "admin";

/**
 * Derives the exact LodgeMate account type from existing user_roles + profiles.provider_type.
 * Mirrors Lodge-Mate/src/lib/auth-context.tsx without duplicating user tables.
 */
export function deriveAccountType(
  roles: string[],
  providerType?: string | null
): DerivedAccountType {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("landlord")) {
    return providerType === "agent" ? "agent" : "landlord";
  }
  return "student";
}

export function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  if (email && email.trim()) return email.slice(0, 2).toUpperCase();
  return "LM";
}
