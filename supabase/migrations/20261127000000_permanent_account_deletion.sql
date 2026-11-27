-- Reserve emails after permanent account deletion and reject reuse at Auth signup.
CREATE TABLE IF NOT EXISTS public.reserved_account_emails (
  email text PRIMARY KEY,
  deleted_user_id uuid NOT NULL,
  reason text NOT NULL,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reserved_account_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reserved_account_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reserved_account_emails TO service_role;

CREATE OR REPLACE FUNCTION public.reject_reserved_account_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reserved_account_emails r
    WHERE r.email = lower(trim(NEW.email))
  ) THEN
    RAISE EXCEPTION 'This email address cannot be used to create an account.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_reserved_account_email ON auth.users;
CREATE TRIGGER reject_reserved_account_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.reject_reserved_account_email();
