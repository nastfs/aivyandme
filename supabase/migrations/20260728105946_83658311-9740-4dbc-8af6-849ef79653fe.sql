
-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- category enum
CREATE TYPE public.item_category AS ENUM ('oberteile','hosen','kleider','blazer','roecke','schuhe','taschen','sport','sonstiges');

-- wardrobe_items
CREATE TABLE public.wardrobe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  category public.item_category NOT NULL DEFAULT 'sonstiges',
  name TEXT,
  color TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wardrobe_items TO authenticated;
GRANT ALL ON public.wardrobe_items TO service_role;
ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wi_select_own" ON public.wardrobe_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wi_insert_own" ON public.wardrobe_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wi_update_own" ON public.wardrobe_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wi_delete_own" ON public.wardrobe_items FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_wi_user ON public.wardrobe_items(user_id);

-- outfits
CREATE TABLE public.outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfits TO authenticated;
GRANT ALL ON public.outfits TO service_role;
ALTER TABLE public.outfits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "o_select_own" ON public.outfits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "o_insert_own" ON public.outfits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "o_update_own" ON public.outfits FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "o_delete_own" ON public.outfits FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- outfit_items
CREATE TABLE public.outfit_items (
  outfit_id UUID NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.wardrobe_items(id) ON DELETE CASCADE,
  PRIMARY KEY (outfit_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfit_items TO authenticated;
GRANT ALL ON public.outfit_items TO service_role;
ALTER TABLE public.outfit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oi_select_own" ON public.outfit_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.outfits o WHERE o.id = outfit_id AND o.user_id = auth.uid()));
CREATE POLICY "oi_insert_own" ON public.outfit_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.outfits o WHERE o.id = outfit_id AND o.user_id = auth.uid()));
CREATE POLICY "oi_delete_own" ON public.outfit_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.outfits o WHERE o.id = outfit_id AND o.user_id = auth.uid()));

-- outfit_plans
CREATE TABLE public.outfit_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outfit_id UUID NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, planned_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfit_plans TO authenticated;
GRANT ALL ON public.outfit_plans TO service_role;
ALTER TABLE public.outfit_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "op_select_own" ON public.outfit_plans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "op_insert_own" ON public.outfit_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "op_update_own" ON public.outfit_plans FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "op_delete_own" ON public.outfit_plans FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
