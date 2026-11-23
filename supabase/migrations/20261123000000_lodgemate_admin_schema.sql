-- ==============================================================================
-- Migration: LodgeMate Admin (lodgemateadmin) Schema Extensions & Security
-- Project:   Existing LodgeMate Supabase Project (ghazkfgexrwkbzpqbqyg)
--
-- DESIGN PRINCIPLES:
-- 1. 100% Idempotent & Non-Breaking — safe to run against existing production.
-- 2. Reuses existing auth.users, profiles, user_roles, listings, reports,
--    beta_access_passes, beta_pending_payments, beta_lodges_config.
-- 3. Enforces strict RLS so ordinary users (students, agents, landlords) can
--    NEVER grant themselves admin access, approve their own verifications,
--    manipulate report counts or payments, or read/edit private admin tables.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. NON-BREAKING EXTENSIONS TO EXISTING TABLES
-- ------------------------------------------------------------------------------

-- 1a. Extend public.profiles with moderation lifecycle & soft-delete support
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'warned', 'suspended', 'banned')),
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Ensure existing banned rows reflect account_status = 'banned'
UPDATE public.profiles
SET account_status = 'banned'
WHERE banned = true AND account_status = 'active';

-- Protect privileged profile columns from self-modification by ordinary users
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role (auth.uid() IS NULL) and authorised admins
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    -- Keep legacy `banned` boolean synchronized with `account_status`
    IF NEW.account_status IN ('suspended', 'banned') THEN
      NEW.banned := true;
    ELSIF NEW.account_status IN ('active', 'warned') AND OLD.account_status IN ('suspended', 'banned') THEN
      NEW.banned := false;
    END IF;
    RETURN NEW;
  END IF;

  -- Ordinary users cannot alter verified, banned, account_status, suspended_until, moderation_reason, or deleted_at
  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.banned IS DISTINCT FROM OLD.banned
     OR NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.suspended_until IS DISTINCT FROM OLD.suspended_until
     OR NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Unauthorized modification of protected account fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged_fields ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileged_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 1b. Extend public.listings with optional moderation metadata
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS moderation_note text,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz;

-- 1c. Extend public.reports for Users (Students, Agents, Landlords) & Listings
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'listing'
    CHECK (target_type IN ('student', 'agent', 'landlord', 'listing')),
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS evidence_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill target_user_id for existing listing reports from listings.owner_id
UPDATE public.reports r
SET target_user_id = l.owner_id
FROM public.listings l
WHERE r.listing_id = l.id AND r.target_user_id IS NULL;

-- Prevent duplicate active reports from the SAME reporter against the SAME target
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_active_reporter_user
  ON public.reports (reporter_id, target_user_id)
  WHERE target_user_id IS NOT NULL
    AND target_type <> 'listing'
    AND status IN ('new', 'under_review', 'open');

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_active_reporter_listing
  ON public.reports (reporter_id, listing_id)
  WHERE listing_id IS NOT NULL
    AND status IN ('new', 'under_review', 'open');

