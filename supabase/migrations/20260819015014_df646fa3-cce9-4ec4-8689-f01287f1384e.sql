CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gerente vê a trilha de auditoria"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_gerente());

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX audit_logs_action_idx ON public.audit_logs (action);

CREATE OR REPLACE FUNCTION public.write_audit_log(
  _action text, _entity_type text, _entity_id uuid, _details jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, COALESCE(_details, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.write_audit_log(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed boolean := (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status);
  act text;
BEGIN
  IF NOT changed THEN RETURN NEW; END IF;
  IF NEW.status = 'aprovado' THEN
    act := 'pagamento_aprovado';
  ELSIF NEW.status = 'cancelado' THEN
    act := 'pagamento_cancelado';
  ELSIF NEW.status = 'estornado' THEN
    act := 'pagamento_estornado';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.write_audit_log(
    act, 'payment', NEW.id,
    jsonb_build_object(
      'sale_id', NEW.sale_id,
      'method', NEW.method,
      'gross_amount', NEW.gross_amount,
      'net_amount', NEW.net_amount,
      'installments', NEW.installments,
      'status_anterior', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status::text ELSE NULL END,
      'status_novo', NEW.status::text
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_audit
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.audit_payment_change();

CREATE OR REPLACE FUNCTION public.audit_sale_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelado' THEN
    act := 'venda_cancelada';
  ELSIF NEW.status = 'estornado' THEN
    act := 'venda_estornada';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.write_audit_log(
    act, 'sale', NEW.id,
    jsonb_build_object(
      'sale_number', NEW.sale_number,
      'reference', NEW.reference,
      'total', NEW.total,
      'motivo', NEW.cancel_reason,
      'status_anterior', OLD.status::text,
      'status_novo', NEW.status::text
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_audit
AFTER UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.audit_sale_change();

CREATE OR REPLACE FUNCTION public.audit_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_log('permissao_alterada', 'user_role', NEW.user_id,
      jsonb_build_object('papel_anterior', NULL, 'papel_novo', NEW.role::text));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM public.write_audit_log('permissao_alterada', 'user_role', NEW.user_id,
        jsonb_build_object('papel_anterior', OLD.role::text, 'papel_novo', NEW.role::text));
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.write_audit_log('permissao_alterada', 'user_role', OLD.user_id,
      jsonb_build_object('papel_anterior', OLD.role::text, 'papel_novo', NULL));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER user_roles_audit
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_role_change();