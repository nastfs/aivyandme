CREATE TABLE public.outfit_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_ids uuid[] NOT NULL DEFAULT '{}',
  liked boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outfit_feedback TO authenticated;
GRANT ALL ON public.outfit_feedback TO service_role;

ALTER TABLE public.outfit_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY of_select_own ON public.outfit_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY of_insert_own ON public.outfit_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY of_update_own ON public.outfit_feedback FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY of_delete_own ON public.outfit_feedback FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX outfit_feedback_user_created_idx ON public.outfit_feedback (user_id, created_at DESC);