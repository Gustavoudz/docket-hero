ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'convertido';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS converted_from_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profit_cents bigint;

CREATE OR REPLACE FUNCTION public.set_sale_profit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cost numeric;
  amount numeric;
BEGIN
  IF NEW.status = 'concluido' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    IF NEW.inventory_device_id IS NULL THEN
      RAISE EXCEPTION 'Não é possível concluir sem um aparelho vinculado ao estoque.';
    END IF;
    SELECT c.cost_price INTO cost FROM public.inventory_costs c WHERE c.item_id = NEW.inventory_device_id;
    amount := COALESCE(NEW.sale_amount, NEW.product_price, 0);
    NEW.profit_cents := round(amount * 100)::bigint - round(COALESCE(cost, 0) * 100)::bigint;
  ELSIF NEW.status <> 'concluido' THEN
    NEW.profit_cents := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_sale_profit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS appointments_set_profit ON public.appointments;
CREATE TRIGGER appointments_set_profit
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.set_sale_profit();

CREATE OR REPLACE FUNCTION public.sync_inventory_with_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  old_item uuid := CASE WHEN TG_OP = 'UPDATE' THEN OLD.inventory_device_id ELSE NULL END;
BEGIN
  IF NEW.status = 'concluido' AND NEW.inventory_device_id IS NULL THEN
    RAISE EXCEPTION 'Não é possível concluir sem um aparelho vinculado ao estoque.';
  END IF;

  IF old_item IS NOT NULL AND old_item IS DISTINCT FROM NEW.inventory_device_id THEN
    UPDATE public.inventory_items
      SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
      WHERE id = old_item AND status <> 'vendido';
  END IF;

  IF NEW.inventory_device_id IS NOT NULL THEN
    IF NEW.status IN ('legado', 'convertido') THEN
      UPDATE public.inventory_items
        SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
        WHERE id = NEW.inventory_device_id AND status = 'reservado';
    ELSIF NEW.status = 'cancelado' THEN
      UPDATE public.inventory_items
        SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
        WHERE id = NEW.inventory_device_id AND status <> 'vendido';
    ELSE
      UPDATE public.inventory_items
        SET status = 'reservado', appointment_id = NEW.id, sold_at = NULL
        WHERE id = NEW.inventory_device_id AND status <> 'vendido';
      UPDATE public.inventory_items
        SET appointment_id = NEW.id
        WHERE id = NEW.inventory_device_id AND status = 'vendido';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelado' AND (NEW.cancel_reason IS NULL OR btrim(NEW.cancel_reason) = '') THEN
    RAISE EXCEPTION 'É obrigatório informar o motivo do cancelamento';
  END IF;
  IF NEW.status = 'concluido' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  IF NEW.status NOT IN ('concluido', 'legado', 'convertido') THEN
    NEW.completed_at := NULL;
  END IF;
  IF NEW.status NOT IN ('cancelado', 'legado') THEN
    NEW.cancel_reason := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;