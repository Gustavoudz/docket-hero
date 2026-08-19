GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

DROP POLICY IF EXISTS "Gerente gerencia funcoes" ON public.user_roles;
CREATE POLICY "Gerente gerencia funcoes"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_gerente())
WITH CHECK (public.is_gerente());