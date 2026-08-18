-- ENUM
CREATE TYPE public.inventory_status AS ENUM ('disponivel','reservado','vendido','manutencao');

-- ITEMS (sem valor de custo: custo fica em tabela separada, visível só ao gerente)
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_model text NOT NULL,
  color text,
  storage text,
  apple_id text NOT NULL UNIQUE,
  serial_number text,
  sale_price numeric,
  notes text,
  status public.inventory_status NOT NULL DEFAULT 'disponivel',
  entered_at date NOT NULL DEFAULT CURRENT_DATE,
  sold_at timestamptz,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_items_select ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY inventory_items_insert ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY inventory_items_update ON public.inventory_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY inventory_items_delete ON public.inventory_items FOR DELETE TO authenticated USING (public.is_gerente());
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CUSTO (somente gerente lê)
CREATE TABLE public.inventory_costs (
  item_id uuid PRIMARY KEY REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  cost_price numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_costs TO authenticated;
GRANT ALL ON public.inventory_costs TO service_role;
ALTER TABLE public.inventory_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_costs_select ON public.inventory_costs FOR SELECT TO authenticated USING (public.is_gerente());
CREATE POLICY inventory_costs_insert ON public.inventory_costs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY inventory_costs_update ON public.inventory_costs FOR UPDATE TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());
CREATE POLICY inventory_costs_delete ON public.inventory_costs FOR DELETE TO authenticated USING (public.is_gerente());

-- HISTÓRICO DE MOVIMENTOS
CREATE TABLE public.inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  appointment_id uuid,
  actor_id uuid,
  kind text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.inventory_events TO authenticated;
GRANT ALL ON public.inventory_events TO service_role;
ALTER TABLE public.inventory_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_events_select ON public.inventory_events FOR SELECT TO authenticated USING (true);
CREATE POLICY inventory_events_insert ON public.inventory_events FOR INSERT TO authenticated WITH CHECK (true);

-- CONFERÊNCIA DIÁRIA
CREATE TABLE public.inventory_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date date NOT NULL UNIQUE,
  confirmed_by uuid,
  matched boolean NOT NULL DEFAULT true,
  divergence_note text,
  items_count integer NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.inventory_audits TO authenticated;
GRANT ALL ON public.inventory_audits TO service_role;
ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_audits_select ON public.inventory_audits FOR SELECT TO authenticated USING (public.is_gerente());
CREATE POLICY inventory_audits_insert ON public.inventory_audits FOR INSERT TO authenticated WITH CHECK (public.is_gerente());
CREATE POLICY inventory_audits_update ON public.inventory_audits FOR UPDATE TO authenticated USING (public.is_gerente()) WITH CHECK (public.is_gerente());

-- SINCRONIZAÇÃO AGENDAMENTO <-> ESTOQUE
CREATE OR REPLACE FUNCTION public.sync_inventory_with_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_item uuid := CASE WHEN TG_OP = 'UPDATE' THEN OLD.inventory_device_id ELSE NULL END;
BEGIN
  IF NEW.status = 'concluido' AND NEW.inventory_device_id IS NULL THEN
    RAISE EXCEPTION 'Vincule um aparelho do estoque antes de concluir a venda';
  END IF;

  -- item trocado ou removido: libera o antigo (se não vendido)
  IF old_item IS NOT NULL AND old_item IS DISTINCT FROM NEW.inventory_device_id THEN
    UPDATE public.inventory_items
      SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
      WHERE id = old_item AND status <> 'vendido';
  END IF;

  IF NEW.inventory_device_id IS NOT NULL THEN
    IF NEW.status = 'concluido' THEN
      UPDATE public.inventory_items
        SET status = 'vendido', appointment_id = NEW.id, sold_at = COALESCE(sold_at, now())
        WHERE id = NEW.inventory_device_id;
    ELSIF NEW.status = 'cancelado' THEN
      UPDATE public.inventory_items
        SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
        WHERE id = NEW.inventory_device_id;
    ELSE
      UPDATE public.inventory_items
        SET status = 'reservado', appointment_id = NEW.id, sold_at = NULL
        WHERE id = NEW.inventory_device_id AND status <> 'vendido';
      UPDATE public.inventory_items
        SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
        WHERE id = NEW.inventory_device_id AND status = 'vendido';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_inventory_with_appointment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER appointments_sync_inventory
AFTER INSERT OR UPDATE OF status, inventory_device_id ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_with_appointment();