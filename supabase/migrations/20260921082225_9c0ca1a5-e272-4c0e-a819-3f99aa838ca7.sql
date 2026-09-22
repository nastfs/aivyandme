-- daily_context: speichert, was pro Tag ansteht (Büro, Kundentermin, Homeoffice, Sport, Frei)
-- für passende Outfit-Vorschläge auf der Startseite.
CREATE TABLE public.daily_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_date DATE NOT NULL,
  occasion TEXT NOT NULL CHECK (occasion IN ('buero','kundentermin','homeoffice','sport','frei')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, context_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_context TO authenticated;
GRANT ALL ON public.daily_context TO service_role;
ALTER TABLE public.daily_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dc_select_own" ON public.daily_context FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dc_insert_own" ON public.daily_context FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dc_update_own" ON public.daily_context FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dc_delete_own" ON public.daily_context FOR DELETE TO authenticated USING (auth.uid() = user_id);
