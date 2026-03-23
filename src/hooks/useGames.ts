import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Game = {
  id: string;
  game_type: 'tic-tac-toe' | 'darts' | 'connect-four' | 'checkers' | 'battleship';
  status: 'waiting' | 'playing' | 'finished';
  created_by: string;
  player_x: string | null;
  player_o: string | null;
  current_turn: string | null;
  board: string[];
  winner: string | null;
  is_draw: boolean | null;
  game_data: Record<string, unknown>;
  created_at: string;
};

export function useGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial fetch
    const fetchGames = async () => {
      const { data } = await supabase
        .from('games')
        .select('*');
      if (data) {
        const sorted = data.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setGames(sorted as unknown as Game[]);
      }
      setLoading(false);
    };
    fetchGames();

    // Realtime subscription
    const channel = supabase
      .channel('games-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setGames(prev => [payload.new as unknown as Game, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setGames(prev => prev.map(g => g.id === (payload.new as any).id ? payload.new as unknown as Game : g));
        } else if (payload.eventType === 'DELETE') {
          setGames(prev => prev.filter(g => g.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const createGame = async (userId: string, gameType: 'tic-tac-toe' | 'darts') => {
    const gameData = gameType === 'darts' 
      ? { player_x_score: 301, player_o_score: 301, current_round: 1 }
      : {};

    const { data, error } = await supabase
      .from('games')
      .insert({
        game_type: gameType,
        created_by: userId,
        player_x: userId,
        current_turn: userId,
        board: gameType === 'tic-tac-toe' ? ['','','','','','','','',''] : [],
        game_data: gameData,
      })
      .select()
      .single();

    return { data: data as unknown as Game | null, error };
  };

  const joinGame = async (gameId: string, userId: string) => {
    const { error } = await supabase
      .from('games')
      .update({
        player_o: userId,
        status: 'playing' as any,
      })
      .eq('id', gameId);

    return { error };
  };

  const deleteGame = async (gameId: string) => {
    const { error } = await supabase.from('games').delete().eq('id', gameId);
    return { error };
  };

  return { games, loading, createGame, joinGame, deleteGame };
}
