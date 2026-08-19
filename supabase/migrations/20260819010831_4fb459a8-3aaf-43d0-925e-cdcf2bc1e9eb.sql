CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cpf text NOT NULL UNIQUE,
  phone text,
  whatsapp text,
  email text,
  address text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY customers_insert ON public.customers FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY customers_delete ON public.customers FOR DELETE TO authenticated USING (public.is_gerente());

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX customers_name_idx ON public.customers (lower(name));

ALTER TABLE public.appointments ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX appointments_customer_id_idx ON public.appointments (customer_id);