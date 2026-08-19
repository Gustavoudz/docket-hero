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
    IF NEW.status = 'concluido' THEN
      UPDATE public.inventory_items
        SET status = 'vendido',
            appointment_id = NEW.id,
            sold_at = COALESCE(sold_at, now())
        WHERE id = NEW.inventory_device_id;
    ELSIF NEW.status IN ('legado', 'convertido') THEN
      UPDATE public.inventory_items
        SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
        WHERE id = NEW.inventory_device_id AND status IN ('reservado', 'vendido');
    ELSIF NEW.status = 'cancelado' THEN
      UPDATE public.inventory_items
        SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
        WHERE id = NEW.inventory_device_id;
    ELSE
      UPDATE public.inventory_items
        SET status = 'reservado', appointment_id = NEW.id, sold_at = NULL
        WHERE id = NEW.inventory_device_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;