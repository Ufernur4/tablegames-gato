DROP POLICY IF EXISTS "Anyone can view shop items" ON public.shop_items;
CREATE POLICY "Anyone can view shop items" ON public.shop_items FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Anyone can view achievements" ON public.achievements;
CREATE POLICY "Anyone can view achievements" ON public.achievements FOR SELECT TO public USING (true);