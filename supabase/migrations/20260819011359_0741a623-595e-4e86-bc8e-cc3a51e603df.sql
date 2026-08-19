CREATE TYPE public.sale_status AS ENUM ('rascunho','aguardando_pagamento','pago','cancelado','estornado');

CREATE SEQUENCE public.sales_number_seq;

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number bigint NOT NULL UNIQUE DEFAULT nextval('public.sales_number_seq'),
  reference text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  seller_id uuid NOT NULL,
  appointment_id uuid UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  status public.sale_status NOT NULL DEFAULT 'rascunho',
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  cancel_reason text,
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sales_number_seq TO authenticated, service_role;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_select ON public.sales FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.is_gerente());
CREATE POLICY sales_insert ON public.sales FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid() OR public.is_gerente());
CREATE POLICY sales_update ON public.sales FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() OR public.is_gerente())
  WITH CHECK (seller_id = auth.uid() OR public.is_gerente());
CREATE POLICY sales_delete ON public.sales FOR DELETE TO authenticated
  USING (public.is_gerente());

CREATE TRIGGER sales_updated_at BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_sale_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  amount numeric;
BEGIN
  IF NEW.status = 'concluido' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    IF EXISTS (SELECT 1 FROM public.sales WHERE appointment_id = NEW.id) THEN
      RETURN NEW;
    END IF;
    amount := COALESCE(NEW.sale_amount, NEW.product_price, 0);
    INSERT INTO public.sales (customer_id, seller_id, appointment_id, inventory_item_id, status, subtotal, discount, total)
    VALUES (NEW.customer_id, NEW.attendant_id, NEW.id, NEW.inventory_device_id, 'aguardando_pagamento', amount, 0, amount);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_on_completion() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER appointments_create_sale AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.create_sale_on_completion();