CREATE OR REPLACE FUNCTION public.reset_test_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointments bigint;
  v_sales bigint;
  v_items bigint;
  v_customers bigint;
BEGIN
  IF NOT public.is_gerente() THEN
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
    'reset_dados_teste',
    'sistema',
    NULL,
    jsonb_build_object(
      'agendamentos', v_appointments,
      'vendas', v_sales,
      'itens_estoque', v_items,
      'clientes', v_customers
    )
  );

  RETURN jsonb_build_object(
    'agendamentos', v_appointments,
    'vendas', v_sales,
    'itens_estoque', v_items,
    'clientes', v_customers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_test_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_test_data() TO authenticated;