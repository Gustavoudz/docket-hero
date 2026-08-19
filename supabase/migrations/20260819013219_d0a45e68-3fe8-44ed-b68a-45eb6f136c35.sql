ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedora';

DO $$ BEGIN
  CREATE TYPE public.record_type AS ENUM ('agendamento', 'venda');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS record_type public.record_type NOT NULL DEFAULT 'agendamento';

DROP POLICY IF EXISTS appointments_select ON public.appointments;
CREATE POLICY appointments_select ON public.appointments
  FOR SELECT TO authenticated
  USING (
    public.is_gerente()
    OR attendant_id = auth.uid()
    OR (record_type = 'venda' AND public.has_role(auth.uid(), 'atendente'))
  );

DROP POLICY IF EXISTS appointments_insert ON public.appointments;
CREATE POLICY appointments_insert ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    attendant_id = auth.uid()
    AND (
      public.is_gerente()
      OR (record_type = 'venda' AND public.has_role(auth.uid(), 'atendente'))
      OR (record_type = 'agendamento' AND NOT public.has_role(auth.uid(), 'atendente'))
    )
  );

DROP POLICY IF EXISTS appointments_update ON public.appointments;
CREATE POLICY appointments_update ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    public.is_gerente()
    OR attendant_id = auth.uid()
    OR (record_type = 'venda' AND public.has_role(auth.uid(), 'atendente'))
  )
  WITH CHECK (
    public.is_gerente()
    OR attendant_id = auth.uid()
    OR (record_type = 'venda' AND public.has_role(auth.uid(), 'atendente'))
  );