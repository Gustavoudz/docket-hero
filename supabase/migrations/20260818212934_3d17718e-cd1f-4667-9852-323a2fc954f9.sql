ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS installment_value numeric;

UPDATE public.appointments SET payment_method = NULL WHERE payment_method = 'boleto';

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_payment_method_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('pix','dinheiro','debito','credito'));