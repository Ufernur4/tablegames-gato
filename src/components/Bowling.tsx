import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface BowlingProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const TOTAL_FRAMES = 5; // Simplified 5-frame bowling

export function Bowling({ game: initialGame, userId, onLeave }: BowlingProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [error, setError] = useState('');

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const playerXFrames: number[] = gameData.player_x_frames || [];
  const playerOFrames: number[] = gameData.player_o_frames || [];
  const currentRoll = gameData.current_roll || 1; // 1 or 2 within a frame
  const firstRollPins = gameData.first_roll_pins ?? null;

  const myFrames = isPlayerX ? playerXFrames : playerOFrames;
  const opFrames = isPlayerX ? playerOFrames : playerXFrames;
  const myTotal = myFrames.reduce((a: number, b: number) => a + b, 0);
  const opTotal = opFrames.reduce((a: number, b: number) => a + b, 0);

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

  const handleRoll = async () => {
    if (!isMyTurn || game.winner || game.status !== 'playing') return;

    let pinsDown: number;
    if (currentRoll === 1) {
      // First roll: random 0-10
      pinsDown = Math.floor(Math.random() * 11);
    } else {
      // Second roll: remaining pins
      const remaining = 10 - (firstRollPins || 0);
      pinsDown = Math.floor(Math.random() * (remaining + 1));
    }

    const framesKey = isPlayerX ? 'player_x_frames' : 'player_o_frames';
    const currentFrames = isPlayerX ? playerXFrames : playerOFrames;

    if (currentRoll === 1) {
      if (pinsDown === 10) {
        // Strike - frame done
        const newFrames = [...currentFrames, 10];
        const newGameData = {
          ...gameData,
          [framesKey]: newFrames,
          current_roll: 1,
          first_roll_pins: null,
        };

        const update: Record<string, unknown> = {
          game_data: newGameData,
          current_turn: isPlayerX ? game.player_o : game.player_x,
        };

        // Check if game is over
        const xFrames = isPlayerX ? newFrames : playerOFrames;
        const oFrames = isPlayerX ? playerOFrames : newFrames;
        if (xFrames.length >= TOTAL_FRAMES && oFrames.length >= TOTAL_FRAMES) {
          const xTotal = xFrames.reduce((a, b) => a + b, 0);
          const oTotal = oFrames.reduce((a, b) => a + b, 0);
          update.status = 'finished';
          if (xTotal > oTotal) update.winner = game.player_x;
          else if (oTotal > xTotal) update.winner = game.player_o;
          else update.is_draw = true;
        }

        await supabase.from('games').update(update).eq('id', game.id);
      } else {
        // Save first roll, stay on same player for second roll
        await supabase.from('games').update({
          game_data: { ...gameData, current_roll: 2, first_roll_pins: pinsDown },
        }).eq('id', game.id);
      }
    } else {
      // Second roll - frame done
      const frameTotal = (firstRollPins || 0) + pinsDown;
      const newFrames = [...currentFrames, frameTotal];
      const newGameData = {
        ...gameData,
        [framesKey]: newFrames,
        current_roll: 1,
        first_roll_pins: null,
      };

      const update: Record<string, unknown> = {
        game_data: newGameData,
        current_turn: isPlayerX ? game.player_o : game.player_x,
      };

      const xFrames = isPlayerX ? newFrames : playerOFrames;
      const oFrames = isPlayerX ? playerOFrames : newFrames;
      if (xFrames.length >= TOTAL_FRAMES && oFrames.length >= TOTAL_FRAMES) {
        const xTotal = xFrames.reduce((a, b) => a + b, 0);
        const oTotal = oFrames.reduce((a, b) => a + b, 0);
        update.status = 'finished';
        if (xTotal > oTotal) update.winner = game.player_x;
        else if (oTotal > xTotal) update.winner = game.player_o;
        else update.is_draw = true;
      }

      await supabase.from('games').update(update).eq('id', game.id);
    }
  };

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { player_x_frames: [], player_o_frames: [], current_roll: 1, first_roll_pins: null },
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
    if (game.winner === userId) return '🎳 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (game.is_draw) return 'Unentschieden!';
    if (isMyTurn) {
      if (currentRoll === 2) return `Zweiter Wurf! (${firstRollPins} Pins)`;
      return 'Dein Wurf!';
    }
    return 'Gegner wirft…';
  };

  const renderFrames = (frames: number[], label: string, isMe: boolean) => (
    <div className={`game-card ${isMe ? 'border-primary/30' : ''}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <div className="flex gap-1">
        {Array.from({ length: TOTAL_FRAMES }).map((_, i) => (
          <div key={i} className={`flex-1 text-center rounded-lg py-2 ${
            i < frames.length ? 'bg-secondary' : 'bg-secondary/30'
          }`}>
            <p className="text-xs font-bold tabular-nums">
              {i < frames.length ? (frames[i] === 10 ? 'X' : frames[i]) : '-'}
            </p>
          </div>
        ))}
        <div className="flex-1 text-center rounded-lg py-2 bg-primary/15">
          <p className="text-xs font-bold text-primary tabular-nums">
            {frames.reduce((a, b) => a + b, 0)}
          </p>
        </div>
      </div>
    </div>
  );

  // Visual pins
  const remainingPins = currentRoll === 2 ? 10 - (firstRollPins || 0) : 10;
  const pinRows = [[0], [1, 2], [3, 4, 5], [6, 7, 8, 9]];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Bowling</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          <div className="w-full max-w-md space-y-2 animate-fade-in-up">
            {renderFrames(isPlayerX ? playerXFrames : playerOFrames, 'Du', true)}
            {renderFrames(isPlayerX ? playerOFrames : playerXFrames, 'Gegner', false)}
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

          {/* Pins visualization */}
          {game.status === 'playing' && !game.winner && (
            <div className="animate-fade-in-up space-y-3">
              <div className="flex flex-col items-center gap-1">
                {pinRows.map((row, ri) => (
                  <div key={ri} className="flex gap-1">
                    {row.map(pin => (
                      <div
                        key={pin}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-all
                          ${pin < remainingPins ? 'bg-foreground text-background' : 'bg-secondary/30 text-muted-foreground/30'}
                        `}
                      >
                        {pin < remainingPins ? '🎳' : '·'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <Button
                onClick={handleRoll}
                disabled={!isMyTurn}
                className="w-full max-w-xs gap-2"
              >
                🎳 Werfen!
              </Button>
            </div>
          )}

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
