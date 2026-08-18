-- roles
CREATE TYPE public.app_role AS ENUM ('gerente','atendente');
CREATE TYPE public.appointment_status AS ENUM ('pendente','concluido','cancelado');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_gerente()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'gerente');
$$;

CREATE POLICY "profiles_select_self_or_gerente" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_gerente());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "user_roles_select_self_or_gerente" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_gerente());

-- appointments
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text,
  device_model text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  scheduled_date date GENERATED ALWAYS AS ((scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) STORED,
  deposit_paid boolean NOT NULL DEFAULT false,
  notes text,
  status public.appointment_status NOT NULL DEFAULT 'pendente',
  cancel_reason text,
  completed_at timestamptz,
  -- ganchos para módulos futuros
  inventory_device_id uuid,
  device_serial_number text,
  sale_id uuid,
  sale_amount numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_date_idx ON public.appointments (scheduled_date);
CREATE INDEX appointments_attendant_idx ON public.appointments (attendant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_select" ON public.appointments FOR SELECT TO authenticated
  USING (attendant_id = auth.uid() OR public.is_gerente());
CREATE POLICY "appointments_insert" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (attendant_id = auth.uid());
CREATE POLICY "appointments_update" ON public.appointments FOR UPDATE TO authenticated
  USING (attendant_id = auth.uid() OR public.is_gerente())
  WITH CHECK (attendant_id = auth.uid() OR public.is_gerente());
CREATE POLICY "appointments_delete" ON public.appointments FOR DELETE TO authenticated
  USING (attendant_id = auth.uid() OR public.is_gerente());

-- validação: cancelamento exige motivo
CREATE OR REPLACE FUNCTION public.validate_appointment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelado' AND (NEW.cancel_reason IS NULL OR btrim(NEW.cancel_reason) = '') THEN
    RAISE EXCEPTION 'É obrigatório informar o motivo do cancelamento';
  END IF;
  IF NEW.status = 'concluido' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  IF NEW.status <> 'concluido' THEN
    NEW.completed_at := NULL;
  END IF;
  IF NEW.status <> 'cancelado' THEN
    NEW.cancel_reason := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER appointments_validate BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.validate_appointment();

-- fechamentos de dia
CREATE TABLE public.day_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  closure_date date NOT NULL,
  total_appointments int NOT NULL DEFAULT 0,
  completed_count int NOT NULL DEFAULT 0,
  cancelled_count int NOT NULL DEFAULT 0,
  conversion_rate numeric(5,2) NOT NULL DEFAULT 0,
  cancel_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  closed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attendant_id, closure_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_closures TO authenticated;
GRANT ALL ON public.day_closures TO service_role;
ALTER TABLE public.day_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "day_closures_select" ON public.day_closures FOR SELECT TO authenticated
  USING (attendant_id = auth.uid() OR public.is_gerente());
CREATE POLICY "day_closures_insert" ON public.day_closures FOR INSERT TO authenticated
  WITH CHECK (attendant_id = auth.uid());
CREATE POLICY "day_closures_update" ON public.day_closures FOR UPDATE TO authenticated
  USING (attendant_id = auth.uid() OR public.is_gerente())
  WITH CHECK (attendant_id = auth.uid() OR public.is_gerente());

-- notificações (para gerentes)
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  actor_id uuid,
  kind text NOT NULL,
  message text NOT NULL,
  read_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_created_idx ON public.notifications (created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_gerente" ON public.notifications FOR SELECT TO authenticated
  USING (public.is_gerente());
CREATE POLICY "notifications_update_gerente" ON public.notifications FOR UPDATE TO authenticated
  USING (public.is_gerente()) WITH CHECK (public.is_gerente());

CREATE OR REPLACE FUNCTION public.notify_appointment_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  who text;
BEGIN
  SELECT COALESCE(NULLIF(full_name,''), email, 'Atendente') INTO who FROM public.profiles WHERE id = NEW.attendant_id;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (appointment_id, actor_id, kind, message)
    VALUES (NEW.id, NEW.attendant_id, 'criado',
      COALESCE(who,'Atendente') || ' criou um agendamento para ' || NEW.customer_name || ' (' || NEW.device_model || ')');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'concluido' AND OLD.status <> 'concluido' THEN
    INSERT INTO public.notifications (appointment_id, actor_id, kind, message)
    VALUES (NEW.id, NEW.attendant_id, 'concluido',
      'Venda fechada: ' || NEW.customer_name || ' (' || NEW.device_model || ') por ' || COALESCE(who,'Atendente'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER appointments_notify AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.notify_appointment_event();

-- criação automática de perfil + papel no cadastro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  desired public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'gerente') THEN
    desired := 'gerente';
  ELSIF NEW.raw_user_meta_data->>'role' = 'gerente' THEN
    desired := 'gerente';
  ELSE
    desired := 'atendente';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, desired)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();