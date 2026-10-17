-- Run ONCE in your existing ZHENLI-DMS Supabase project SQL Editor.
-- Does not alter or delete existing companies, documents or folders.
CREATE TABLE IF NOT EXISTS public.task_hub_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{"version":1,"tasks":[],"companies":[],"activity":[],"settings":{}}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_hub_json_shape CHECK (jsonb_typeof(payload) = 'object')
);
ALTER TABLE public.task_hub_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.task_hub_state TO authenticated;
DROP POLICY IF EXISTS "task_hub_select_own" ON public.task_hub_state;
DROP POLICY IF EXISTS "task_hub_insert_own" ON public.task_hub_state;
DROP POLICY IF EXISTS "task_hub_update_own" ON public.task_hub_state;
CREATE POLICY "task_hub_select_own" ON public.task_hub_state FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "task_hub_insert_own" ON public.task_hub_state FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "task_hub_update_own" ON public.task_hub_state FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
