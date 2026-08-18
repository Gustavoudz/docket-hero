-- Device models
CREATE TABLE public.device_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.device_models TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.device_models TO authenticated;
GRANT ALL ON public.device_models TO service_role;
ALTER TABLE public.device_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_models_select ON public.device_models FOR SELECT TO authenticated USING (true);
CREATE POLICY device_models_write ON public.device_models FOR ALL TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());

-- Cancel reasons
CREATE TABLE public.cancel_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cancel_reasons TO authenticated;
GRANT ALL ON public.cancel_reasons TO service_role;
ALTER TABLE public.cancel_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY cancel_reasons_select ON public.cancel_reasons FOR SELECT TO authenticated USING (true);
CREATE POLICY cancel_reasons_write ON public.cancel_reasons FOR ALL TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());

-- Appointment tags
CREATE TABLE public.appointment_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  color text NOT NULL DEFAULT '#d92b4b',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_tags TO authenticated;
GRANT ALL ON public.appointment_tags TO service_role;
ALTER TABLE public.appointment_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointment_tags_select ON public.appointment_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY appointment_tags_write ON public.appointment_tags FOR ALL TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());

-- Status colors (single row config)
CREATE TABLE public.status_colors (
  status public.appointment_status PRIMARY KEY,
  color text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.status_colors TO authenticated;
GRANT ALL ON public.status_colors TO service_role;
ALTER TABLE public.status_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY status_colors_select ON public.status_colors FOR SELECT TO authenticated USING (true);
CREATE POLICY status_colors_write ON public.status_colors FOR ALL TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());

-- Attendant colors
CREATE TABLE public.attendant_colors (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  color text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendant_colors TO authenticated;
GRANT ALL ON public.attendant_colors TO service_role;
ALTER TABLE public.attendant_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendant_colors_select ON public.attendant_colors FOR SELECT TO authenticated USING (true);
CREATE POLICY attendant_colors_write ON public.attendant_colors FOR ALL TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());

-- Tag on appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS tag text;

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER device_models_updated_at BEFORE UPDATE ON public.device_models FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cancel_reasons_updated_at BEFORE UPDATE ON public.cancel_reasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER appointment_tags_updated_at BEFORE UPDATE ON public.appointment_tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seeds
INSERT INTO public.status_colors (status, color) VALUES
  ('pendente', '#f59e0b'), ('concluido', '#22c55e'), ('cancelado', '#ef4444');
INSERT INTO public.cancel_reasons (label, sort_order) VALUES
  ('Cliente desistiu', 1), ('Cartão não passou', 2), ('Achou caro', 3), ('Não compareceu', 4);
INSERT INTO public.appointment_tags (label, color, sort_order) VALUES
  ('Cliente VIP', '#eab308', 1), ('Troca de aparelho', '#38bdf8', 2), ('Retorno', '#a78bfa', 3);
INSERT INTO public.device_models (name, sort_order) VALUES
  ('iPhone 11 64GB', 1), ('iPhone 12 128GB', 2), ('iPhone 13 128GB', 3), ('iPhone 14 128GB', 4),
  ('iPhone 15 128GB', 5), ('MacBook Air M1', 6), ('MacBook Air M2', 7), ('MacBook Pro M1 Pro', 8);