import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';

interface MiniGolfProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const TOTAL_HOLES = 5;
const PAR = [3, 2, 4, 3, 2]; // Par for each hole

export function MiniGolf({ game: initialGame, userId, onLeave }: MiniGolfProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [power, setPower] = useState(50);
  const [error, setError] = useState('');

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const playerXScores: number[] = gameData.player_x_holes || [];
  const playerOScores: number[] = gameData.player_o_holes || [];
  const currentHole = gameData.current_hole ?? 0;
  const currentStrokes = gameData.current_strokes ?? 0;
  const ballPosition = gameData.ball_position ?? 0; // 0-100 distance to hole

  const myScores = isPlayerX ? playerXScores : playerOScores;
  const opScores = isPlayerX ? playerOScores : playerXScores;
  const myTotal = myScores.reduce((a: number, b: number) => a + b, 0);
  const opTotal = opScores.reduce((a: number, b: number) => a + b, 0);

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

  const handlePutt = async () => {
    if (!isMyTurn || game.winner || game.status !== 'playing') return;

    // Simulate putt: accuracy based on power (closer to ideal = better)
    const idealPower = 100 - (ballPosition || 100); // ideal power to reach hole
    const accuracy = Math.abs(power - idealPower);
    const newPosition = Math.max(0, (ballPosition || 100) - power + Math.floor(Math.random() * 20) - 10);
    const newStrokes = currentStrokes + 1;

    // Check if ball is in hole (position close to 0)
    const isInHole = newPosition <= 5 || newStrokes >= 6; // Max 6 strokes

    if (isInHole) {
      const framesKey = isPlayerX ? 'player_x_holes' : 'player_o_holes';
      const currentScores = isPlayerX ? playerXScores : playerOScores;
      const holeScore = Math.min(newStrokes, 6);
      const newScores = [...currentScores, holeScore];

      const nextHole = currentHole + (isPlayerX && playerOScores.length <= currentHole ? 0 : 1);
      const bothDone = isPlayerX
        ? newScores.length > currentHole && playerOScores.length > currentHole
        : playerXScores.length > currentHole && newScores.length > currentHole;

      const newGameData = {
        ...gameData,
        [framesKey]: newScores,
        current_hole: bothDone ? currentHole + 1 : currentHole,
        current_strokes: 0,
        ball_position: 100,
      };

      const update: Record<string, unknown> = {
        game_data: newGameData,
        current_turn: isPlayerX ? game.player_o : game.player_x,
      };

      // Check if all holes done
      const xDone = (isPlayerX ? newScores : playerXScores).length >= TOTAL_HOLES;
      const oDone = (isPlayerX ? playerOScores : newScores).length >= TOTAL_HOLES;
      if (xDone && oDone) {
        const xTotal = (isPlayerX ? newScores : playerXScores).reduce((a, b) => a + b, 0);
        const oTotal = (isPlayerX ? playerOScores : newScores).reduce((a, b) => a + b, 0);
        update.status = 'finished';
        if (xTotal < oTotal) update.winner = game.player_x; // Lower is better in golf
        else if (oTotal < xTotal) update.winner = game.player_o;
        else update.is_draw = true;
      }

      await supabase.from('games').update(update).eq('id', game.id);
    } else {
      // Ball moved but not in hole
      await supabase.from('games').update({
        game_data: {
          ...gameData,
          current_strokes: newStrokes,
          ball_position: newPosition,
        },
      }).eq('id', game.id);
    }
  };

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { player_x_holes: [], player_o_holes: [], current_hole: 0, current_strokes: 0, ball_position: 100 },
      winner: null, is_draw: false, status: 'playing' as any, current_turn: game.player_x,
    }).eq('id', game.id);
  };

  const handleLeave = async () => {
    const other = isPlayerX ? game.player_o : game.player_x;
    if (!other) await supabase.from('games').delete().eq('id', game.id);
    else await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    onLeave();
  };

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '⛳ Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (game.is_draw) return 'Unentschieden!';
    if (isMyTurn) return `Loch ${Math.min(currentHole + 1, TOTAL_HOLES)} – Schlag ${currentStrokes + 1}`;
    return 'Gegner puttet…';
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Mini Golf</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          {/* Scorecard */}
          <div className="w-full max-w-md animate-fade-in-up">
            <div className="game-card">
              <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                <div className="text-muted-foreground">Loch</div>
                {Array.from({ length: TOTAL_HOLES }).map((_, i) => (
                  <div key={i} className={`font-medium ${i === currentHole ? 'text-primary' : 'text-muted-foreground'}`}>
                    {i + 1}
                  </div>
                ))}
                <div className="text-primary font-bold">Σ</div>
                
                <div className="text-muted-foreground">Par</div>
                {PAR.map((p, i) => <div key={i} className="text-muted-foreground">{p}</div>)}
                <div className="text-muted-foreground">{PAR.reduce((a, b) => a + b, 0)}</div>

                <div className="text-foreground font-medium">Du</div>
                {Array.from({ length: TOTAL_HOLES }).map((_, i) => (
                  <div key={i} className="text-foreground font-medium">{myScores[i] ?? '-'}</div>
                ))}
                <div className="text-primary font-bold">{myTotal || '-'}</div>

                <div className="text-muted-foreground">Geg.</div>
                {Array.from({ length: TOTAL_HOLES }).map((_, i) => (
                  <div key={i} className="text-muted-foreground">{opScores[i] ?? '-'}</div>
                ))}
                <div className="text-muted-foreground font-medium">{opTotal || '-'}</div>
              </div>
            </div>
          </div>

          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            game.is_draw ? 'bg-secondary text-muted-foreground' :
            isMyTurn ? 'bg-primary/10 text-primary animate-pulse-glow' :
            'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Golf course visualization */}
          {game.status === 'playing' && !game.winner && (
            <div className="w-full max-w-md space-y-4 animate-fade-in-up">
              {/* Course */}
              <div className="relative h-16 bg-[hsl(140,40%,25%)] rounded-xl overflow-hidden">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-background border-2 border-foreground flex items-center justify-center text-[8px]">
                  ⛳
                </div>
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md transition-all duration-500"
                  style={{ left: `${Math.max(5, 100 - (ballPosition || 100))}%` }}
                />
              </div>

              {/* Power slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Schwach</span>
                  <span className="font-bold text-foreground">{power}%</span>
                  <span>Stark</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={power}
                  onChange={e => setPower(Number(e.target.value))}
                  disabled={!isMyTurn}
                  className="w-full accent-primary"
                />
              </div>

              <Button onClick={handlePutt} disabled={!isMyTurn} className="w-full gap-2">
                ⛳ Putten!
              </Button>
            </div>
          )}

          {game.status === 'finished' && (
            <div className="flex gap-2 animate-fade-in-up">
              <Button onClick={handleReset} className="gap-2"><RotateCcw className="w-4 h-4" /> Neues Spiel</Button>
              <Button variant="secondary" onClick={handleLeave}>Zur Lobby</Button>
            </div>
          )}

          {game.status === 'waiting' && (
            <div className="text-center animate-fade-in space-y-2">
              <p className="text-sm text-muted-foreground">Teile diese Spiel-ID:</p>
              <code className="block bg-secondary rounded-lg px-4 py-2 text-xs font-mono text-foreground select-all">{game.id}</code>
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
