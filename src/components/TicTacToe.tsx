import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Trophy, Minus } from 'lucide-react';

interface TicTacToeProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6],         // diags
];

export function TicTacToe({ game: initialGame, userId, onLeave }: TicTacToeProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [error, setError] = useState('');

  const board = Array.isArray(game.board) ? game.board : ['','','','','','','','',''];
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const symbol = isPlayerX ? 'X' : 'O';

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${initialGame.id}`,
      }, (payload) => {
        setGame(payload.new as unknown as Game);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  const checkWinner = (b: string[]): string | null => {
    for (const [a, bIdx, c] of WIN_LINES) {
      if (b[a] && b[a] === b[bIdx] && b[a] === b[c]) return b[a];
    }
    return null;
  };

  const handleMove = async (index: number) => {
    if (!isMyTurn || board[index] || game.status !== 'playing' || game.winner) return;

    const newBoard = [...board];
    newBoard[index] = symbol;

    const winner = checkWinner(newBoard);
    const isDraw = !winner && newBoard.every(cell => cell !== '');

    const update: Record<string, unknown> = {
      board: newBoard,
      current_turn: isPlayerX ? game.player_o : game.player_x,
    };

    if (winner) {
      update.winner = userId;
      update.status = 'finished';
    } else if (isDraw) {
      update.is_draw = true;
      update.status = 'finished';
    }

    const { error: err } = await supabase
      .from('games')
      .update(update)
      .eq('id', game.id);

    if (err) setError(err.message);
  };

  const handleReset = async () => {
    const { error: err } = await supabase
      .from('games')
      .update({
        board: ['','','','','','','','',''],
        winner: null,
        is_draw: false,
        status: 'playing' as any,
        current_turn: game.player_x,
      })
      .eq('id', game.id);

    if (err) setError(err.message);
  };

  const handleLeave = async () => {
    // If we're the only player, delete the game
    const otherPlayer = isPlayerX ? game.player_o : game.player_x;
    if (!otherPlayer) {
      await supabase.from('games').delete().eq('id', game.id);
    } else {
      await supabase.from('games').update({
        status: 'finished' as any,
        [isPlayerX ? 'player_x' : 'player_o']: null,
      }).eq('id', game.id);
    }
    onLeave();
  };

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '🎉 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (game.is_draw) return 'Unentschieden!';
    if (isMyTurn) return `Dein Zug (${symbol})`;
    return 'Zug des Gegners…';
  };

  const getWinningLine = (): number[] | null => {
    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
    }
    return null;
  };

  const winLine = getWinningLine();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Tic-Tac-Toe</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {game.id.slice(0, 8)}
        </span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          {/* Status */}
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
          <div className="grid grid-cols-3 gap-2 w-full max-w-[280px] aspect-square animate-fade-in-up">
            {board.map((cell, i) => (
              <button
                key={i}
                onClick={() => handleMove(i)}
                disabled={!isMyTurn || !!cell || game.status !== 'playing' || !!game.winner}
                className={`
                  aspect-square rounded-xl text-3xl font-bold
                  flex items-center justify-center
                  transition-all duration-200 ease-out
                  active:scale-95
                  ${!cell && isMyTurn && game.status === 'playing' && !game.winner
                    ? 'bg-secondary hover:bg-secondary/80 cursor-pointer hover:border-primary/30 border border-transparent'
                    : 'bg-secondary/60 border border-transparent'}
                  ${winLine?.includes(i) ? 'bg-primary/20 border-primary/40 glow-primary-sm' : ''}
                  ${cell === 'X' ? 'text-primary' : 'text-foreground/70'}
                `}
              >
                {cell}
              </button>
            ))}
          </div>

          {/* Game over actions */}
          {game.status === 'finished' && (
            <div className="flex gap-2 animate-fade-in-up">
              <Button onClick={handleReset} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Neue Runde
              </Button>
              <Button variant="secondary" onClick={handleLeave}>
                Zur Lobby
              </Button>
            </div>
          )}

          {/* Waiting state */}
          {game.status === 'waiting' && (
            <div className="text-center animate-fade-in space-y-2">
              <p className="text-sm text-muted-foreground">
                Teile diese Spiel-ID mit einem Freund:
              </p>
              <code className="block bg-secondary rounded-lg px-4 py-2 text-xs font-mono text-foreground select-all">
                {game.id}
              </code>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive animate-fade-in max-w-sm">
              {error}
            </div>
          )}
        </main>

        {/* In-game chat */}
        {game.status !== 'waiting' && (
          <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-border h-48 lg:h-auto flex flex-col bg-card/30">
            <ChatPanel userId={userId} gameId={game.id} title="Spiel Chat" />
          </aside>
        )}
      </div>
    </div>
  );
}
