-- ============================================================================
-- TrophyBase Admin Web Push (Community Reports -> Android WebAPK / Desktop)
-- ============================================================================
-- Hinweis: Die privaten Schlüssel liegen verschlüsselt im Supabase Vault
-- (`vault.secrets`: `tb_vapid_public_key`, `tb_vapid_private_jwk`, `tb_push_webhook_secret`)
-- und dürfen NIEMALS im Klartext in Git eingecheckt werden.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS private;

-- Vault-Platzhalter (nur einmalig in der DB hinterlegen):
-- SELECT vault.create_secret('<VAPID_PUBLIC_KEY>', 'tb_vapid_public_key', 'TrophyBase Admin Web Push VAPID Public Key');
-- SELECT vault.create_secret('<VAPID_PRIVATE_JWK_JSON>', 'tb_vapid_private_jwk', 'TrophyBase Admin Web Push VAPID Private JWK');
-- SELECT vault.create_secret('<RANDOM_64_HEX_SECRET>', 'tb_push_webhook_secret', 'Shared secret pg_net -> admin-push-dispatch');

CREATE TABLE IF NOT EXISTS public.admin_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL CONSTRAINT admin_push_subscriptions_endpoint_key UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_label text NOT NULL DEFAULT 'Gerät',
  user_agent text,
  topics text[] NOT NULL DEFAULT ARRAY['community_reports']::text[],
  is_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_push_subscriptions_user_id
  ON public.admin_push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_admin_push_subscriptions_active_topics
  ON public.admin_push_subscriptions USING gin (topics)
  WHERE is_active = true;

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_push_subscriptions TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_push_subscriptions'
      AND policyname = 'admin_push_subscriptions_select'
  ) THEN
    CREATE POLICY admin_push_subscriptions_select
      ON public.admin_push_subscriptions
      FOR SELECT
      TO authenticated
      USING ((SELECT public.tb_is_admin()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_push_subscriptions'
      AND policyname = 'admin_push_subscriptions_insert'
  ) THEN
    CREATE POLICY admin_push_subscriptions_insert
      ON public.admin_push_subscriptions
      FOR INSERT
      TO authenticated
      WITH CHECK ((SELECT public.tb_is_admin()) AND (SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_push_subscriptions'
      AND policyname = 'admin_push_subscriptions_update'
  ) THEN
    CREATE POLICY admin_push_subscriptions_update
      ON public.admin_push_subscriptions
      FOR UPDATE
      TO authenticated
      USING ((SELECT public.tb_is_admin()))
      WITH CHECK ((SELECT public.tb_is_admin()) AND (SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_push_subscriptions'
      AND policyname = 'admin_push_subscriptions_delete'
  ) THEN
    CREATE POLICY admin_push_subscriptions_delete
      ON public.admin_push_subscriptions
      FOR DELETE
      TO authenticated
      USING ((SELECT public.tb_is_admin()));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.tb_admin_push_subscriptions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.admin_push_subscriptions'::regclass
      AND tgname = 'trg_admin_push_subscriptions_updated_at'
  ) THEN
    CREATE TRIGGER trg_admin_push_subscriptions_updated_at
      BEFORE UPDATE ON public.admin_push_subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION private.tb_admin_push_subscriptions_touch_updated_at();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.tb_notify_community_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  IF COALESCE(NEW.status, '') <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_push_subscriptions s
    WHERE s.is_active = true
      AND 'community_reports' = ANY(s.topics)
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT d.decrypted_secret
      INTO v_secret
    FROM vault.decrypted_secrets d
    WHERE d.name = 'tb_push_webhook_secret'
    LIMIT 1;

    IF v_secret IS NOT NULL AND pg_catalog.length(v_secret) > 0 THEN
      PERFORM net.http_post(
        url := 'https://vnwuelnvzhptjcsleuag.supabase.co/functions/v1/admin-push-dispatch',
        body := pg_catalog.jsonb_build_object(
          'event', 'community_report_created',
          'record', pg_catalog.jsonb_build_object(
            'id', NEW.id,
            'content_type', NEW.content_type,
            'content_key', NEW.content_key,
            'field_name', NEW.field_name,
            'display_key', NEW.display_key,
            'language_code', NEW.language_code,
            'spieltitel', NEW.spieltitel,
            'platform_game_id', NEW.platform_game_id,
            'suggested_text', pg_catalog.left(COALESCE(NEW.suggested_text, ''), 240),
            'created_at', NEW.created_at
          )
        ),
        params := '{}'::jsonb,
        headers := pg_catalog.jsonb_build_object(
          'Content-Type', 'application/json',
          'x-tb-webhook-secret', v_secret
        ),
        timeout_milliseconds := 5000
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tb_notify_community_report_insert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.community_reports'::regclass
      AND tgname = 'trg_community_reports_push_notify'
  ) THEN
    CREATE TRIGGER trg_community_reports_push_notify
      AFTER INSERT ON public.community_reports
      FOR EACH ROW
      EXECUTE FUNCTION private.tb_notify_community_report_insert();
  END IF;
END;
$$;
