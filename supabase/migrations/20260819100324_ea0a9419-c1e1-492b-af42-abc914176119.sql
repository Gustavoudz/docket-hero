ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS product_battery_health integer,
  ADD COLUMN IF NOT EXISTS trade_battery_health integer;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_quote_id_idx ON public.appointments(quote_id);