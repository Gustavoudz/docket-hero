CREATE TYPE public.payment_method AS ENUM ('pix','debito','credito');
CREATE TYPE public.payment_status AS ENUM ('aguardando','aprovado','recusado','cancelado','estornado');

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'aguardando',
  gross_amount numeric NOT NULL DEFAULT 0,
  fee_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  installments integer NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 18),
  installment_value numeric,
  card_brand text,
  card_last4 text CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  nsu text,
  authorization_code text,
  transaction_code text,
  terminal text,
  reference text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  confirmed_by uuid,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = payments.sale_id AND (s.seller_id = auth.uid() OR public.is_gerente())));
CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = payments.sale_id AND (s.seller_id = auth.uid() OR public.is_gerente())));
CREATE POLICY payments_update ON public.payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = payments.sale_id AND (s.seller_id = auth.uid() OR public.is_gerente())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = payments.sale_id AND (s.seller_id = auth.uid() OR public.is_gerente())));
CREATE POLICY payments_delete ON public.payments FOR DELETE TO authenticated
  USING (public.is_gerente());

CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.guard_payment_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'aprovado' AND NOT public.is_gerente() THEN
    RAISE EXCEPTION 'Pagamento aprovado só pode ser alterado pelo gerente';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_payment_edit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER payments_guard_edit BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_edit();

CREATE OR REPLACE FUNCTION public.sync_sale_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sid uuid := COALESCE(NEW.sale_id, OLD.sale_id);
  has_approved boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.payments WHERE sale_id = sid AND status = 'aprovado') INTO has_approved;
  IF has_approved THEN
    UPDATE public.sales SET status = 'pago' WHERE id = sid AND status NOT IN ('cancelado','estornado');
  ELSE
    UPDATE public.sales SET status = 'aguardando_pagamento' WHERE id = sid AND status = 'pago';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_sale_payment_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER payments_sync_sale AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sale_payment_status();