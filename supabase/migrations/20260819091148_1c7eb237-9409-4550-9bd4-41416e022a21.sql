CREATE TYPE public.quote_status AS ENUM ('enviado','convertido','sem_resposta');
CREATE TYPE public.quote_kind AS ENUM ('simples','upgrade');

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id),
  kind public.quote_kind NOT NULL DEFAULT 'simples',
  status public.quote_status NOT NULL DEFAULT 'enviado',
  customer_name text,
  customer_contact text,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  product_model text NOT NULL,
  product_color text,
  product_storage text,
  product_condition text,
  product_price numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  notes text,
  trade_model text,
  trade_color text,
  trade_storage text,
  trade_condition text,
  trade_value numeric,
  deadline_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_select" ON public.quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());
CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE TO authenticated USING (seller_id = auth.uid() OR public.is_gerente()) WITH CHECK (seller_id = auth.uid() OR public.is_gerente());
CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE TO authenticated USING (seller_id = auth.uid() OR public.is_gerente());

CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();