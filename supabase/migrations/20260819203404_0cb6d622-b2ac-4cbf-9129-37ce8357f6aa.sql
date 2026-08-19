
-- customers
DROP POLICY IF EXISTS customers_select ON public.customers;
CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated
USING (
  public.is_gerente()
  OR public.has_role(auth.uid(), 'atendente')
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.appointments a WHERE a.customer_id = customers.id AND (a.attendant_id = auth.uid() OR a.seller_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.sales s WHERE s.customer_id = customers.id AND s.seller_id = auth.uid())
);

DROP POLICY IF EXISTS customers_update ON public.customers;
CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated
USING (public.is_gerente() OR created_by = auth.uid())
WITH CHECK (public.is_gerente() OR created_by = auth.uid());

-- inventory_events
DROP POLICY IF EXISTS inventory_events_select ON public.inventory_events;
CREATE POLICY inventory_events_select ON public.inventory_events FOR SELECT TO authenticated
USING (public.is_gerente() OR public.has_role(auth.uid(), 'atendente') OR actor_id = auth.uid());

-- quotes
DROP POLICY IF EXISTS quotes_select ON public.quotes;
CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated
USING (seller_id = auth.uid() OR public.is_gerente());

-- service_orders
DROP POLICY IF EXISTS "Colaboradores veem as ordens de servico" ON public.service_orders;
CREATE POLICY "Ordens de servico visiveis para responsaveis" ON public.service_orders FOR SELECT TO authenticated
USING (public.is_gerente() OR responsible_id = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS "Colaboradores atualizam ordens de servico" ON public.service_orders;
CREATE POLICY "Responsaveis atualizam ordens de servico" ON public.service_orders FOR UPDATE TO authenticated
USING (public.is_gerente() OR responsible_id = auth.uid() OR created_by = auth.uid())
WITH CHECK (public.is_gerente() OR responsible_id = auth.uid() OR created_by = auth.uid());

-- reset_test_data: no longer callable by clients
CREATE OR REPLACE FUNCTION public.reset_test_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appointments bigint;
  v_sales bigint;
  v_items bigint;
  v_customers bigint;
BEGIN
  IF NOT (public.is_gerente() OR current_user = 'service_role') THEN
    RAISE EXCEPTION 'Apenas o gerente pode resetar os dados de teste';
  END IF;

  SELECT count(*) INTO v_appointments FROM public.appointments;
  SELECT count(*) INTO v_sales FROM public.sales;
  SELECT count(*) INTO v_items FROM public.inventory_items;
  SELECT count(*) INTO v_customers FROM public.customers;

  DELETE FROM public.payments;
  DELETE FROM public.notifications;
  DELETE FROM public.inventory_events;
  DELETE FROM public.inventory_costs;
  DELETE FROM public.inventory_audits;
  DELETE FROM public.day_closures;

  UPDATE public.inventory_items SET appointment_id = NULL WHERE appointment_id IS NOT NULL;
  UPDATE public.appointments SET inventory_device_id = NULL, sale_id = NULL, converted_from_appointment_id = NULL, customer_id = NULL;

  DELETE FROM public.sales;
  DELETE FROM public.inventory_items;
  DELETE FROM public.appointments;
  DELETE FROM public.customers;

  PERFORM public.write_audit_log(
    'reset_dados_teste', 'sistema', NULL,
    jsonb_build_object('agendamentos', v_appointments, 'vendas', v_sales, 'itens_estoque', v_items, 'clientes', v_customers)
  );

  RETURN jsonb_build_object('agendamentos', v_appointments, 'vendas', v_sales, 'itens_estoque', v_items, 'clientes', v_customers);
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_test_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_test_data() TO service_role;
