
-- Achievements definition table
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  emoji text NOT NULL DEFAULT '🏆',
  category text NOT NULL DEFAULT 'general',
  threshold integer NOT NULL DEFAULT 1,
  coin_reward integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User unlocked achievements
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- RLS
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view achievements" ON public.achievements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can view own unlocked" ON public.user_achievements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own unlocked" ON public.user_achievements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Seed achievements
INSERT INTO public.achievements (key, title, description, emoji, category, threshold, coin_reward) VALUES
  ('first_win', 'Erster Sieg', 'Gewinne dein erstes Spiel', '🥇', 'wins', 1, 25),
  ('wins_5', 'Aufsteigender Stern', 'Gewinne 5 Spiele', '⭐', 'wins', 5, 50),
  ('wins_25', 'Champion', 'Gewinne 25 Spiele', '🏆', 'wins', 25, 150),
  ('wins_100', 'Legende', 'Gewinne 100 Spiele', '👑', 'wins', 100, 500),
  ('games_10', 'Fleißiger Spieler', 'Spiele 10 Spiele', '🎮', 'games', 10, 30),
  ('games_50', 'Veteran', 'Spiele 50 Spiele', '🎖️', 'games', 50, 100),
  ('games_200', 'Unermüdlich', 'Spiele 200 Spiele', '💪', 'games', 200, 300),
  ('coins_500', 'Sparschwein', 'Sammle 500 Münzen', '🐷', 'coins', 500, 50),
  ('coins_2000', 'Reichtum', 'Sammle 2000 Münzen', '💰', 'coins', 2000, 100),
  ('friends_3', 'Gesellig', 'Füge 3 Freunde hinzu', '🤝', 'social', 3, 30),
  ('friends_10', 'Beliebt', 'Füge 10 Freunde hinzu', '🌟', 'social', 10, 75),
  ('streak_3', 'Siegesserie', 'Gewinne 3 Spiele hintereinander', '🔥', 'streak', 3, 60),
  ('all_games', 'Allrounder', 'Spiele jedes Spielgenre mindestens einmal', '🎯', 'special', 14, 200),
  ('first_purchase', 'Erster Einkauf', 'Kaufe dein erstes Item im Shop', '🛒', 'shop', 1, 10),
  ('daily_7', 'Treue Seele', 'Logge dich 7 Tage ein', '📅', 'daily', 7, 75),
  ('speed_win', 'Blitzsieg', 'Gewinne ein Spiel in unter 30 Sekunden', '⚡', 'special', 1, 40),
  ('chess_master', 'Schachmeister', 'Gewinne 10 Schachpartien', '♔', 'games', 10, 100),
  ('trivia_genius', 'Quizgenie', 'Beantworte 50 Trivia-Fragen richtig', '🧠', 'games', 50, 80);
