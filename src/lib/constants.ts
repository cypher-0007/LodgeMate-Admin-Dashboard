/**
 * Immutable LodgeMate Moderation Policy Threshold.
 * An account becomes eligible for manual suspension/ban review ONLY upon reaching
 * THREE distinct reporting users (excluding dismissed reports).
 * Never auto-bans and cannot be modified from the dashboard UI.
 */
export const MODERATION_REPORT_THRESHOLD = 3 as const;

export const SHARED_ADMIN_ACTOR_LABEL = "LodgeMate Shared Admin" as const;

export const LAGOS_TIMEZONE = "Africa/Lagos" as const;

export const NOTIFICATION_EVENTS = [
  {
    key: "new_report",
    label: "New user or listing reports",
    description: "Alert whenever a student, agent, landlord, or listing is reported.",
  },
  {
    key: "three_reports_threshold",
    label: "Account reaches 3 distinct reporters",
    description: "High-priority alert when an account becomes eligible for manual moderation review.",
  },
  {
    key: "new_verification",
    label: "New verification submissions",
    description: "Alert when a student, agent, or landlord submits verification documents.",
  },
  {
    key: "successful_payment",
    label: "Verified successful payments",
    description: "Alert when a verified payment pass or fee is recorded.",
  },
  {
    key: "payment_exception",
    label: "Payment exceptions & failures",
    description: "Alert when a checkout verification fails or enters an error state.",
  },
  {
    key: "new_complaint",
    label: "New LodgeMate feedback & complaints",
    description: "Alert when a user submits a platform bug, payment issue, or complaint.",
  },
  {
    key: "new_listing",
    label: "New accommodation listings",
    description: "Alert when a new lodge, bedspace, or takeover listing is submitted.",
  },
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number]["key"];

export const FEEDBACK_CATEGORIES = [
  { value: "technical_problem", label: "Technical Problem" },
  { value: "app_bug", label: "App Bug" },
  { value: "payment_problem", label: "Payment Problem" },
  { value: "account_problem", label: "Account Problem" },
  { value: "suggestion", label: "Suggestion" },
  { value: "general_complaint", label: "General Complaint" },
  { value: "other", label: "Other" },
] as const;

export const REPORT_STATUSES = [
  { value: "new", label: "New" },
  { value: "under_review", label: "Under Review" },
  { value: "dismissed", label: "Dismissed" },
  { value: "action_taken", label: "Action Taken" },
] as const;
