INSERT INTO public.device_models (name, active, sort_order)
SELECT v.name, true, 0
FROM (VALUES
  ('iPhone 17'),
  ('iPhone 17 Plus'),
  ('iPhone 17e'),
  ('iPhone Air'),
  ('iPhone 17 Pro'),
  ('iPhone 17 Pro Max')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.device_models d WHERE lower(d.name) = lower(v.name)
);