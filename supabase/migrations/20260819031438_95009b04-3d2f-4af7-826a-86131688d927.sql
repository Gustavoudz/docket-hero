ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'dinheiro';

CREATE OR REPLACE FUNCTION public.create_payments_from_appointment(_appointment_id uuid, _sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a public.appointments%ROWTYPE;
  entry jsonb;
  m text;
  amt numeric;
  inst integer;
  instval numeric;
BEGIN
  SELECT * INTO a FROM public.appointments WHERE id = _appointment_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE sale_id = _sale_id) THEN RETURN; END IF;

  IF COALESCE(a.deposit_amount, 0) > 0 THEN
    INSERT INTO public.payments (sale_id, method, status, gross_amount, net_amount, installments, confirmed_by, confirmed_at, notes)
    VALUES (_sale_id,
            (CASE WHEN COALESCE(a.payment_method,'pix') IN ('pix','dinheiro','debito','credito') THEN COALESCE(a.payment_method,'pix') ELSE 'pix' END)::public.payment_method,
            'aprovado', a.deposit_amount, a.deposit_amount, 1, a.attendant_id, now(), 'Sinal / entrada');
  END IF;

  IF jsonb_typeof(a.payments) = 'array' THEN
    FOR entry IN SELECT * FROM jsonb_array_elements(a.payments) LOOP
      m := COALESCE(entry->>'method', 'pix');
      IF m NOT IN ('pix','dinheiro','debito','credito') THEN m := 'pix'; END IF;
      inst := GREATEST(1, LEAST(18, COALESCE((entry->>'installments')::integer, 1)));
      instval := NULLIF(entry->>'installment_value','')::numeric;
      amt := COALESCE(NULLIF(entry->>'amount','')::numeric, 0);
      IF amt <= 0 AND instval IS NOT NULL THEN amt := inst * instval; END IF;
      IF amt > 0 THEN
        INSERT INTO public.payments (sale_id, method, status, gross_amount, net_amount, installments, installment_value, confirmed_by, confirmed_at)
        VALUES (_sale_id, m::public.payment_method, 'aprovado', amt, amt, inst, instval, a.attendant_id, now());
      END IF;
    END LOOP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE sale_id = _sale_id)
     AND COALESCE(a.sale_amount, a.product_price, 0) > 0 THEN
    m := COALESCE(a.payment_method, 'pix');
    IF m NOT IN ('pix','dinheiro','debito','credito') THEN m := 'pix'; END IF;
    amt := COALESCE(a.sale_amount, a.product_price);
    INSERT INTO public.payments (sale_id, method, status, gross_amount, net_amount, installments, installment_value, confirmed_by, confirmed_at)
    VALUES (_sale_id, m::public.payment_method, 'aprovado', amt, amt,
            GREATEST(1, LEAST(18, COALESCE(a.installments, 1))), a.installment_value, a.attendant_id, now());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payments_from_appointment(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_sale_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      VALUES (NEW.customer_id, NEW.attendant_id, NEW.id, NEW.inventory_device_id, 'aguardando_pagamento', amount, 0, amount)
      RETURNING id INTO sid;
    END IF;
    PERFORM public.create_payments_from_appointment(NEW.id, sid);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_on_completion() FROM PUBLIC, anon, authenticated;
