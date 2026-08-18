ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS deposit_amount numeric,
  ADD COLUMN IF NOT EXISTS customer_instagram text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS installments integer;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('pix','dinheiro','debito','credito','boleto'));

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_installments_check
  CHECK (installments IS NULL OR (installments >= 1 AND installments <= 18));