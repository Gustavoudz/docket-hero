CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY app_settings_write ON public.app_settings
  FOR ALL TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());

GRANT INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;

CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value) VALUES ('stale_days', '30')
  ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.log_inventory_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.inventory_events (item_id, appointment_id, actor_id, kind)
    VALUES (NEW.id, NEW.appointment_id, COALESCE(NEW.created_by, auth.uid()), 'cadastro');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'reservado' THEN
      k := 'reservado';
    ELSIF NEW.status = 'vendido' THEN
      k := 'vendido';
    ELSIF OLD.status = 'reservado' AND NEW.status = 'disponivel' THEN
      k := 'reserva_cancelada';
    ELSIF OLD.status = 'vendido' AND NEW.status = 'disponivel' THEN
      k := NULL; -- reversão registrada pela própria ação de reverter venda
    ELSE
      k := 'status_manual';
    END IF;

    IF k IS NOT NULL THEN
      INSERT INTO public.inventory_events (item_id, appointment_id, actor_id, kind, reason)
      VALUES (NEW.id, COALESCE(NEW.appointment_id, OLD.appointment_id), auth.uid(), k,
        CASE WHEN k = 'status_manual' THEN OLD.status::text || ' → ' || NEW.status::text ELSE NULL END);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_log ON public.inventory_items;
CREATE TRIGGER inventory_items_log AFTER INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.log_inventory_item_change();

CREATE OR REPLACE FUNCTION public.log_inventory_cost_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.cost_price IS NOT DISTINCT FROM OLD.cost_price THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.inventory_events (item_id, actor_id, kind, reason)
  VALUES (NEW.item_id, auth.uid(), 'custo',
    CASE WHEN TG_OP = 'UPDATE'
      THEN 'Custo alterado de ' || OLD.cost_price::text || ' para ' || NEW.cost_price::text
      ELSE 'Custo definido: ' || NEW.cost_price::text END);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_costs_log ON public.inventory_costs;
CREATE TRIGGER inventory_costs_log AFTER INSERT OR UPDATE ON public.inventory_costs
  FOR EACH ROW EXECUTE FUNCTION public.log_inventory_cost_change();