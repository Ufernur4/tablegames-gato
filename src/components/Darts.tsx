import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface DartsProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const DART_SECTIONS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export function Darts({ game: initialGame, userId, onLeave }: DartsProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [scoreInput, setScoreInput] = useState('');
  const [error, setError] = useState('');

  const gameData = (game.game_data || {}) as Record<string, any>;
  const playerXScore = gameData.player_x_score ?? 301;
  const playerOScore = gameData.player_o_score ?? 301;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;

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

  const throwDart = async (points: number) => {
    if (!isMyTurn || game.status !== 'playing' || game.winner) return;
    setError('');
    sounds.move();

    const currentScore = isPlayerX ? playerXScore : playerOScore;
    const newScore = currentScore - points;

    if (newScore < 0) {
      setError('Punktzahl zu hoch! Du kannst nicht unter 0 gehen.');
      sounds.invalid();
      return;
    }

    const newGameData = {
      ...gameData,
      [isPlayerX ? 'player_x_score' : 'player_o_score']: newScore,
      current_round: (gameData.current_round || 1) + (isPlayerX ? 0 : 1),
    };

    const update: Record<string, unknown> = {
      game_data: newGameData,
      current_turn: isPlayerX ? game.player_o : game.player_x,
    };

    if (newScore === 0) {
      update.winner = userId;
      update.status = 'finished';
      sounds.win();
    }

    if (points === 50) sounds.achievement();
    else if (points >= 25) sounds.coinEarn();

    const { error: err } = await supabase
      .from('games')
      .update(update)
      .eq('id', game.id);

    if (err) setError(err.message);
    setScoreInput('');
  };

  const handleCustomScore = () => {
    const points = parseInt(scoreInput, 10);
    if (isNaN(points) || points < 0 || points > 180) {
      setError('Ungültige Punktzahl (0-180).');
      return;
    }
    throwDart(points);
  };

  const handleReset = async () => {
    const { error: err } = await supabase
      .from('games')
      .update({
        game_data: { player_x_score: 301, player_o_score: 301, current_round: 1 },
        winner: null,
        is_draw: false,
        status: 'playing' as any,
        current_turn: game.player_x,
      })
      .eq('id', game.id);
    if (err) setError(err.message);
  };

  const handleLeave = async () => {
    const otherPlayer = isPlayerX ? game.player_o : game.player_x;
    if (!otherPlayer) {
      await supabase.from('games').delete().eq('id', game.id);
    } else {
      await supabase.from('games').update({
        status: 'finished' as any,
      }).eq('id', game.id);
    }
    onLeave();
  };

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '🎯 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (isMyTurn) return 'Dein Wurf!';
    return 'Gegner wirft…';
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Darts – 301</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          {/* Scores */}
          <div className="flex gap-4 w-full max-w-md animate-fade-in-up">
            <div className={`flex-1 game-card text-center ${isPlayerX ? 'border-primary/30' : ''}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Spieler X {isPlayerX && '(Du)'}
              </p>
              <p className="text-3xl font-bold text-foreground tabular-nums">{playerXScore}</p>
            </div>
            <div className={`flex-1 game-card text-center ${!isPlayerX ? 'border-primary/30' : ''}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Spieler O {!isPlayerX && '(Du)'}
              </p>
              <p className="text-3xl font-bold text-foreground tabular-nums">{playerOScore}</p>
            </div>
          </div>

          {/* Status */}
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            isMyTurn ? 'bg-primary/10 text-primary animate-pulse-glow' :
            'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Dart board (simplified - quick buttons) */}
          {game.status === 'playing' && !game.winner && (
            <div className="w-full max-w-md space-y-3 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
              <p className="text-xs text-muted-foreground text-center">Schnellauswahl</p>
              <div className="grid grid-cols-5 gap-1.5">
                {DART_SECTIONS.map(num => (
                  <button
                    key={num}
                    onClick={() => throwDart(num)}
                    disabled={!isMyTurn}
                    className={`
                      h-10 rounded-lg text-sm font-medium transition-all duration-150
                      active:scale-95
                      ${isMyTurn
                        ? 'bg-secondary hover:bg-primary/15 hover:text-primary cursor-pointer'
                        : 'bg-secondary/50 text-muted-foreground cursor-not-allowed'}
                    `}
                  >
                    {num}
                  </button>
                ))}
              </div>

              <div className="flex gap-1.5">
                <button
                  onClick={() => throwDart(25)}
                  disabled={!isMyTurn}
                  className="flex-1 h-10 rounded-lg text-sm font-medium bg-secondary hover:bg-primary/15 hover:text-primary transition-all active:scale-95 disabled:opacity-50"
                >
                  Single Bull (25)
                </button>
                <button
                  onClick={() => throwDart(50)}
                  disabled={!isMyTurn}
                  className="flex-1 h-10 rounded-lg text-sm font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-all active:scale-95 disabled:opacity-50"
                >
                  Bull's Eye (50)
                </button>
              </div>

              <div className="flex gap-2">
                <Input
                  type="number"
                  value={scoreInput}
                  onChange={e => setScoreInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCustomScore()}
                  placeholder="Punkte eingeben (0-180)"
                  min={0}
                  max={180}
                  disabled={!isMyTurn}
                  className="bg-secondary border-border text-sm"
                />
                <Button onClick={handleCustomScore} disabled={!isMyTurn} size="sm">
                  Werfen
                </Button>
              </div>
            </div>
          )}

          {/* Waiting state */}
          {game.status === 'waiting' && (
            <div className="text-center animate-fade-in space-y-2">
              <p className="text-sm text-muted-foreground">Teile diese Spiel-ID:</p>
              <code className="block bg-secondary rounded-lg px-4 py-2 text-xs font-mono text-foreground select-all">
                {game.id}
              </code>
            </div>
          )}

          {/* Game over */}
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

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive animate-fade-in max-w-sm">
              {error}
            </div>
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
