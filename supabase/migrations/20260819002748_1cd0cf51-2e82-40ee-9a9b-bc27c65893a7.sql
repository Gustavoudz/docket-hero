-- 1. Lock down SECURITY DEFINER trigger functions (only the trigger system needs them)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_inventory_cost_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_inventory_item_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_appointment_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_inventory_with_appointment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_appointment() FROM PUBLIC, anon, authenticated;

-- 2. inventory_costs: only manager, or the creator of the item setting its initial cost
DROP POLICY IF EXISTS inventory_costs_insert ON public.inventory_costs;
CREATE POLICY inventory_costs_insert ON public.inventory_costs
FOR INSERT TO authenticated
WITH CHECK (
  public.is_gerente()
  OR EXISTS (
    SELECT 1 FROM public.inventory_items i
    WHERE i.id = item_id AND i.created_by = auth.uid()
  )
);

-- 3. inventory_events: actor must be the caller
DROP POLICY IF EXISTS inventory_events_insert ON public.inventory_events;
CREATE POLICY inventory_events_insert ON public.inventory_events
FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid());

-- 4. inventory_items: creator recorded on insert; updates scoped + sensitive fields manager-only
DROP POLICY IF EXISTS inventory_items_insert ON public.inventory_items;
CREATE POLICY inventory_items_insert ON public.inventory_items
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS inventory_items_update ON public.inventory_items;
CREATE POLICY inventory_items_update ON public.inventory_items
FOR UPDATE TO authenticated
USING (
  public.is_gerente()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = inventory_items.appointment_id AND a.attendant_id = auth.uid()
  )
)
WITH CHECK (
  public.is_gerente()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = inventory_items.appointment_id AND a.attendant_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.guard_inventory_item_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_gerente() THEN
    RETURN NEW;
  END IF;
  IF NEW.device_model IS DISTINCT FROM OLD.device_model
     OR NEW.serial_number IS DISTINCT FROM OLD.serial_number
     OR NEW.imei IS DISTINCT FROM OLD.imei
     OR NEW.sale_price IS DISTINCT FROM OLD.sale_price
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.entered_at IS DISTINCT FROM OLD.entered_at THEN
    IF OLD.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Apenas o gerente pode alterar os dados cadastrais deste aparelho';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_inventory_item_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inventory_items_guard ON public.inventory_items;
CREATE TRIGGER inventory_items_guard
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_item_fields();