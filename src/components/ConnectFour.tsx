import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Trophy, Minus } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface ConnectFourProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const ROWS = 6;
const COLS = 7;

/** Create an empty 6x7 board (stored as flat array of 42 strings) */
const emptyBoard = (): string[] => Array(ROWS * COLS).fill('');

/** Get cell value at (row, col) from flat board */
const cell = (board: string[], r: number, c: number) => board[r * COLS + c];

/** Find the lowest empty row in a column, or -1 if full */
const lowestEmptyRow = (board: string[], col: number): number => {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!cell(board, r, col)) return r;
  }
  return -1;
};

/** Check for a winner – returns 'X' | 'O' | null */
const checkWinner = (board: string[]): string | null => {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = cell(board, r, c);
      if (!v) continue;
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (cell(board, nr, nc) === v) count++;
          else break;
        }
        if (count >= 4) return v;
      }
    }
  }
  return null;
};

/** Get winning cells for highlighting */
const getWinningCells = (board: string[]): number[] => {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = cell(board, r, c);
      if (!v) continue;
      for (const [dr, dc] of directions) {
        const cells = [r * COLS + c];
        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (cell(board, nr, nc) === v) cells.push(nr * COLS + nc);
          else break;
        }
        if (cells.length >= 4) return cells;
      }
    }
  }
  return [];
};

export function ConnectFour({ game: initialGame, userId, onLeave }: ConnectFourProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [error, setError] = useState('');
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const board = Array.isArray(game.board) && game.board.length === 42
    ? (game.board as string[])
    : emptyBoard();
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const symbol = isPlayerX ? 'X' : 'O';

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'games',
        filter: `id=eq.${initialGame.id}`,
      }, (payload) => setGame(payload.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  const handleDrop = async (col: number) => {
    if (!isMyTurn || game.status !== 'playing' || game.winner) return;
    const row = lowestEmptyRow(board, col);
    if (row === -1) return;

    const newBoard = [...board];
    newBoard[row * COLS + col] = symbol;

    const winner = checkWinner(newBoard);
    const isDraw = !winner && newBoard.every(c => c !== '');

    const update: Record<string, unknown> = {
      board: newBoard,
      current_turn: isPlayerX ? game.player_o : game.player_x,
    };
    if (winner) { update.winner = userId; update.status = 'finished'; }
    else if (isDraw) { update.is_draw = true; update.status = 'finished'; }

    const { error: err } = await supabase.from('games').update(update).eq('id', game.id);
    if (err) setError(err.message);
  };

  const handleReset = async () => {
    const { error: err } = await supabase.from('games').update({
      board: emptyBoard(), winner: null, is_draw: false,
      status: 'playing' as any, current_turn: game.player_x,
    }).eq('id', game.id);
    if (err) setError(err.message);
  };

  const handleLeave = async () => {
    const otherPlayer = isPlayerX ? game.player_o : game.player_x;
    if (!otherPlayer) {
      await supabase.from('games').delete().eq('id', game.id);
    } else {
      await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    }
    onLeave();
  };

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '🎉 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (game.is_draw) return 'Unentschieden!';
    if (isMyTurn) return `Dein Zug (${symbol === 'X' ? '🔴' : '🟡'})`;
    return 'Zug des Gegners…';
  };

  const winCells = getWinningCells(board);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Vier Gewinnt</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            game.is_draw ? 'bg-secondary text-muted-foreground' :
            isMyTurn ? 'bg-primary/10 text-primary animate-pulse-glow' :
            'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && (game.winner === userId ? <Trophy className="w-4 h-4 inline mr-1" /> : null)}
            {game.is_draw && <Minus className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Board */}
          <div className="bg-[hsl(220,60%,30%)] rounded-2xl p-2 shadow-lg animate-fade-in-up">
            {/* Column hover indicators */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {Array.from({ length: COLS }).map((_, c) => (
                <div
                  key={c}
                  className={`h-6 flex items-center justify-center transition-opacity ${
                    hoverCol === c && isMyTurn ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full ${symbol === 'X' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: ROWS }).map((_, r) =>
                Array.from({ length: COLS }).map((_, c) => {
                  const idx = r * COLS + c;
                  const v = board[idx];
                  const isWin = winCells.includes(idx);
                  return (
                    <button
                      key={idx}
                      onClick={() => handleDrop(c)}
                      onMouseEnter={() => setHoverCol(c)}
                      onMouseLeave={() => setHoverCol(null)}
                      disabled={!isMyTurn || game.status !== 'playing' || !!game.winner}
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-all duration-200
                        ${!v ? 'bg-[hsl(225,15%,10%)]' : ''}
                        ${v === 'X' ? 'bg-red-500' : v === 'O' ? 'bg-yellow-400' : ''}
                        ${isWin ? 'ring-2 ring-white scale-110' : ''}
                        ${!v && isMyTurn && game.status === 'playing' ? 'cursor-pointer hover:bg-[hsl(225,15%,15%)]' : ''}
                        active:scale-95
                      `}
                    />
                  );
                })
              )}
            </div>
          </div>

          {game.status === 'finished' && (
            <div className="flex gap-2 animate-fade-in-up">
              <Button onClick={handleReset} className="gap-2"><RotateCcw className="w-4 h-4" /> Neue Runde</Button>
              <Button variant="secondary" onClick={handleLeave}>Zur Lobby</Button>
            </div>
          )}

          {game.status === 'waiting' && (
            <div className="text-center animate-fade-in space-y-2">
              <p className="text-sm text-muted-foreground">Teile diese Spiel-ID:</p>
              <code className="block bg-secondary rounded-lg px-4 py-2 text-xs font-mono text-foreground select-all">{game.id}</code>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive animate-fade-in max-w-sm">{error}</div>
          )}
        </main>

        {game.status !== 'waiting' && (
          <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-border h-48 lg:h-auto flex flex-col bg-card/30">
            <ChatPanel userId={userId} gameId={game.id} title="Spiel Chat" />
          </aside>
        )}
      </div>
    </div>
  );
}
