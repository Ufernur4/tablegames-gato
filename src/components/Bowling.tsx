import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

interface BowlingProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const TOTAL_FRAMES = 5;

// Pin positions in SVG coordinates (lane width 200, pins area at top)
const PIN_LAYOUT: { x: number; y: number }[] = [
  // Row 1 (front)
  { x: 100, y: 55 },
  // Row 2
  { x: 88, y: 42 }, { x: 112, y: 42 },
  // Row 3
  { x: 76, y: 29 }, { x: 100, y: 29 }, { x: 124, y: 29 },
  // Row 4 (back)
  { x: 64, y: 16 }, { x: 88, y: 16 }, { x: 112, y: 16 }, { x: 136, y: 16 },
];

export function Bowling({ game: initialGame, userId, onLeave }: BowlingProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [isDragging, setIsDragging] = useState(false);
  const [ballX, setBallX] = useState(100); // SVG coordinates
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [spinAngle, setSpinAngle] = useState(0); // -1 to 1, left to right spin
  const [isRolling, setIsRolling] = useState(false);
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);
  const [fallenPins, setFallenPins] = useState<Set<number>>(new Set());
  const [pinFallAngles, setPinFallAngles] = useState<Record<number, number>>({});
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [showStrike, setShowStrike] = useState(false);
  const [showSpare, setShowSpare] = useState(false);
  const laneRef = useRef<SVGSVGElement>(null);

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const playerXFrames: number[] = gameData.player_x_frames || [];
  const playerOFrames: number[] = gameData.player_o_frames || [];
  const currentRoll = gameData.current_roll || 1;
  const firstRollPins = gameData.first_roll_pins ?? null;

  const myFrames = isPlayerX ? playerXFrames : playerOFrames;
  const opFrames = isPlayerX ? playerOFrames : playerXFrames;
  const myScore = myFrames.reduce((a: number, b: number) => a + b, 0);
  const opScore = opFrames.reduce((a: number, b: number) => a + b, 0);

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (payload) => setGame(payload.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  // Pins that are already down from first roll
  const previouslyFallen = currentRoll === 2 && firstRollPins != null
    ? new Set(Array.from({ length: firstRollPins }, (_, i) => i))
    : new Set<number>();

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMyTurn || isRolling || game.status !== 'playing' || game.winner) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragCurrent({ x: e.clientX, y: e.clientY });
    setSpinAngle(0);
    setLastRoll(null);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragCurrent({ x: e.clientX, y: e.clientY });
    // Horizontal movement = aim, subtle horizontal during forward swipe = spin
    const dx = e.clientX - dragStart.x;
    setBallX(Math.max(60, Math.min(140, 100 + dx * 0.3)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    const dy = e.clientY - dragStart.y;
    const dx = e.clientX - dragStart.x;

    // Need upward swipe
    if (dy > -30) return;

    const power = Math.min(Math.abs(dy) / 200, 1);
    // Spin from horizontal movement during the swipe
    const spin = Math.max(-1, Math.min(1, dx / 100));
    setSpinAngle(spin);

    // Animate ball rolling
    setIsRolling(true);
    sounds.move();

    // Simulate ball path with hook/spin
    const startX = ballX;
    const steps = 20;
    let currentX = startX;
    let currentY = 280; // start near bottom of SVG

    const rollInterval = setInterval(() => {
      currentY -= (280 - 10) / steps;
      // Apply spin curve (stronger as ball goes further)
      const progress = 1 - currentY / 280;
      currentX += spin * progress * 2;
      setBallPos({ x: currentX, y: currentY });

      if (currentY <= 60) {
        clearInterval(rollInterval);
        // Calculate pin hits
        const knockedDown = calculatePinHits(currentX, power, spin);
        animatePinFalls(knockedDown);
      }
    }, 30);
  };

  const calculatePinHits = (finalX: number, power: number, spin: number): Set<number> => {
    const knocked = new Set<number>();
    const maxPins = currentRoll === 2 ? 10 - (firstRollPins || 0) : 10;

    PIN_LAYOUT.forEach((pin, i) => {
      if (previouslyFallen.has(i)) return; // already down
      const dist = Math.abs(pin.x - finalX);
      // Hit if ball passes close to pin, with some randomness based on power
      const hitThreshold = 14 + power * 8;
      if (dist < hitThreshold) {
        // Closer pins more likely to fall
        if (Math.random() < (1 - dist / hitThreshold) * power + 0.2) {
          knocked.add(i);
        }
      }
    });

    // Chain reactions - pins hitting adjacent pins
    const knockedArray = Array.from(knocked);
    knockedArray.forEach(ki => {
      PIN_LAYOUT.forEach((pin, i) => {
        if (knocked.has(i) || previouslyFallen.has(i)) return;
        const kp = PIN_LAYOUT[ki];
        const d = Math.sqrt((pin.x - kp.x) ** 2 + (pin.y - kp.y) ** 2);
        if (d < 18 && Math.random() < 0.5 * power) {
          knocked.add(i);
        }
      });
    });

    return knocked;
  };

  const animatePinFalls = (knocked: Set<number>) => {
    const angles: Record<number, number> = {};
    knocked.forEach(i => {
      angles[i] = (Math.random() - 0.5) * 120; // random fall angle
    });
    setPinFallAngles(angles);
    setFallenPins(knocked);

    const pinsDown = knocked.size;
    setLastRoll(pinsDown);

    if (pinsDown >= 10 - (previouslyFallen.size)) {
      if (currentRoll === 1) {
        setShowStrike(true);
        sounds.achievement();
        setTimeout(() => setShowStrike(false), 2000);
      } else {
        setShowSpare(true);
        sounds.coinEarn();
        setTimeout(() => setShowSpare(false), 2000);
      }
    } else if (pinsDown > 0) {
      sounds.move();
    } else {
      sounds.invalid();
    }

    // Submit after animation
    setTimeout(() => {
      submitRoll(pinsDown);
      setIsRolling(false);
      setBallPos(null);
      setFallenPins(new Set());
      setPinFallAngles({});
      setBallX(100);
    }, 1200);
  };

  const submitRoll = async (pinsDown: number) => {
    if (!isMyTurn || game.status !== 'playing') return;

    const isStrike = currentRoll === 1 && pinsDown === 10;
    const isSecondRoll = currentRoll === 2;
    const frameComplete = isStrike || isSecondRoll;

    const totalPins = currentRoll === 2 ? (firstRollPins || 0) + pinsDown : pinsDown;
    const myKey = isPlayerX ? 'player_x_frames' : 'player_o_frames';
    const frames = [...(isPlayerX ? playerXFrames : playerOFrames)];

    if (frameComplete) frames.push(totalPins);

    const newGameData: Record<string, any> = {
      ...gameData,
      [myKey]: frames,
      current_roll: frameComplete ? 1 : 2,
      first_roll_pins: frameComplete ? null : pinsDown,
    };

    const update: Record<string, unknown> = { game_data: newGameData };

    if (frameComplete) {
      update.current_turn = isPlayerX ? game.player_o : game.player_x;
    }

    // Check game end
    const myTotalFrames = frames.length;
    const opTotalFrames = (isPlayerX ? playerOFrames : playerXFrames).length;
    if (myTotalFrames >= TOTAL_FRAMES && opTotalFrames >= TOTAL_FRAMES) {
      const myTotal = frames.reduce((a, b) => a + b, 0);
      const opTotal = (isPlayerX ? playerOFrames : playerXFrames).reduce((a, b) => a + b, 0);
      if (myTotal > opTotal) { update.winner = userId; update.status = 'finished'; sounds.win(); }
      else if (myTotal < opTotal) { update.winner = isPlayerX ? game.player_o : game.player_x; update.status = 'finished'; }
      else { update.is_draw = true; update.status = 'finished'; }
    }

    await supabase.from('games').update(update).eq('id', game.id);
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

  return (
    <div className="min-h-screen flex flex-col bg-background bg-orbs">
      <header className="border-b border-border px-4 py-2.5 flex items-center justify-between glass sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground h-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-bold text-foreground">🎳 Bowling</span>
        </div>
        <span className="text-[10px] text-muted-foreground">Frame {Math.min(myFrames.length + 1, TOTAL_FRAMES)}/{TOTAL_FRAMES}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative z-10">
        <main className="flex-1 flex flex-col items-center p-4 gap-3 overflow-y-auto">
          {/* Scores */}
          <div className="flex gap-3 w-full max-w-md">
            <motion.div animate={{ scale: isMyTurn ? 1.02 : 1 }}
              className={`flex-1 glass-card text-center p-3 ${isMyTurn ? 'neon-border' : ''}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Du</p>
              <p className="text-3xl font-extrabold text-foreground tabular-nums">{myScore}</p>
              <div className="flex justify-center gap-1 mt-1 flex-wrap">
                {myFrames.map((f: number, i: number) => (
                  <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${f === 10 ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                    {f === 10 ? 'X' : f}
                  </span>
                ))}
              </div>
            </motion.div>
            <div className="flex items-center text-muted-foreground text-xs font-bold">VS</div>
            <div className="flex-1 glass-card text-center p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Gegner</p>
              <p className="text-3xl font-extrabold text-foreground tabular-nums">{opScore}</p>
              <div className="flex justify-center gap-1 mt-1 flex-wrap">
                {opFrames.map((f: number, i: number) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                    {f === 10 ? 'X' : f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Status */}
          <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}
            className={`text-sm font-semibold px-5 py-2 rounded-full ${
              game.winner === userId ? 'bg-primary/15 text-primary glow-primary' :
              game.winner ? 'bg-destructive/15 text-destructive' :
              isMyTurn ? 'bg-primary/10 text-primary' : 'glass-card text-muted-foreground'
            }`}>
            {game.status === 'waiting' ? 'Warte auf Mitspieler…' :
             game.winner === userId ? '🎳 Du hast gewonnen!' :
             game.winner ? 'Du hast verloren.' :
             game.is_draw ? 'Unentschieden!' :
             isMyTurn ? (currentRoll === 1 ? '↑ Wische um zu werfen!' : '↑ 2. Wurf!') : 'Gegner wirft…'}
          </motion.div>

          {/* Strike / Spare overlay */}
          <AnimatePresence>
            {showStrike && (
              <motion.div initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, opacity: 0 }}
                className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                <div className="text-6xl font-black text-primary glow-neon-cyan">STRIKE! 🎳</div>
              </motion.div>
            )}
            {showSpare && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0 }}
                className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                <div className="text-5xl font-black text-neon-lime">SPARE! ✨</div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Last roll */}
          <AnimatePresence>
            {lastRoll !== null && (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                className={`text-xl font-extrabold ${lastRoll === 10 ? 'text-primary glow-neon-cyan' : lastRoll === 0 ? 'text-destructive' : 'text-foreground'}`}>
                {lastRoll === 10 ? 'STRIKE! 🎳' : lastRoll === 0 ? 'Gutter Ball 😢' : `${lastRoll} Pins!`}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bowling Lane SVG */}
          {game.status === 'playing' && !game.winner && (
            <div className="relative w-full max-w-[280px] touch-none select-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}>

              <svg ref={laneRef} viewBox="0 0 200 320" className="w-full"
                style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5))' }}>
                {/* Lane background */}
                <defs>
                  <linearGradient id="lane-wood" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(30, 40%, 25%)" />
                    <stop offset="20%" stopColor="hsl(30, 45%, 35%)" />
                    <stop offset="50%" stopColor="hsl(30, 50%, 40%)" />
                    <stop offset="80%" stopColor="hsl(30, 45%, 35%)" />
                    <stop offset="100%" stopColor="hsl(30, 40%, 25%)" />
                  </linearGradient>
                  <linearGradient id="gutter" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(0, 0%, 15%)" />
                    <stop offset="100%" stopColor="hsl(0, 0%, 10%)" />
                  </linearGradient>
                  <radialGradient id="ball-shine" cx="35%" cy="35%">
                    <stop offset="0%" stopColor="hsl(var(--primary) / 0.8)" />
                    <stop offset="50%" stopColor="hsl(var(--primary) / 0.4)" />
                    <stop offset="100%" stopColor="hsl(var(--primary-foreground))" />
                  </radialGradient>
                </defs>

                {/* Gutters */}
                <rect x="0" y="0" width="30" height="320" fill="url(#gutter)" rx="2" />
                <rect x="170" y="0" width="30" height="320" fill="url(#gutter)" rx="2" />

                {/* Lane surface */}
                <rect x="30" y="0" width="140" height="320" fill="url(#lane-wood)" />

                {/* Wood grain lines */}
                {[50, 70, 90, 100, 110, 130, 150].map(x => (
                  <line key={x} x1={x} y1="0" x2={x} y2="320" stroke="hsl(30, 30%, 30%)" strokeWidth="0.5" opacity="0.4" />
                ))}

                {/* Approach dots */}
                {[60, 80, 100, 120, 140].map(x => (
                  <circle key={x} cx={x} cy="260" r="2" fill="hsl(0,0%,50%)" opacity="0.5" />
                ))}

                {/* Arrows */}
                {[60, 80, 100, 120, 140].map(x => (
                  <polygon key={`arr-${x}`} points={`${x},200 ${x-4},210 ${x+4},210`}
                    fill="hsl(var(--primary))" opacity="0.3" />
                ))}

                {/* Foul line */}
                <line x1="30" y1="230" x2="170" y2="230" stroke="hsl(0,70%,50%)" strokeWidth="1.5" opacity="0.6" />

                {/* Pin deck area */}
                <rect x="40" y="5" width="120" height="60" fill="hsl(0,0%,90%)" rx="3" opacity="0.15" />

                {/* Pins */}
                {PIN_LAYOUT.map((pin, i) => {
                  const isFallen = fallenPins.has(i) || previouslyFallen.has(i);
                  const fallAngle = pinFallAngles[i] || 0;
                  return (
                    <g key={i}>
                      {!isFallen ? (
                        <g>
                          {/* Pin shadow */}
                          <ellipse cx={pin.x + 1} cy={pin.y + 8} rx="4" ry="1.5" fill="rgba(0,0,0,0.3)" />
                          {/* Pin body */}
                          <ellipse cx={pin.x} cy={pin.y + 4} rx="3.5" ry="4" fill="hsl(0,0%,95%)" />
                          <ellipse cx={pin.x} cy={pin.y - 1} rx="2.5" ry="2.5" fill="hsl(0,0%,95%)" />
                          {/* Pin neck */}
                          <rect x={pin.x - 1.5} y={pin.y} width="3" height="3" fill="hsl(0,0%,95%)" />
                          {/* Red stripe */}
                          <ellipse cx={pin.x} cy={pin.y - 1} rx="2.5" ry="1" fill="hsl(0,70%,50%)" opacity="0.7" />
                        </g>
                      ) : (
                        fallenPins.has(i) && (
                          <motion.g initial={{ rotate: 0, opacity: 1 }} animate={{ rotate: fallAngle, opacity: 0.3, y: 8 }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}>
                            <ellipse cx={pin.x} cy={pin.y + 2} rx="3" ry="3.5" fill="hsl(0,0%,80%)" />
                          </motion.g>
                        )
                      )}
                    </g>
                  );
                })}

                {/* Rolling ball */}
                {ballPos && (
                  <g>
                    <ellipse cx={ballPos.x} cy={ballPos.y + 6} rx="7" ry="3" fill="rgba(0,0,0,0.3)" />
                    <circle cx={ballPos.x} cy={ballPos.y} r="8" fill="url(#ball-shine)" stroke="hsl(var(--primary))" strokeWidth="0.5">
                      <animate attributeName="r" values="8;8.5;8" dur="0.3s" repeatCount="indefinite" />
                    </circle>
                    {/* Finger holes */}
                    <circle cx={ballPos.x - 2} cy={ballPos.y - 2} r="1.2" fill="hsl(0,0%,20%)" />
                    <circle cx={ballPos.x + 2} cy={ballPos.y - 2} r="1.2" fill="hsl(0,0%,20%)" />
                    <circle cx={ballPos.x} cy={ballPos.y + 1} r="1" fill="hsl(0,0%,20%)" />
                  </g>
                )}

                {/* Ball at rest (draggable) */}
                {!isRolling && isMyTurn && (
                  <g>
                    <ellipse cx={ballX} cy={286} rx="7" ry="3" fill="rgba(0,0,0,0.3)" />
                    <circle cx={ballX} cy={280} r="9" fill="url(#ball-shine)" stroke="hsl(var(--primary))" strokeWidth="1"
                      style={{ filter: isDragging ? `drop-shadow(0 0 8px hsl(var(--primary) / 0.6))` : 'none' }}>
                      {isDragging && <animate attributeName="r" values="9;10;9" dur="0.5s" repeatCount="indefinite" />}
                    </circle>
                    <circle cx={ballX - 2} cy={278} r="1.5" fill="hsl(0,0%,20%)" />
                    <circle cx={ballX + 2} cy={278} r="1.5" fill="hsl(0,0%,20%)" />
                    <circle cx={ballX} cy={281} r="1.2" fill="hsl(0,0%,20%)" />
                  </g>
                )}

                {/* Aim line when dragging */}
                {isDragging && (
                  <line x1={ballX} y1={275} x2={ballX + spinAngle * 20} y2={60}
                    stroke="hsl(var(--primary))" strokeWidth="0.8" strokeDasharray="4,4" opacity="0.4" />
                )}
              </svg>

              {/* Throw instruction */}
              {isMyTurn && !isRolling && !isDragging && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute bottom-2 left-0 right-0 text-center">
                  <p className="text-[10px] text-muted-foreground animate-bounce-soft">
                    ↑ Kugel greifen & nach oben wischen
                  </p>
                </motion.div>
              )}
            </div>
          )}

          {game.status === 'waiting' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Teile diese Spiel-ID:</p>
              <code className="block glass-card rounded-xl px-4 py-2 text-xs font-mono text-foreground select-all">{game.id}</code>
            </motion.div>
          )}

          {game.status === 'finished' && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex gap-2">
              <Button onClick={handleReset} className="gap-2 btn-neon"><RotateCcw className="w-4 h-4" /> Neue Runde</Button>
              <Button variant="secondary" onClick={handleLeave}>Zur Lobby</Button>
            </motion.div>
          )}
        </main>

        {game.status !== 'waiting' && (
          <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-border h-48 lg:h-auto flex flex-col glass">
            <ChatPanel userId={userId} gameId={game.id} title="Spiel Chat" />
          </aside>
        )}
      </div>
    </div>
  );
}