CREATE INDEX IF NOT EXISTS idx_reports_target_user ON public.reports (target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_listing ON public.reports (listing_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON public.reports (status, created_at DESC);

DROP TRIGGER IF EXISTS reports_updated_at ON public.reports;
CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1d. Extend public.beta_access_passes for financial accuracy & test-mode exclusion
ALTER TABLE public.beta_access_passes
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_purpose text NOT NULL DEFAULT 'beta_lodges_pass',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz NOT NULL DEFAULT now();

UPDATE public.beta_access_passes
SET verified_at = created_at
WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_beta_access_passes_verified_at
  ON public.beta_access_passes (verified_at DESC)
  WHERE is_test = false;

-- ------------------------------------------------------------------------------
-- 2. THREE-DISTINCT-REPORTER MODERATION VIEW & ACTIONS TABLE
-- ------------------------------------------------------------------------------

-- Actionable distinct reporter count per target user (excludes dismissed reports).
-- Threshold is strictly locked at 3 distinct reporters. Never auto-bans.
CREATE OR REPLACE VIEW public.moderation_target_summary AS
SELECT
  target_user_id,
  COUNT(DISTINCT reporter_id)::integer AS distinct_reporter_count,
  COUNT(*)::integer AS active_report_count,
  (COUNT(DISTINCT reporter_id) >= 3) AS moderation_eligible,
  MAX(created_at) AS latest_report_at
FROM public.reports
WHERE target_user_id IS NOT NULL
  AND status <> 'dismissed'
GROUP BY target_user_id;

REVOKE ALL ON public.moderation_target_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.moderation_target_summary TO service_role;

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('dismiss', 'warn', 'suspend', 'ban', 'restore', 'soft_delete')),
  reason text NOT NULL,
  distinct_reporter_count_at_action integer NOT NULL DEFAULT 0,
  previous_status text,
  resulting_status text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text NOT NULL DEFAULT 'LodgeMate Shared Admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_actions_target ON public.moderation_actions (target_user_id, created_at DESC);

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.moderation_actions TO authenticated;
GRANT ALL ON public.moderation_actions TO service_role;

DROP POLICY IF EXISTS "moderation_actions_read_admin" ON public.moderation_actions;
CREATE POLICY "moderation_actions_read_admin" ON public.moderation_actions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------------------
-- 3. ACCOUNT VERIFICATION TABLES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.verification_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type text NOT NULL CHECK (account_type IN ('student', 'agent', 'landlord')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'info_requested', 'resubmission_requested')),
  document_paths text[] NOT NULL DEFAULT '{}',
  submitted_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_submissions_status
  ON public.verification_submissions (account_type, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_submissions_user
  ON public.verification_submissions (user_id, submitted_at DESC);

ALTER TABLE public.verification_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verification_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.verification_submissions TO authenticated;
GRANT ALL ON public.verification_submissions TO service_role;

DROP POLICY IF EXISTS "verification_read_own_or_admin" ON public.verification_submissions;
CREATE POLICY "verification_read_own_or_admin" ON public.verification_submissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "verification_insert_own_pending" ON public.verification_submissions;
CREATE POLICY "verification_insert_own_pending" ON public.verification_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP TRIGGER IF EXISTS verification_submissions_updated_at ON public.verification_submissions;
CREATE TRIGGER verification_submissions_updated_at
  BEFORE UPDATE ON public.verification_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.verification_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.verification_submissions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'info_requested', 'resubmission_requested')),
  reason text,
  notes text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text NOT NULL DEFAULT 'LodgeMate Shared Admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_decisions_user
  ON public.verification_decisions (user_id, created_at DESC);

ALTER TABLE public.verification_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verification_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.verification_decisions TO authenticated;
GRANT ALL ON public.verification_decisions TO service_role;

DROP POLICY IF EXISTS "verification_decisions_read_own_or_admin" ON public.verification_decisions;
CREATE POLICY "verification_decisions_read_own_or_admin" ON public.verification_decisions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------------------
-- 4. PAYMENT REFUNDS TABLE (SEPARATE FROM VERIFIED GROSS REVENUE)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference text NOT NULL REFERENCES public.beta_access_passes(payment_reference) ON DELETE RESTRICT,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_ngn integer NOT NULL CHECK (amount_ngn > 0),
  currency text NOT NULL DEFAULT 'NGN',
  reason text NOT NULL,
  provider_refund_id text,
  refunded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_refunded_at ON public.payment_refunds (refunded_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_reference ON public.payment_refunds (payment_reference);

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_refunds TO authenticated;
GRANT ALL ON public.payment_refunds TO service_role;

DROP POLICY IF EXISTS "payment_refunds_read_admin" ON public.payment_refunds;
CREATE POLICY "payment_refunds_read_admin" ON public.payment_refunds
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------------------
-- 5. LODGEMATE PLATFORM FEEDBACK & COMPLAINTS (SEPARATE FROM USER REPORTS)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text,
  sender_email text,
  account_type text CHECK (account_type IN ('student', 'agent', 'landlord', 'guest')),
  category text NOT NULL DEFAULT 'general_complaint'
    CHECK (category IN (
      'technical_problem',
      'app_bug',
      'payment_problem',
      'account_problem',
      'suggestion',
      'general_complaint',
      'other'
    )),
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved')),
  internal_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_feedback_status ON public.platform_feedback (status, created_at DESC);

ALTER TABLE public.platform_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_feedback FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.platform_feedback TO anon, authenticated;
GRANT SELECT ON public.platform_feedback TO authenticated;
GRANT ALL ON public.platform_feedback TO service_role;

DROP POLICY IF EXISTS "platform_feedback_insert_public" ON public.platform_feedback;
CREATE POLICY "platform_feedback_insert_public" ON public.platform_feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'open' AND internal_notes IS NULL);

