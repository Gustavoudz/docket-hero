CREATE TABLE public.trade_in_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_value numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_in_models TO authenticated;
GRANT ALL ON public.trade_in_models TO service_role;
ALTER TABLE public.trade_in_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY trade_in_models_select ON public.trade_in_models FOR SELECT TO authenticated USING (true);
CREATE POLICY trade_in_models_write ON public.trade_in_models FOR ALL TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());
CREATE TRIGGER trade_in_models_updated_at BEFORE UPDATE ON public.trade_in_models FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.trade_in_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  discount numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_in_defects TO authenticated;
GRANT ALL ON public.trade_in_defects TO service_role;
ALTER TABLE public.trade_in_defects ENABLE ROW LEVEL SECURITY;
CREATE POLICY trade_in_defects_select ON public.trade_in_defects FOR SELECT TO authenticated USING (true);
CREATE POLICY trade_in_defects_write ON public.trade_in_defects FOR ALL TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());
CREATE TRIGGER trade_in_defects_updated_at BEFORE UPDATE ON public.trade_in_defects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.trade_in_defects (label, discount, sort_order) VALUES
  ('Tela trincada', 400, 1),
  ('Bateria abaixo de 80%', 250, 2),
  ('Sem carregador', 80, 3),
  ('Carcaça amassada', 150, 4),
  ('Face ID não funciona', 300, 5);