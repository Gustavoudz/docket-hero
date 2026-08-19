ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.sync_commission_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_seller uuid;
  v_model text;
BEGIN
  IF NEW.status = 'concluido' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    IF NEW.converted_from_appointment_id IS NULL THEN
      v_seller := COALESCE(NEW.seller_id, NULL);
      IF v_seller IS NULL THEN
        RETURN NEW;
      END IF;
    ELSE
      SELECT COALESCE(a.seller_id, a.attendant_id) INTO v_seller
      FROM public.appointments a WHERE a.id = NEW.converted_from_appointment_id;
      v_seller := COALESCE(NEW.seller_id, v_seller);
    END IF;
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
$$;

CREATE OR REPLACE FUNCTION public.create_sale_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  amount numeric;
  sid uuid;
BEGIN
  IF NEW.status = 'concluido' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    SELECT id INTO sid FROM public.sales WHERE appointment_id = NEW.id LIMIT 1;
    IF sid IS NULL THEN
      amount := COALESCE(NEW.sale_amount, NEW.product_price, 0);
      INSERT INTO public.sales (customer_id, seller_id, appointment_id, inventory_item_id, status, subtotal, discount, total)
      VALUES (NEW.customer_id, COALESCE(NEW.seller_id, NEW.attendant_id), NEW.id, NEW.inventory_device_id, 'aguardando_pagamento', amount, 0, amount)
      RETURNING id INTO sid;
    END IF;
    PERFORM public.create_payments_from_appointment(NEW.id, sid);
  END IF;
  RETURN NEW;
END;
$$;