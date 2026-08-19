DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT s.id, s.appointment_id FROM public.sales s
           WHERE s.appointment_id IS NOT NULL
             AND s.status NOT IN ('cancelado','estornado')
             AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.sale_id = s.id)
  LOOP
    PERFORM public.create_payments_from_appointment(r.appointment_id, r.id);
  END LOOP;
END $$;