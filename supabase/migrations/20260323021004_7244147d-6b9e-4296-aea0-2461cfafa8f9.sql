
-- Add new game types to the enum
ALTER TYPE public.game_type ADD VALUE IF NOT EXISTS 'connect-four';
ALTER TYPE public.game_type ADD VALUE IF NOT EXISTS 'checkers';
ALTER TYPE public.game_type ADD VALUE IF NOT EXISTS 'battleship';
