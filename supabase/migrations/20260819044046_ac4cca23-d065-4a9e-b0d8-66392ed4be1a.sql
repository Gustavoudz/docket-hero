ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS customer_email text;

CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE CASCADE,
  receipt_number bigint NOT NULL DEFAULT nextval('public.receipt_number_seq'),
  customer_email text,
  public_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS receipts_number_key ON public.receipts (receipt_number);
CREATE UNIQUE INDEX IF NOT EXISTS receipts_token_key ON public.receipts (public_token);

GRANT SELECT ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Atendentes e gerentes veem recibos"
ON public.receipts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gerente') OR public.has_role(auth.uid(), 'atendente'));

CREATE TRIGGER receipts_updated_at BEFORE UPDATE ON public.receipts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_receipt_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW.inventory_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.receipts WHERE sale_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(a.customer_email, ''), c.email)
    INTO v_email
  FROM public.appointments a
  LEFT JOIN public.customers c ON c.id = a.customer_id
  WHERE a.id = NEW.appointment_id;

  IF v_email IS NULL AND NEW.customer_id IS NOT NULL THEN
    SELECT email INTO v_email FROM public.customers WHERE id = NEW.customer_id;
  END IF;

  INSERT INTO public.receipts (sale_id, customer_email)
  VALUES (NEW.id, NULLIF(v_email, ''))
  ON CONFLICT (sale_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_receipt_for_sale() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sales_create_receipt
AFTER INSERT OR UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.create_receipt_for_sale();

INSERT INTO public.app_settings (key, value) VALUES
  ('store_name', 'Legado Phones'),
  ('store_address', ''),
  ('store_contact', ''),
  ('warranty_lacrado', 'Aparelho lacrado: garantia de 12 meses diretamente com a Apple, a contar da data desta compra.'),
  ('warranty_seminovo', 'Aparelho seminovo: garantia de 90 dias da loja para defeitos de fabricação, não cobrindo danos por queda, contato com líquidos ou mau uso.')
ON CONFLICT (key) DO NOTHING;