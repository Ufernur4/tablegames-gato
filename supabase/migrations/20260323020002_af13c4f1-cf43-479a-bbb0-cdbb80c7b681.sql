
-- Friendships table
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  friend_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friendships" ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can insert own friendships" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own friendships" ON public.friendships
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Friend requests table
CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_user_id, to_user_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friend requests" ON public.friend_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can send friend requests" ON public.friend_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can update requests sent to them" ON public.friend_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = to_user_id);

CREATE POLICY "Users can delete own requests" ON public.friend_requests
  FOR DELETE TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Game invitations table
CREATE TABLE public.game_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invitations" ON public.game_invitations
  FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can send invitations" ON public.game_invitations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can update invitations sent to them" ON public.game_invitations
  FOR UPDATE TO authenticated
  USING (auth.uid() = to_user_id);

CREATE POLICY "Users can delete own invitations" ON public.game_invitations
  FOR DELETE TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Online presence table
CREATE TABLE public.online_presence (
  user_id uuid PRIMARY KEY NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  is_online boolean NOT NULL DEFAULT true
);

ALTER TABLE public.online_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view presence" ON public.online_presence
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can manage own presence" ON public.online_presence
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence" ON public.online_presence
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Add stats columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS games_played integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS games_won integer NOT NULL DEFAULT 0;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invitations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
