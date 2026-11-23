import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  Building2,
  Clock,
  CreditCard,
  Flag,
  GraduationCap,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { fetchOverviewData } from "@/lib/data/admin-queries";
import { formatLagosDateTime, formatNgn } from "@/lib/utils";
import {
  Card,
  MigrationNotice,
  PageHeader,
  StatusBadge,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const { stats, recent, migrationsPending } = await fetchOverviewData();

  const kpiCards = [
    {
      label: "Total Registered Users",
      value: stats.totalUsers.toLocaleString("en-NG"),
      icon: Users,
      href: "/users",
    },
    {
      label: "Total Students",
      value: stats.studentsCount.toLocaleString("en-NG"),
      icon: GraduationCap,
      href: "/users?type=student",
    },
    {
      label: "Total Agents",
      value: stats.agentsCount.toLocaleString("en-NG"),
      icon: UserCheck,
      href: "/users?type=agent",
    },
    {
      label: "Total Landlords",
      value: stats.landlordsCount.toLocaleString("en-NG"),
      icon: Building2,
      href: "/users?type=landlord",
    },
    {
      label: "Verified Accounts",
      value: stats.verifiedCount.toLocaleString("en-NG"),
      icon: BadgeCheck,
      href: "/users?verified=verified",
      accent: "text-primary",
    },
    {
      label: "Pending Verifications",
      value: stats.pendingVerifications.toLocaleString("en-NG"),
      icon: Clock,
      href: "/verifications",
      accent: "text-clay",
    },
    {
      label: "Active Listings",
      value: stats.activeListingsCount.toLocaleString("en-NG"),
      icon: Building2,
      href: "/listings?status=approved",
    },
    {
      label: "Reports Awaiting Review",
      value: stats.reportsAwaitingReview.toLocaleString("en-NG"),
      subtext:
        stats.eligibleTargetsCount > 0
          ? `${stats.eligibleTargetsCount} at 3+ reporters`
          : "No accounts at 3-report threshold",
      icon: Flag,
      href: "/reports",
      accent: stats.reportsAwaitingReview > 0 ? "text-destructive" : undefined,
      highlightBorder: stats.reportsAwaitingReview > 0,
    },
    {
      label: "Successful Payments",
      value: stats.successfulPaymentsCount.toLocaleString("en-NG"),
      icon: CreditCard,
      href: "/payments",
    },
    {
      label: `Net Revenue (${stats.currentMonthLabel})`,
      value: formatNgn(stats.currentMonthRevenueNgn),
      icon: CreditCard,
      href: "/payments",
      accent: "text-primary",
      softBg: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Overview"
        description="Live operational metrics from the LodgeMate platform. All revenue figures are grouped in Africa/Lagos (WAT)."
      />

      {migrationsPending && <MigrationNotice />}

      {/* 10 Live KPI Summary Cards (Zero Charts) */}
      <section aria-label="Platform statistics">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.label} href={card.href} className="group block">
                <Card
                  className={`h-full p-4 transition-all hover:border-primary/40 ${
                    card.softBg ? "bg-sidebar border-primary/25" : ""
                  } ${card.highlightBorder ? "border-destructive/35" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {card.label}
                    </span>
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <div
                    className={`mt-2 font-display text-2xl font-bold tabular-nums ${
                      card.accent ?? "text-foreground"
                    }`}
                  >
                    {card.value}
                  </div>
                  {card.subtext && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {card.subtext}
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent Activity Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Recent Reports */}
        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <h2 className="font-display text-base font-bold">New Reports</h2>
            </div>
            <Link
              href="/reports"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Manage reports →
            </Link>
          </div>
          {recent.reports.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No reports recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.reports.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {r.reason}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      By {r.reporterName} · {formatLagosDateTime(r.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={r.normalizedStatus} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent Verified Payments */}
        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-bold">
                Recent Successful Payments
              </h2>
            </div>
            <Link
              href="/payments"
              className="text-xs font-semibold text-primary hover:underline"
            >
              View ledger →
            </Link>
          </div>
          {recent.payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No verified payments recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {p.userName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {p.reference} · {p.provider} ·{" "}
                      {formatLagosDateTime(p.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 font-display font-bold tabular-nums text-primary">
                    {formatNgn(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent Registrations */}
        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-bold">
                Recent Registrations
              </h2>
            </div>
            <Link
              href="/users"
              className="text-xs font-semibold text-primary hover:underline"
            >
              All users →
            </Link>
          </div>
          {recent.registrations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No registered users found.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.registrations.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/users/${u.id}`}
                      className="truncate font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {u.full_name || u.email || "Unnamed User"}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {u.school || "No campus"} ·{" "}
                      {formatLagosDateTime(u.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={u.account_type} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent Verification Submissions */}
        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-clay" />
              <h2 className="font-display text-base font-bold">
                New Verification Submissions
              </h2>
            </div>
            <Link
              href="/verifications"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Review queue →
            </Link>
          </div>
          {recent.verifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No verification submissions yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.verifications.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {v.userName}
                    </p>
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                      {v.account_type} · {formatLagosDateTime(v.submitted_at)}
                    </p>
                  </div>
                  <StatusBadge status={v.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Recent Administrative Actions */}
      <Card className="p-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="font-display text-base font-bold">
              Recent Administrative Actions
            </h2>
          </div>
          <Link
            href="/activity"
            className="text-xs font-semibold text-primary hover:underline"
          >
            Full audit log →
          </Link>
        </div>
        {recent.adminActions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No administrative actions logged yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.adminActions.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-foreground">
                    {a.action}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    on {a.target_type}
                    {a.target_id ? ` (${a.target_id.slice(0, 8)}…)` : ""}
                  </span>
                  {a.reason && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.reason}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.actor_label} · {formatLagosDateTime(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
