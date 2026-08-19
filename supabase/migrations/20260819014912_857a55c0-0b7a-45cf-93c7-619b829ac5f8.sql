CREATE OR REPLACE FUNCTION public.validate_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelado' AND (NEW.cancel_reason IS NULL OR btrim(NEW.cancel_reason) = '') THEN
    RAISE EXCEPTION 'É obrigatório informar o motivo do cancelamento';
  END IF;

  -- Venda com tag Upgrade só conclui após o cadastro do aparelho que entra na troca
  IF NEW.status = 'concluido'
     AND lower(btrim(COALESCE(NEW.tag, ''))) = 'upgrade'
     AND NOT EXISTS (
       SELECT 1 FROM public.inventory_events
       WHERE appointment_id = NEW.id AND kind = 'criado_via_troca'
     ) THEN
    RAISE EXCEPTION 'Cadastre o aparelho recebido na troca antes de concluir a venda';
  END IF;

  IF NEW.status = 'concluido' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  IF NEW.status NOT IN ('concluido', 'legado') THEN
    NEW.completed_at := NULL;
  END IF;
  IF NEW.status NOT IN ('cancelado', 'legado') THEN
    NEW.cancel_reason := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;