REVOKE ALL ON FUNCTION public.audit_payment_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_sale_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_role_change() FROM PUBLIC, anon, authenticated;