CREATE OR REPLACE FUNCTION public.sync_commission_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric;
  v_seller uuid;
  v_model text;
BEGIN
  IF NEW.status = 'concluido' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    IF NEW.converted_from_appointment_id IS NOT NULL THEN
      SELECT COALESCE(a.seller_id, a.attendant_id) INTO v_seller
      FROM public.appointments a WHERE a.id = NEW.converted_from_appointment_id;
    END IF;
    v_seller := COALESCE(NEW.seller_id, v_seller, NEW.attendant_id);
    IF v_seller IS NULL THEN RETURN NEW; END IF;

    IF EXISTS (SELECT 1 FROM public.commissions
               WHERE sale_appointment_id = NEW.id AND status = 'ativa') THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(NULLIF(value,'')::numeric, 50) INTO v_amount
    FROM public.app_settings WHERE key = 'commission_amount';
    v_amount := COALESCE(v_amount, 50);

    v_model := NEW.device_model;
    IF NEW.inventory_device_id IS NOT NULL THEN
      SELECT COALESCE(i.device_model, v_model) INTO v_model
      FROM public.inventory_items i WHERE i.id = NEW.inventory_device_id;
    END IF;

    INSERT INTO public.commissions
      (seller_id, sale_appointment_id, source_appointment_id, amount, device_model, completed_at)
    VALUES (v_seller, NEW.id, NEW.converted_from_appointment_id, v_amount, v_model,
            COALESCE(NEW.completed_at, now()));

  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'concluido' AND NEW.status IS DISTINCT FROM 'concluido' THEN
    UPDATE public.commissions
      SET status = 'cancelada'
      WHERE sale_appointment_id = NEW.id AND status = 'ativa';
  END IF;

  RETURN NEW;
END;
$function$;

INSERT INTO public.commissions
  (seller_id, sale_appointment_id, source_appointment_id, amount, device_model, completed_at)
SELECT COALESCE(a.seller_id, a.attendant_id),
       a.id,
       a.converted_from_appointment_id,
       COALESCE((SELECT NULLIF(value,'')::numeric FROM public.app_settings WHERE key = 'commission_amount'), 50),
       COALESCE((SELECT i.device_model FROM public.inventory_items i WHERE i.id = a.inventory_device_id), a.device_model),
       COALESCE(a.completed_at, a.updated_at, now())
FROM public.appointments a
WHERE a.status = 'concluido'
  AND COALESCE(a.seller_id, a.attendant_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.commissions c
    WHERE c.sale_appointment_id = a.id AND c.status = 'ativa'
  );