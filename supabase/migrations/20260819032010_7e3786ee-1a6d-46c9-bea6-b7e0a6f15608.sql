CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sale_appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  source_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  device_model text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','cancelada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente ve todas, vendedora ve as proprias"
ON public.commissions FOR SELECT TO authenticated
USING (public.is_gerente() OR seller_id = auth.uid());

CREATE UNIQUE INDEX commissions_active_per_sale
  ON public.commissions (sale_appointment_id) WHERE status = 'ativa';
CREATE INDEX commissions_seller_completed_idx
  ON public.commissions (seller_id, completed_at DESC);

CREATE TRIGGER commissions_updated_at
BEFORE UPDATE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (key, value) VALUES ('commission_amount', '50')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_commission_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_amount numeric;
  v_seller uuid;
  v_model text;
BEGIN
  IF NEW.status = 'concluido' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    IF NEW.converted_from_appointment_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT attendant_id INTO v_seller
    FROM public.appointments WHERE id = NEW.converted_from_appointment_id;
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

REVOKE EXECUTE ON FUNCTION public.sync_commission_on_sale() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER appointments_sync_commission
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.sync_commission_on_sale();