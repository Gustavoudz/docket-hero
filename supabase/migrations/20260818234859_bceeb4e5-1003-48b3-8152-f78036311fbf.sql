ALTER TABLE public.inventory_items
  ALTER COLUMN apple_id DROP NOT NULL;

ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_apple_id_key;