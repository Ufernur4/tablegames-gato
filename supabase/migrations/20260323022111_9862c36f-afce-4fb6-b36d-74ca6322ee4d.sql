
-- Add new game types
ALTER TYPE public.game_type ADD VALUE IF NOT EXISTS 'bowling';
ALTER TYPE public.game_type ADD VALUE IF NOT EXISTS 'mini-golf';
ALTER TYPE public.game_type ADD VALUE IF NOT EXISTS 'pool';
ALTER TYPE public.game_type ADD VALUE IF NOT EXISTS 'trivia';
ALTER TYPE public.game_type ADD VALUE IF NOT EXISTS 'word-game';

-- Coins / wallet for each user
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 100;

-- Shop items table
CREATE TABLE public.shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price integer NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'cosmetic',
  image_emoji text DEFAULT '🎁',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shop items" ON public.shop_items
  FOR SELECT TO authenticated USING (true);

-- User purchases
CREATE TABLE public.user_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid REFERENCES public.shop_items(id) ON DELETE CASCADE NOT NULL,
  purchased_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases" ON public.user_purchases
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own purchases" ON public.user_purchases
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Coin transactions log
CREATE TABLE public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.coin_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON public.coin_transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Seed shop items
INSERT INTO public.shop_items (name, description, price, category, image_emoji) VALUES
  ('Gold-Rahmen', 'Goldener Profilrahmen', 50, 'cosmetic', '🖼️'),
  ('Feuerwerk-Effekt', 'Feuerwerk bei Gewinn', 75, 'effect', '🎆'),
  ('VIP-Badge', 'VIP-Abzeichen am Namen', 100, 'badge', '⭐'),
  ('Doppel-Münzen', '2x Münzen für 5 Spiele', 150, 'boost', '💰'),
  ('Regenbogen-Name', 'Regenbogenfarben im Chat', 200, 'cosmetic', '🌈'),
  ('Kronen-Emoji', 'Krone neben dem Namen', 80, 'badge', '👑'),
  ('Blitz-Effekt', 'Blitz-Animation bei Zügen', 120, 'effect', '⚡'),
  ('Diamant-Badge', 'Diamant-Abzeichen', 300, 'badge', '💎');
