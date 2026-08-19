ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS battery_health integer;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_battery_health_range CHECK (battery_health IS NULL OR (battery_health >= 0 AND battery_health <= 100));

ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS battery_health integer;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_battery_health_range CHECK (battery_health IS NULL OR (battery_health >= 0 AND battery_health <= 100));