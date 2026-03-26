import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion } from 'framer-motion';

interface ReversiProps { game: Game; userId: string; onLeave: () => void; }

const SIZE = 8;
const BOT_ID = '00000000-0000-0000-0000-000000000000';
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

type Cell = '' | 'B' | 'W';

function initBoard(): Cell[] {
  const b: Cell[] = Array(64).fill('');
  b[27] = 'W'; b[28] = 'B'; b[35] = 'B'; b[36] = 'W';
  return b;
}

function getFlips(board: Cell[], pos: number, color: Cell): number[] {
  if (board[pos] !== '') return [];
  const opp = color === 'B' ? 'W' : 'B';
  const r = Math.floor(pos / SIZE), c = pos % SIZE;
  const flips: number[] = [];
  for (const [dr, dc] of DIRS) {
    const line: number[] = [];
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
      const idx = nr * SIZE + nc;
      if (board[idx] === opp) line.push(idx);
      else if (board[idx] === color) { flips.push(...line); break; }
      else break;
      nr += dr; nc += dc;
    }
  }
  return flips;
}

function getValidMoves(board: Cell[], color: Cell): number[] {
  return Array.from({ length: 64 }, (_, i) => i).filter(i => getFlips(board, i, color).length > 0);
}

function countPieces(board: Cell[]) {
  let b = 0, w = 0;
  board.forEach(c => { if (c === 'B') b++; if (c === 'W') w++; });
  return { b, w };
}

export function Reversi({ game: initialGame, userId, onLeave }: ReversiProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [lastFlipped, setLastFlipped] = useState<Set<number>>(new Set());

  const board = (Array.isArray(game.board) ? game.board : initBoard()) as Cell[];
  const isPlayerX = game.player_x === userId;
  const myColor: Cell = isPlayerX ? 'B' : 'W';
  const isMyTurn = game.current_turn === userId;
  const isBotGame = game.player_o === BOT_ID;
  const validMoves = isMyTurn ? getValidMoves(board, myColor) : [];
  const counts = countPieces(board);

  useEffect(() => {
    const ch = supabase.channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (p) => setGame(p.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [initialGame.id]);

  const makeMove = async (pos: number) => {
    if (!isMyTurn || game.status !== 'playing' || game.winner) return;
    const flips = getFlips(board, pos, myColor);
    if (flips.length === 0) return;

    sounds.click();
    const nb = [...board] as Cell[];
    nb[pos] = myColor;
    flips.forEach(i => nb[i] = myColor);
    setLastFlipped(new Set([pos, ...flips]));

    const oppColor: Cell = myColor === 'B' ? 'W' : 'B';
    const oppMoves = getValidMoves(nb, oppColor);
    const myMoves = getValidMoves(nb, myColor);

    const u: Record<string, unknown> = { board: nb };
    if (oppMoves.length > 0) {
      u.current_turn = game.player_o;
    } else if (myMoves.length > 0) {
      u.current_turn = userId; // opponent passes
    } else {
      // game over
      const c = countPieces(nb);
      u.status = 'finished';
      if (c.b > c.w) u.winner = game.player_x;
      else if (c.w > c.b) u.winner = game.player_o;
      else u.is_draw = true;
    }

    await supabase.from('games').update(u).eq('id', game.id);
  };

  const handleLeave = async () => {
    await supabase.from('games').update({ status: 'finished' as any, winner: game.player_o }).eq('id', game.id);
    onLeave();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/30 px-4 py-2.5 flex items-center justify-between bg-card/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground h-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-bold">⚫ Reversi</span>
        </div>
        <div className="flex items-center gap-3 text-sm font-bold">
          <span>⚫ {counts.b}</span>
          <span>⚪ {counts.w}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        {/* Status */}
        <div className="text-center">
          {game.winner ? (
            <p className="text-lg font-black text-primary">
              {game.winner === userId ? '🏆 Gewonnen!' : '😢 Verloren!'}
            </p>
          ) : game.is_draw ? (
            <p className="text-lg font-black text-muted-foreground">🤝 Unentschieden!</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isMyTurn ? `Du bist dran (${myColor === 'B' ? '⚫' : '⚪'})` : 'Gegner denkt…'}
            </p>
          )}
        </div>

        {/* Board */}
        <div className="rounded-xl overflow-hidden border-2 border-border/30"
          style={{ boxShadow: '0 0 30px rgba(0,0,0,0.4)' }}>
          <div className="grid grid-cols-8 gap-0" style={{ width: 320, height: 320 }}>
            {board.map((cell, i) => {
              const isValid = validMoves.includes(i);
              const wasFlipped = lastFlipped.has(i);
              return (
                <button key={i} onClick={() => isValid && makeMove(i)}
                  className={`w-10 h-10 flex items-center justify-center relative transition-all
                    ${(Math.floor(i/8) + i%8) % 2 === 0 ? 'bg-green-700' : 'bg-green-800'}
                    ${isValid ? 'cursor-pointer' : 'cursor-default'}`}
                  style={{ borderRight: '1px solid rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(0,0,0,0.2)' }}
                >
                  {isValid && !cell && (
                    <div className="absolute w-3 h-3 rounded-full bg-primary/30 animate-pulse" />
                  )}
                  {cell && (
                    <motion.div
                      initial={wasFlipped ? { scale: 0, rotateY: 180 } : { scale: 1 }}
                      animate={{ scale: 1, rotateY: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`w-8 h-8 rounded-full ${cell === 'B' ? 'bg-gray-900' : 'bg-white'}`}
                      style={{
                        boxShadow: cell === 'B'
                          ? 'inset -2px -2px 4px rgba(255,255,255,0.1), 2px 2px 4px rgba(0,0,0,0.5)'
                          : 'inset -2px -2px 4px rgba(0,0,0,0.1), 2px 2px 4px rgba(0,0,0,0.3)',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {(game.winner || game.is_draw) && (
          <Button onClick={handleLeave} className="font-bold gap-2">
            <ArrowLeft className="w-4 h-4" /> Zurück zur Lobby
          </Button>
        )}
      </main>
    </div>
  );
}
