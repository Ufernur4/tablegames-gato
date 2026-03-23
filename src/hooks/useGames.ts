import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const REQUEST_TIMEOUT_MS = 12000;

async function withTimeout<T>(request: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Zeitüberschreitung bei der Server-Anfrage.')), ms);
  });

  try {
    return await Promise.race([Promise.resolve(request), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export type Game = {
  id: string;
  game_type: 'tic-tac-toe' | 'darts' | 'connect-four' | 'checkers' | 'battleship' | 'bowling' | 'mini-golf' | 'pool' | 'trivia' | 'word-game' | 'chess' | 'ludo' | 'memory' | 'rock-paper-scissors' | 'table-soccer';
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

const INITIAL_CHESS_BOARD = [
  'bR','bN','bB','bQ','bK','bB','bN','bR',
  'bP','bP','bP','bP','bP','bP','bP','bP',
  '','','','','','','','',
  '','','','','','','','',
  '','','','','','','','',
  '','','','','','','','',
  'wP','wP','wP','wP','wP','wP','wP','wP',
  'wR','wN','wB','wQ','wK','wB','wN','wR',
];

const EMOJIS = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔'];
function generateMemoryBoard(): string[] {
  const pairs = [...EMOJIS].sort(() => Math.random() - 0.5).slice(0, 8);
  return [...pairs, ...pairs].sort(() => Math.random() - 0.5);
}

export function useGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const { data } = await withTimeout(supabase.from('games').select('*'));
        if (data) {
          const sorted = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setGames(sorted as unknown as Game[]);
        }
      } catch {
        setGames([]);
      } finally {
        setLoading(false);
      }
    };
    fetchGames();

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

  const createGame = async (userId: string, gameType: Game['game_type']) => {
    const boardMap: Record<string, any> = {
      'tic-tac-toe': ['','','','','','','','',''],
      'connect-four': Array(42).fill(''),
      'checkers': (() => {
        const b = Array(64).fill('');
        for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r * 8 + c] = 'r';
        for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r * 8 + c] = 'b';
        return b;
      })(),
      'chess': INITIAL_CHESS_BOARD,
      'darts': [],
      'battleship': [],
      'memory': [],
      'rock-paper-scissors': [],
      'ludo': [],
    };

    const gameDataMap: Record<string, any> = {
      'darts': { player_x_score: 301, player_o_score: 301, current_round: 1 },
      'battleship': { phase: 'placing' },
      'bowling': { player_x_frames: [], player_o_frames: [], current_roll: 1, first_roll_pins: null },
      'mini-golf': { player_x_holes: [], player_o_holes: [], current_hole: 0, current_strokes: 0, ball_position: 100 },
      'pool': { pocketed: [], player_x_type: null },
      'trivia': { current_question: 0, player_x_score: 0, player_o_score: 0, total_questions: 10 },
      'word-game': { guessed_letters: [], wrong_guesses: 0 },
      'chess': {},
      'ludo': { pieces: [[-1,-1,-1,-1], [-1,-1,-1,-1]], dice: 0, rolled: false, current_player: 0, finished: [] },
      'memory': { cards: generateMemoryBoard(), revealed: Array(16).fill(false), matched: Array(16).fill(false), player_x_score: 0, player_o_score: 0, first_pick: null },
      'rock-paper-scissors': { player_x_choice: null, player_o_choice: null, player_x_score: 0, player_o_score: 0, rounds: 0, max_rounds: 5, round_result: null },
      'table-soccer': { score_x: 0, score_o: 0, max_goals: 5 },
    };

    const { data, error } = await withTimeout(
      supabase
        .from('games')
        .insert({
          game_type: gameType as any,
          created_by: userId,
          player_x: userId,
          current_turn: userId,
          board: boardMap[gameType] || [],
          game_data: gameDataMap[gameType] || {},
        })
        .select()
        .single()
    );

    return { data: data as unknown as Game | null, error };
  };

  const joinGame = async (gameId: string, userId: string) => {
    const { error } = await withTimeout(
      supabase
        .from('games')
        .update({ player_o: userId, status: 'playing' as any })
        .eq('id', gameId)
    );
    return { error };
  };

  const deleteGame = async (gameId: string) => {
    const { error } = await withTimeout(supabase.from('games').delete().eq('id', gameId));
    return { error };
  };

  return { games, loading, createGame, joinGame, deleteGame };
}
