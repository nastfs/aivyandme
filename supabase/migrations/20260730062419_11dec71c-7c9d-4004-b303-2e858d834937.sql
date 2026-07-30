ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS ai_image_url text,
  ADD COLUMN IF NOT EXISTS use_ai_image boolean NOT NULL DEFAULT true;