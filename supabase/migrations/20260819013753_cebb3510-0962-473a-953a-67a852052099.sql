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
  IF NEW.status NOT IN ('concluido', 'legado') THEN
    NEW.completed_at := NULL;
  END IF;
  IF NEW.status NOT IN ('cancelado', 'legado') THEN
    NEW.cancel_reason := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

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
    RAISE EXCEPTION 'Vincule um aparelho do estoque antes de concluir a venda';
  END IF;

  IF old_item IS NOT NULL AND old_item IS DISTINCT FROM NEW.inventory_device_id THEN
    UPDATE public.inventory_items
      SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
      WHERE id = old_item AND status <> 'vendido';
  END IF;

  IF NEW.inventory_device_id IS NOT NULL THEN
    IF NEW.status = 'legado' THEN
      -- exclusão suave: aparelho apenas reservado volta para disponível
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

REVOKE ALL ON FUNCTION public.sync_inventory_with_appointment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_appointment() FROM PUBLIC, anon, authenticated;