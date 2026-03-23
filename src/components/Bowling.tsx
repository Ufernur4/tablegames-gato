import { useState, useEffect, useRef, useCallback } from 'react';
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

const TOTAL_FRAMES = 5;
const PIN_POSITIONS = [
  [{ x: 50, y: 15 }],
  [{ x: 40, y: 30 }, { x: 60, y: 30 }],
  [{ x: 30, y: 45 }, { x: 50, y: 45 }, { x: 70, y: 45 }],
  [{ x: 20, y: 60 }, { x: 40, y: 60 }, { x: 60, y: 60 }, { x: 80, y: 60 }],
];

export function Bowling({ game: initialGame, userId, onLeave }: BowlingProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [isDragging, setIsDragging] = useState(false);
  const [ballX, setBallX] = useState(50);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartY, setDragStartY] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [ballAnim, setBallAnim] = useState<{ y: number; x: number } | null>(null);
  const [fallenPins, setFallenPins] = useState<number[]>([]);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const laneRef = useRef<HTMLDivElement>(null);

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const playerXFrames: number[] = gameData.player_x_frames || [];
  const playerOFrames: number[] = gameData.player_o_frames || [];
  const currentRoll = gameData.current_roll || 1;
  const firstRollPins = gameData.first_roll_pins ?? null;

  const myFrames = isPlayerX ? playerXFrames : playerOFrames;
  const opFrames = isPlayerX ? playerOFrames : playerXFrames;

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

  const allPins = PIN_POSITIONS.flat();
  const remainingPins = currentRoll === 2 ? 10 - (firstRollPins || 0) : 10;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMyTurn || game.winner || game.status !== 'playing' || isRolling) return;
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartY(e.clientY);
    setLastRoll(null);
    setFallenPins([]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    setBallX(Math.max(10, Math.min(90, 50 + dx * 0.3)));
  };

  const handlePointerUp = useCallback(async (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    const dy = e.clientY - dragStartY;
    if (dy > -20) { setBallX(50); return; } // Not a strong enough swipe

    setIsRolling(true);
    sounds.move();

    // Animate ball rolling up the lane
    const finalX = ballX;
    setBallAnim({ y: 90, x: finalX });

    setTimeout(() => {
      setBallAnim({ y: 10, x: finalX });
    }, 50);

    // After animation, calculate pins
    setTimeout(async () => {
      // Physics-based pin calculation: closer to center = more pins
      const accuracy = 1 - Math.abs(finalX - 50) / 50;
      const power = Math.min(Math.abs(dy) / 200, 1);
      const effectiveness = accuracy * 0.7 + power * 0.3;

      let pinsDown: number;
      if (currentRoll === 1) {
        if (effectiveness > 0.9) pinsDown = 10; // Strike zone
        else pinsDown = Math.min(10, Math.floor(effectiveness * 12));
      } else {
        const remaining = 10 - (firstRollPins || 0);
        if (effectiveness > 0.85) pinsDown = remaining;
        else pinsDown = Math.min(remaining, Math.floor(effectiveness * (remaining + 2)));
      }

      // Show fallen pins
      const fallen: number[] = [];
      const indices = Array.from({ length: 10 }, (_, i) => i);
      const shuffled = indices.sort(() => Math.random() - 0.5);
      for (let i = 0; i < pinsDown; i++) fallen.push(shuffled[i]);
      setFallenPins(fallen);
      setLastRoll(pinsDown);
      sounds.dice();

      if (pinsDown === 10 && currentRoll === 1) sounds.achievement();

      // Submit score after showing animation
      setTimeout(async () => {
        await submitRoll(pinsDown);
        setIsRolling(false);
        setBallAnim(null);
        setBallX(50);
      }, 800);
    }, 600);
  }, [isDragging, ballX, dragStartY, currentRoll, firstRollPins]);

  const submitRoll = async (pinsDown: number) => {
    const framesKey = isPlayerX ? 'player_x_frames' : 'player_o_frames';
    const currentFrames = isPlayerX ? playerXFrames : playerOFrames;

    if (currentRoll === 1) {
      if (pinsDown === 10) {
        const newFrames = [...currentFrames, 10];
        const newGameData = { ...gameData, [framesKey]: newFrames, current_roll: 1, first_roll_pins: null };
        const update: Record<string, unknown> = { game_data: newGameData, current_turn: isPlayerX ? game.player_o : game.player_x };
        const xF = isPlayerX ? newFrames : playerOFrames;
        const oF = isPlayerX ? playerOFrames : newFrames;
        if (xF.length >= TOTAL_FRAMES && oF.length >= TOTAL_FRAMES) {
          update.status = 'finished';
          const xT = xF.reduce((a, b) => a + b, 0), oT = oF.reduce((a, b) => a + b, 0);
          if (xT > oT) update.winner = game.player_x;
          else if (oT > xT) update.winner = game.player_o;
          else update.is_draw = true;
        }
        await supabase.from('games').update(update).eq('id', game.id);
      } else {
        await supabase.from('games').update({
          game_data: { ...gameData, current_roll: 2, first_roll_pins: pinsDown },
        }).eq('id', game.id);
      }
    } else {
      const frameTotal = (firstRollPins || 0) + pinsDown;
      const newFrames = [...currentFrames, frameTotal];
      const newGameData = { ...gameData, [framesKey]: newFrames, current_roll: 1, first_roll_pins: null };
      const update: Record<string, unknown> = { game_data: newGameData, current_turn: isPlayerX ? game.player_o : game.player_x };
      const xF = isPlayerX ? newFrames : playerOFrames;
      const oF = isPlayerX ? playerOFrames : newFrames;
      if (xF.length >= TOTAL_FRAMES && oF.length >= TOTAL_FRAMES) {
        update.status = 'finished';
        const xT = xF.reduce((a, b) => a + b, 0), oT = oF.reduce((a, b) => a + b, 0);
        if (xT > oT) update.winner = game.player_x;
        else if (oT > xT) update.winner = game.player_o;
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
    setFallenPins([]); setLastRoll(null);
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
      return '↑ Wische die Kugel nach oben!';
    }
    return 'Gegner wirft…';
  };

  const renderFrames = (frames: number[], label: string, isMe: boolean) => (
    <div className={`game-card ${isMe ? 'border-primary/30' : ''}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <div className="flex gap-1">
        {Array.from({ length: TOTAL_FRAMES }).map((_, i) => (
          <div key={i} className={`flex-1 text-center rounded-lg py-2 ${i < frames.length ? 'bg-secondary' : 'bg-secondary/30'}`}>
            <p className="text-xs font-bold tabular-nums">
              {i < frames.length ? (frames[i] === 10 ? 'X' : frames[i]) : '-'}
            </p>
          </div>
        ))}
        <div className="flex-1 text-center rounded-lg py-2 bg-primary/15">
          <p className="text-xs font-bold text-primary tabular-nums">{frames.reduce((a, b) => a + b, 0)}</p>
        </div>
      </div>
    </div>
  );

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
        <main className="flex-1 flex flex-col items-center p-4 gap-3 overflow-y-auto">
          {/* Scores */}
          <div className="w-full max-w-md space-y-2 animate-fade-in-up">
            {renderFrames(myFrames, 'Du', true)}
            {renderFrames(opFrames, 'Gegner', false)}
          </div>

          {/* Status */}
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

          {/* Last roll */}
          {lastRoll !== null && (
            <div className={`text-xl font-bold animate-scale-in ${lastRoll === 10 ? 'text-primary' : 'text-foreground'}`}>
              {lastRoll === 10 ? '🎳 STRIKE!' : lastRoll === 0 ? 'Daneben!' : `${lastRoll} Pins!`}
            </div>
          )}

          {/* Bowling Lane */}
          {game.status === 'playing' && !game.winner && (
            <div
              ref={laneRef}
              className="relative w-full max-w-[200px] aspect-[1/2] rounded-xl overflow-hidden touch-none select-none"
              style={{
                background: 'linear-gradient(180deg, hsl(30,30%,25%) 0%, hsl(30,40%,35%) 50%, hsl(30,40%,30%) 100%)',
                boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.4)',
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* Lane markings */}
              <div className="absolute inset-x-[10%] top-0 bottom-0 border-x border-amber-900/30" />
              <div className="absolute inset-x-[30%] top-0 bottom-0 border-x border-amber-900/20" />
              {/* Gutter indicators */}
              <div className="absolute left-0 top-0 bottom-0 w-[8%] bg-black/30 rounded-l-xl" />
              <div className="absolute right-0 top-0 bottom-0 w-[8%] bg-black/30 rounded-r-xl" />

              {/* Pins */}
              {allPins.map((pin, idx) => {
                const isFallen = fallenPins.includes(idx);
                const isStanding = idx < remainingPins && !isFallen;
                return (
                  <div
                    key={idx}
                    className={`absolute transition-all duration-500 ${isFallen ? 'opacity-0 scale-0 rotate-45' : ''}`}
                    style={{
                      left: `${pin.x}%`,
                      top: `${pin.y * 0.35 + 5}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                      isStanding ? 'bg-white shadow-lg shadow-white/20' : 'bg-muted/20'
                    }`}>
                      {isStanding ? '▼' : ''}
                    </div>
                  </div>
                );
              })}

              {/* Bowling Ball */}
              {!ballAnim && isMyTurn && (
                <div
                  className="absolute transition-all duration-75 pointer-events-none"
                  style={{
                    left: `${ballX}%`,
                    bottom: '8%',
                    transform: 'translate(-50%, 0)',
                  }}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-900 shadow-xl shadow-indigo-500/30 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 relative">
                      <div className="absolute -top-1 -left-2 w-1 h-1 rounded-full bg-indigo-400/50" />
                      <div className="absolute top-1 -left-1 w-1 h-1 rounded-full bg-indigo-400/50" />
                    </div>
                  </div>
                </div>
              )}

              {/* Ball rolling animation */}
              {ballAnim && (
                <div
                  className="absolute pointer-events-none transition-all duration-500 ease-out"
                  style={{
                    left: `${ballAnim.x}%`,
                    top: `${ballAnim.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-900 shadow-xl animate-spin" />
                </div>
              )}

              {/* Swipe instruction */}
              {isMyTurn && !isDragging && !isRolling && (
                <div className="absolute bottom-1 left-0 right-0 text-center">
                  <p className="text-[9px] text-amber-200/60 animate-pulse">↑ Wische nach oben</p>
                </div>
              )}
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