DROP POLICY IF EXISTS "platform_feedback_read_admin" ON public.platform_feedback;
CREATE POLICY "platform_feedback_read_admin" ON public.platform_feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS platform_feedback_updated_at ON public.platform_feedback;
CREATE TRIGGER platform_feedback_updated_at
  BEFORE UPDATE ON public.platform_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 6. IMMUTABLE ADMIN ACTIVITY LOGS (APPEND-ONLY)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text NOT NULL DEFAULT 'LodgeMate Shared Admin',
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  previous_state jsonb,
  resulting_state jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created ON public.admin_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_action ON public.admin_activity_logs (action, created_at DESC);

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_activity_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_activity_logs TO authenticated;
GRANT ALL ON public.admin_activity_logs TO service_role;

-- Admin can ONLY read logs via authenticated client; inserts happen exclusively via server service_role.
-- No UPDATE or DELETE policies exist.
DROP POLICY IF EXISTS "admin_activity_logs_read_admin" ON public.admin_activity_logs;
CREATE POLICY "admin_activity_logs_read_admin" ON public.admin_activity_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------------------
-- 7. ADMIN NOTIFICATIONS, PREFERENCES & WEB PUSH SUBSCRIPTIONS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'new_report',
    'three_reports_threshold',
    'new_verification',
    'successful_payment',
    'payment_exception',
    'new_complaint',
    'new_listing'
  )),
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  target_url text NOT NULL DEFAULT '/',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text UNIQUE,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON public.admin_notifications (is_read, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

DROP POLICY IF EXISTS "admin_notifications_read_admin" ON public.admin_notifications;
CREATE POLICY "admin_notifications_read_admin" ON public.admin_notifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_notifications_update_admin" ON public.admin_notifications;
CREATE POLICY "admin_notifications_update_admin" ON public.admin_notifications
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.admin_notification_preferences (
  id text PRIMARY KEY CHECK (id = 'default') DEFAULT 'default',
  in_app_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  events jsonb NOT NULL DEFAULT '{
    "new_report": true,
    "three_reports_threshold": true,
    "new_verification": true,
    "successful_payment": true,
    "payment_exception": true,
    "new_complaint": true,
    "new_listing": true
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_notification_preferences (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_notification_preferences TO authenticated;
GRANT ALL ON public.admin_notification_preferences TO service_role;

DROP POLICY IF EXISTS "admin_notif_prefs_read_admin" ON public.admin_notification_preferences;
CREATE POLICY "admin_notif_prefs_read_admin" ON public.admin_notification_preferences
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.admin_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_push_subscriptions TO authenticated;
GRANT ALL ON public.admin_push_subscriptions TO service_role;

DROP POLICY IF EXISTS "admin_push_subs_read_admin" ON public.admin_push_subscriptions;
CREATE POLICY "admin_push_subs_read_admin" ON public.admin_push_subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable Supabase Realtime for live in-dashboard notification bell
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 8. REALTIME EVENT TRIGGERS FOR ADMIN NOTIFICATIONS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_admin_on_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  distinct_count integer := 0;
BEGIN
  INSERT INTO public.admin_notifications (event_type, title, body, severity, target_url, dedupe_key, metadata)
  VALUES (
    'new_report',
    'New user report submitted',
    LEFT(COALESCE(NEW.reason, 'A new report awaits review'), 140),
    'warning',
    '/reports?id=' || NEW.id::text,
    'report:' || NEW.id::text,
    jsonb_build_object('report_id', NEW.id, 'target_type', NEW.target_type, 'target_user_id', NEW.target_user_id)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  -- Check Three-Distinct-Reporter threshold (never auto-bans)
  IF NEW.target_user_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT reporter_id)::integer INTO distinct_count
    FROM public.reports
    WHERE target_user_id = NEW.target_user_id
      AND status <> 'dismissed';

    IF distinct_count >= 3 THEN
      INSERT INTO public.admin_notifications (event_type, title, body, severity, target_url, dedupe_key, metadata)
      VALUES (
        'three_reports_threshold',
        'Account reached 3 distinct reporters',
        'An account has reached ' || distinct_count || ' distinct reporters and is eligible for manual moderation review.',
        'critical',
        '/reports?eligible=true&target=' || NEW.target_user_id::text,
        'threshold3:' || NEW.target_user_id::text || ':' || distinct_count::text,
        jsonb_build_object('target_user_id', NEW.target_user_id, 'distinct_reporters', distinct_count)
      )
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_on_report ON public.reports;
CREATE TRIGGER trg_notify_admin_on_report
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_report();

CREATE OR REPLACE FUNCTION public.notify_admin_on_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (event_type, title, body, severity, target_url, dedupe_key, metadata)
  VALUES (
    'new_verification',
    'New ' || NEW.account_type || ' verification submission',
    'A ' || NEW.account_type || ' submitted documents for account verification.',
    'info',
    '/verifications?tab=' || NEW.account_type,
    'verification:' || NEW.id::text,
    jsonb_build_object('submission_id', NEW.id, 'user_id', NEW.user_id, 'account_type', NEW.account_type)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_on_verification ON public.verification_submissions;
CREATE TRIGGER trg_notify_admin_on_verification
  AFTER INSERT ON public.verification_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_verification();

CREATE OR REPLACE FUNCTION public.notify_admin_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_test = false THEN
    INSERT INTO public.admin_notifications (event_type, title, body, severity, target_url, dedupe_key, metadata)
    VALUES (
      'successful_payment',
      'Verified payment received (₦' || NEW.amount_paid::text || ')',
      'Ref ' || NEW.payment_reference || ' via ' || NEW.payment_provider || '.',
      'info',
      '/payments?ref=' || NEW.payment_reference,
      'payment:' || NEW.payment_reference,
      jsonb_build_object('payment_reference', NEW.payment_reference, 'amount', NEW.amount_paid)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_on_payment ON public.beta_access_passes;
CREATE TRIGGER trg_notify_admin_on_payment
  AFTER INSERT ON public.beta_access_passes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_payment();

CREATE OR REPLACE FUNCTION public.notify_admin_on_payment_exception()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'failed' AND (OLD.status IS DISTINCT FROM 'failed') THEN
    INSERT INTO public.admin_notifications (event_type, title, body, severity, target_url, dedupe_key, metadata)
    VALUES (
      'payment_exception',
      'Payment verification exception',
      'Checkout ' || NEW.payment_reference || ' entered failed state.',
      'warning',
      '/payments?status=failed',
      'payment_fail:' || NEW.payment_reference,
      jsonb_build_object('payment_reference', NEW.payment_reference)
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_on_payment_exception ON public.beta_pending_payments;
CREATE TRIGGER trg_notify_admin_on_payment_exception
  AFTER UPDATE ON public.beta_pending_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_payment_exception();

CREATE OR REPLACE FUNCTION public.notify_admin_on_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (event_type, title, body, severity, target_url, dedupe_key, metadata)
  VALUES (
    'new_complaint',
    'New platform feedback: ' || LEFT(NEW.subject, 80),
    LEFT(NEW.message, 140),
    'info',
    '/feedback?id=' || NEW.id::text,
    'feedback:' || NEW.id::text,
    jsonb_build_object('feedback_id', NEW.id, 'category', NEW.category)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_on_feedback ON public.platform_feedback;
CREATE TRIGGER trg_notify_admin_on_feedback
  AFTER INSERT ON public.platform_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_feedback();

CREATE OR REPLACE FUNCTION public.notify_admin_on_listing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (event_type, title, body, severity, target_url, dedupe_key, metadata)
  VALUES (
    'new_listing',
    'New accommodation listing submitted',
    LEFT(NEW.title || ' (' || NEW.school || ' · ' || NEW.area || ')', 140),
    'info',
    '/listings?id=' || NEW.id::text,
    'listing:' || NEW.id::text,
    jsonb_build_object('listing_id', NEW.id, 'school', NEW.school)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_on_listing ON public.listings;
CREATE TRIGGER trg_notify_admin_on_listing
  AFTER INSERT ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_listing();

-- ------------------------------------------------------------------------------
-- 9. PRIVATE STORAGE BUCKETS FOR VERIFICATION DOCUMENTS & REPORT EVIDENCE
-- ------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('verification-documents', 'verification-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('report-evidence', 'report-evidence', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "verification_docs_upload_own" ON storage.objects;
CREATE POLICY "verification_docs_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "verification_docs_read_admin" ON storage.objects;
CREATE POLICY "verification_docs_read_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-documents'
    AND (public.has_role(auth.uid(), 'admin') OR (storage.foldername(name))[1] = auth.uid()::text)
  );

DROP POLICY IF EXISTS "report_evidence_upload_own" ON storage.objects;
CREATE POLICY "report_evidence_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'report-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "report_evidence_read_admin" ON storage.objects;
CREATE POLICY "report_evidence_read_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'report-evidence'
    AND (public.has_role(auth.uid(), 'admin') OR (storage.foldername(name))[1] = auth.uid()::text)
  );
