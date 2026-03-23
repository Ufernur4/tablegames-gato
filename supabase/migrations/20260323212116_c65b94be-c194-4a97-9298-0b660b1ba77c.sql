DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('developer', 'admin', 'moderator', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'developer')
      OR public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'moderator');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_role(_actor UUID, _target_role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_actor, 'developer')
    OR (
      public.has_role(_actor, 'admin')
      AND _target_role IN ('moderator', 'user')
    );
$$;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Privileged users can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Privileged users can assign roles" ON public.user_roles;
DROP POLICY IF EXISTS "Privileged users can remove roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

CREATE POLICY "Privileged users can assign roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_role(auth.uid(), role));

CREATE POLICY "Privileged users can remove roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.can_manage_role(auth.uid(), role));

CREATE OR REPLACE FUNCTION public.assign_default_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_assign_role ON public.profiles;
CREATE TRIGGER on_profile_created_assign_role
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.assign_default_user_role();

CREATE OR REPLACE FUNCTION public.claim_developer_role()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_dev BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'developer') INTO has_dev;

  IF has_dev THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (auth.uid(), 'developer', auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN TRUE;
END;
$$;

CREATE TABLE IF NOT EXISTS public.banned_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  banned_by UUID NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_banned_users_user_id ON public.banned_users (user_id);
CREATE INDEX IF NOT EXISTS idx_banned_users_active_expires ON public.banned_users (active, expires_at);

CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.banned_users
    WHERE user_id = _user_id
      AND active = TRUE
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_banning_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(NEW.user_id, 'developer') OR public.has_role(NEW.user_id, 'admin') THEN
    RAISE EXCEPTION 'Dieser Nutzer kann nicht gesperrt werden.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_ban_target ON public.banned_users;
CREATE TRIGGER validate_ban_target
BEFORE INSERT OR UPDATE ON public.banned_users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_banning_staff();

DROP TRIGGER IF EXISTS update_banned_users_updated_at ON public.banned_users;
CREATE TRIGGER update_banned_users_updated_at
BEFORE UPDATE ON public.banned_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Users can view own ban status" ON public.banned_users;
DROP POLICY IF EXISTS "Staff can manage bans" ON public.banned_users;
DROP POLICY IF EXISTS "Staff can update bans" ON public.banned_users;
DROP POLICY IF EXISTS "Staff can delete bans" ON public.banned_users;

CREATE POLICY "Users can view own ban status"
ON public.banned_users
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

CREATE POLICY "Staff can create bans"
ON public.banned_users
FOR INSERT
TO authenticated
WITH CHECK (public.is_staff(auth.uid()) AND auth.uid() = banned_by);

CREATE POLICY "Staff can update bans"
ON public.banned_users
FOR UPDATE
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete bans"
ON public.banned_users
FOR DELETE
TO authenticated
USING (public.is_staff(auth.uid()));