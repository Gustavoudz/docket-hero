ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS imei text,
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'seminovo' CHECK (condition IN ('lacrado','seminovo'));