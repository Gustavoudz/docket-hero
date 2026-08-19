REVOKE ALL ON FUNCTION public.sync_commission_on_sale() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_sale_on_completion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_payments_from_appointment(uuid, uuid) FROM PUBLIC, anon, authenticated;