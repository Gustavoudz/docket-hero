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
    IF NEW.status = 'cancelado' THEN
      UPDATE public.inventory_items
        SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
        WHERE id = NEW.inventory_device_id AND status <> 'vendido';
    ELSE
      -- pendente ou concluido: apenas reserva. Vendido passa a depender do pagamento da venda.
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

CREATE OR REPLACE FUNCTION public.sync_inventory_with_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cur public.inventory_items%ROWTYPE;
BEGIN
  IF NEW.inventory_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pago' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pago') THEN
    -- trava de concorrência
    SELECT * INTO cur FROM public.inventory_items WHERE id = NEW.inventory_item_id FOR UPDATE;
    IF cur.id IS NULL THEN
      RETURN NEW;
    END IF;
    IF cur.status = 'vendido' THEN
      IF cur.appointment_id IS NOT DISTINCT FROM NEW.appointment_id THEN
        RETURN NEW; -- idempotente: já vendido para esta mesma venda
      END IF;
      RAISE EXCEPTION 'Este produto já foi vendido';
    END IF;
    UPDATE public.inventory_items
      SET status = 'vendido',
          appointment_id = COALESCE(NEW.appointment_id, appointment_id),
          sold_at = COALESCE(sold_at, now())
      WHERE id = NEW.inventory_item_id;
  ELSIF NEW.status IN ('cancelado','estornado') AND (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.inventory_items
      SET status = 'disponivel', appointment_id = NULL, sold_at = NULL
      WHERE id = NEW.inventory_item_id;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_inventory_with_sale() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sales_sync_inventory ON public.sales;
CREATE TRIGGER sales_sync_inventory
AFTER INSERT OR UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_with_sale();