import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

interface BowlingProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const TOTAL_FRAMES = 5;

const PIN_LAYOUT: { x: number; y: number }[] = [
  { x: 100, y: 62 },
  { x: 88, y: 48 }, { x: 112, y: 48 },
  { x: 76, y: 34 }, { x: 100, y: 34 }, { x: 124, y: 34 },
  { x: 64, y: 20 }, { x: 88, y: 20 }, { x: 112, y: 20 }, { x: 136, y: 20 },
];

type Particle = { id: number; x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

export function Bowling({ game: initialGame, userId, onLeave }: BowlingProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [isDragging, setIsDragging] = useState(false);
  const [ballX, setBallX] = useState(100);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [spinAngle, setSpinAngle] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);
  const [ballRotation, setBallRotation] = useState(0);
  const [fallenPins, setFallenPins] = useState<Set<number>>(new Set());
  const [pinFallAngles, setPinFallAngles] = useState<Record<number, { angle: number; dx: number; dy: number }>>({});
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [showStrike, setShowStrike] = useState(false);
  const [showSpare, setShowSpare] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [power, setPower] = useState(0);
  const animFrameRef = useRef<number>();
  const particleIdRef = useRef(0);

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

  // Animate particles
  useEffect(() => {
    if (particles.length === 0) return;
    const tick = () => {
      setParticles(prev => prev
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.15, life: p.life - 1 }))
        .filter(p => p.life > 0));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [particles.length > 0]);

  const previouslyFallen = currentRoll === 2 && firstRollPins != null
    ? new Set(Array.from({ length: firstRollPins }, (_, i) => i))
    : new Set<number>();

  const spawnParticles = (cx: number, cy: number, count: number) => {
    const colors = ['hsl(var(--primary))', '#FFD700', '#FF6B6B', '#FFFFFF', '#00FF88'];
    const newP: Particle[] = Array.from({ length: count }, () => ({
      id: particleIdRef.current++,
      x: cx + (Math.random() - 0.5) * 10,
      y: cy + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 4,
      vy: -(Math.random() * 3 + 1),
      life: 20 + Math.random() * 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 1.5 + Math.random() * 2.5,
    }));
    setParticles(prev => [...prev, ...newP]);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMyTurn || isRolling || game.status !== 'playing' || game.winner) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setSpinAngle(0);
    setPower(0);
    setLastRoll(null);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setBallX(Math.max(55, Math.min(145, 100 + dx * 0.25)));
    setPower(Math.min(Math.abs(Math.min(dy, 0)) / 150, 1));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    const dy = e.clientY - dragStart.y;
    const dx = e.clientX - dragStart.x;
    if (dy > -25) return; // need upward swipe

    const throwPower = Math.min(Math.abs(dy) / 180, 1);
    const spin = Math.max(-1, Math.min(1, dx / 80));
    setSpinAngle(spin);
    setIsRolling(true);
    setPower(0);
    sounds.move();

    const startX = ballX;
    const steps = 30;
    let step = 0;
    let cx = startX;
    let cy = 290;
    let rot = 0;

    const rollInterval = setInterval(() => {
      step++;
      const t = step / steps;
      cy = 290 - t * 240;
      // Hook curve: ball curves more as it travels
      const hookFactor = spin * Math.pow(t, 1.8) * 30;
      cx = startX + hookFactor;
      rot += 15 + throwPower * 10;
      setBallPos({ x: cx, y: cy });
      setBallRotation(rot);

      if (step >= steps) {
        clearInterval(rollInterval);
        const knocked = calculatePinHits(cx, throwPower, spin);
        animatePinFalls(knocked, cx);
      }
    }, 25);
  };

  const calculatePinHits = (finalX: number, pwr: number, spin: number): Set<number> => {
    const knocked = new Set<number>();
    PIN_LAYOUT.forEach((pin, i) => {
      if (previouslyFallen.has(i)) return;
      const dist = Math.abs(pin.x - finalX);
      const threshold = 12 + pwr * 10;
      if (dist < threshold && Math.random() < (1 - dist / threshold) * pwr + 0.25) {
        knocked.add(i);
      }
    });
    // Chain reactions
    const arr = Array.from(knocked);
    arr.forEach(ki => {
      PIN_LAYOUT.forEach((pin, i) => {
        if (knocked.has(i) || previouslyFallen.has(i)) return;
        const kp = PIN_LAYOUT[ki];
        const d = Math.sqrt((pin.x - kp.x) ** 2 + (pin.y - kp.y) ** 2);
        if (d < 20 && Math.random() < 0.55 * pwr) knocked.add(i);
      });
    });
    return knocked;
  };

  const animatePinFalls = (knocked: Set<number>, ballFinalX: number) => {
    const angles: Record<number, { angle: number; dx: number; dy: number }> = {};
    knocked.forEach(i => {
      const pin = PIN_LAYOUT[i];
      const dir = pin.x > ballFinalX ? 1 : -1;
      angles[i] = {
        angle: dir * (40 + Math.random() * 60),
        dx: dir * (3 + Math.random() * 6),
        dy: -(2 + Math.random() * 4),
      };
      // Spawn impact particles per pin
      spawnParticles(pin.x, pin.y, 5);
    });
    setPinFallAngles(angles);
    setFallenPins(knocked);

    const pinsDown = knocked.size;
    setLastRoll(pinsDown);

    const allDown = pinsDown >= 10 - previouslyFallen.size;
    if (allDown && currentRoll === 1 && pinsDown > 0) {
      setShowStrike(true);
      sounds.achievement();
      spawnParticles(100, 40, 30);
      setTimeout(() => setShowStrike(false), 2200);
    } else if (allDown && currentRoll === 2) {
      setShowSpare(true);
      sounds.coinEarn();
      spawnParticles(100, 40, 20);
      setTimeout(() => setShowSpare(false), 2000);
    } else if (pinsDown > 0) {
      sounds.move();
    } else {
      sounds.invalid();
    }

    setTimeout(() => {
      submitRoll(pinsDown);
      setIsRolling(false);
      setBallPos(null);
      setBallRotation(0);
      setFallenPins(new Set());
      setPinFallAngles({});
      setBallX(100);
    }, 1400);
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
    if (frameComplete) update.current_turn = isPlayerX ? game.player_o : game.player_x;

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
    <div className="min-h-screen flex flex-col bg-[#0a0e17]"
      style={{ background: 'radial-gradient(ellipse at 50% 80%, #1a1510 0%, #0a0e17 60%)' }}>
      {/* Header */}
      <header className="border-b border-border/30 px-4 py-2.5 flex items-center justify-between bg-black/40 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground h-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-bold text-foreground">🎳 Bowling</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          Frame {Math.min(myFrames.length + 1, TOTAL_FRAMES)}/{TOTAL_FRAMES}
        </span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-3 gap-3 overflow-y-auto">
          {/* Scoreboard */}
          <div className="flex gap-3 w-full max-w-md">
            <motion.div animate={{ scale: isMyTurn ? 1.03 : 1 }}
              className={`flex-1 rounded-xl p-3 text-center transition-all ${
                isMyTurn ? 'bg-primary/10 border border-primary/30 shadow-[0_0_20px_rgba(0,217,255,0.1)]' : 'bg-white/5 border border-white/10'
              }`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-1">Du</p>
              <p className="text-3xl font-black text-foreground tabular-nums">{myScore}</p>
              <div className="flex justify-center gap-1 mt-1.5 flex-wrap">
                {myFrames.map((f: number, i: number) => (
                  <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
                    f === 10 ? 'bg-primary/25 text-primary' : 'bg-white/10 text-muted-foreground'
                  }`}>
                    {f === 10 ? 'X' : f}
                  </span>
                ))}
              </div>
            </motion.div>
            <div className="flex items-center text-muted-foreground text-xs font-black opacity-40">VS</div>
            <div className="flex-1 rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-1">Gegner</p>
              <p className="text-3xl font-black text-foreground tabular-nums">{opScore}</p>
              <div className="flex justify-center gap-1 mt-1.5 flex-wrap">
                {opFrames.map((f: number, i: number) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/10 text-muted-foreground font-bold">
                    {f === 10 ? 'X' : f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className={`text-sm font-bold px-5 py-2 rounded-full ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            isMyTurn ? 'bg-primary/10 text-primary' : 'bg-white/5 text-muted-foreground'
          }`}>
            {game.status === 'waiting' ? 'Warte auf Mitspieler…' :
             game.winner === userId ? '🏆 Du hast gewonnen!' :
             game.winner ? 'Du hast verloren.' :
             game.is_draw ? 'Unentschieden!' :
             isMyTurn ? (currentRoll === 1 ? '↑ Wische nach oben!' : '↑ 2. Wurf!') : 'Gegner wirft…'}
          </div>

          {/* Strike/Spare overlay */}
          <AnimatePresence>
            {showStrike && (
              <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 8 }}
                className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                <div className="relative">
                  <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: 3, duration: 0.3 }}
                    className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-primary to-yellow-400 drop-shadow-[0_0_40px_rgba(255,215,0,0.5)]">
                    STRIKE!
                  </motion.div>
                  <div className="text-4xl text-center mt-1">🎳💥</div>
                </div>
              </motion.div>
            )}
            {showSpare && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0 }}
                className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                <div className="text-5xl font-black text-emerald-400 drop-shadow-[0_0_30px_rgba(0,255,136,0.4)]">
                  SPARE! ✨
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Last roll indicator */}
          <AnimatePresence>
            {lastRoll !== null && !showStrike && !showSpare && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
                className={`text-lg font-black ${
                  lastRoll === 10 ? 'text-primary' : lastRoll === 0 ? 'text-destructive' : 'text-foreground'
                }`}>
                {lastRoll === 0 ? 'Gutter Ball 😢' : `${lastRoll} Pins!`}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Power meter */}
          {isDragging && (
            <div className="w-full max-w-[280px] flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground w-10">Power</span>
              <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div animate={{ width: `${power * 100}%` }}
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, #00FF88 0%, #00D9FF ${Math.min(power * 100, 70)}%, #FF6B6B 100%)`
                  }} />
              </div>
            </div>
          )}

          {/* 3D Bowling Lane */}
          {game.status === 'playing' && !game.winner && (
            <div className="relative w-full max-w-[300px] touch-none select-none"
              style={{ perspective: '600px' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}>

              <svg viewBox="0 0 200 340" className="w-full"
                style={{
                  transform: 'rotateX(8deg)',
                  transformOrigin: '50% 100%',
                  filter: 'drop-shadow(0 15px 40px rgba(0,0,0,0.7))',
                }}>
                <defs>
                  {/* Lane wood texture */}
                  <linearGradient id="b-lane" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3d2a1a" />
                    <stop offset="15%" stopColor="#5a3d28" />
                    <stop offset="30%" stopColor="#6b4a32" />
                    <stop offset="50%" stopColor="#7a5438" />
                    <stop offset="70%" stopColor="#6b4a32" />
                    <stop offset="85%" stopColor="#5a3d28" />
                    <stop offset="100%" stopColor="#3d2a1a" />
                  </linearGradient>
                  {/* Gutter */}
                  <linearGradient id="b-gutter" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#111" />
                    <stop offset="100%" stopColor="#0a0a0a" />
                  </linearGradient>
                  {/* Ball gradient */}
                  <radialGradient id="b-ball" cx="35%" cy="30%">
                    <stop offset="0%" stopColor="#33ddff" />
                    <stop offset="40%" stopColor="#0099cc" />
                    <stop offset="100%" stopColor="#004466" />
                  </radialGradient>
                  {/* Pin deck */}
                  <linearGradient id="b-deck" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ddd" />
                    <stop offset="100%" stopColor="#aaa" />
                  </linearGradient>
                  {/* Lane shine */}
                  <linearGradient id="b-shine" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
                    <stop offset="40%" stopColor="rgba(255,255,255,0.02)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                  </linearGradient>
                </defs>

                {/* Gutters */}
                <rect x="0" y="0" width="28" height="340" fill="url(#b-gutter)" />
                <rect x="172" y="0" width="28" height="340" fill="url(#b-gutter)" />
                {/* Gutter inner edge */}
                <line x1="28" y1="0" x2="28" y2="340" stroke="#222" strokeWidth="1" />
                <line x1="172" y1="0" x2="172" y2="340" stroke="#222" strokeWidth="1" />

                {/* Lane surface */}
                <rect x="28" y="0" width="144" height="340" fill="url(#b-lane)" />
                {/* Lane shine overlay */}
                <rect x="28" y="0" width="144" height="340" fill="url(#b-shine)" />

                {/* Wood plank lines */}
                {[46, 64, 82, 100, 118, 136, 154].map(x => (
                  <line key={x} x1={x} y1="0" x2={x} y2="340" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />
                ))}

                {/* Oil pattern (subtle) */}
                <rect x="40" y="80" width="120" height="120" fill="rgba(255,255,255,0.03)" rx="4" />

                {/* Arrows */}
                {[60, 80, 100, 120, 140].map((x, i) => (
                  <polygon key={`arr-${x}`} points={`${x},195 ${x-5},210 ${x+5},210`}
                    fill={i === 2 ? '#00D9FF' : '#888'} opacity="0.25" />
                ))}

                {/* Approach dots */}
                {[60, 80, 100, 120, 140].map(x => (
                  <circle key={`dot-${x}`} cx={x} cy="270" r="1.5" fill="#666" opacity="0.4" />
                ))}

                {/* Foul line */}
                <line x1="28" y1="240" x2="172" y2="240" stroke="#cc3333" strokeWidth="2" opacity="0.5" />

                {/* Pin deck area */}
                <rect x="42" y="6" width="116" height="68" fill="url(#b-deck)" rx="3" opacity="0.12" />

                {/* Pins */}
                {PIN_LAYOUT.map((pin, i) => {
                  const isFallen = fallenPins.has(i) || previouslyFallen.has(i);
                  const fall = pinFallAngles[i];
                  if (previouslyFallen.has(i)) return null;
                  return (
                    <g key={i}>
                      {!isFallen ? (
                        <g>
                          <ellipse cx={pin.x + 1} cy={pin.y + 9} rx="3.5" ry="1.2" fill="rgba(0,0,0,0.25)" />
                          {/* Pin body */}
                          <ellipse cx={pin.x} cy={pin.y + 5} rx="3.2" ry="4" fill="#f0ece6" />
                          <ellipse cx={pin.x} cy={pin.y} rx="2.3" ry="2.5" fill="#f5f0e8" />
                          <rect x={pin.x - 1.3} y={pin.y + 1} width="2.6" height="2.5" fill="#f0ece6" />
                          {/* Red stripes */}
                          <ellipse cx={pin.x} cy={pin.y - 0.5} rx="2.3" ry="0.8" fill="#cc2222" opacity="0.8" />
                          <ellipse cx={pin.x} cy={pin.y + 1} rx="2" ry="0.5" fill="#cc2222" opacity="0.5" />
                          {/* Highlight */}
                          <ellipse cx={pin.x - 0.8} cy={pin.y - 1} rx="0.8" ry="1.2" fill="rgba(255,255,255,0.3)" />
                        </g>
                      ) : fall && (
                        <motion.g
                          initial={{ rotate: 0, x: 0, y: 0, opacity: 1 }}
                          animate={{ rotate: fall.angle, x: fall.dx, y: fall.dy + 5, opacity: 0.2 }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          style={{ originX: `${pin.x}px`, originY: `${pin.y}px` }}>
                          <ellipse cx={pin.x} cy={pin.y + 3} rx="2.8" ry="3.5" fill="#d5d0c5" />
                          <ellipse cx={pin.x} cy={pin.y - 1} rx="2" ry="2" fill="#d5d0c5" />
                        </motion.g>
                      )}
                    </g>
                  );
                })}

                {/* Particles */}
                {particles.map(p => (
                  <circle key={p.id} cx={p.x} cy={p.y} r={p.size * (p.life / 40)}
                    fill={p.color} opacity={Math.min(p.life / 20, 1)} />
                ))}

                {/* Rolling ball */}
                {ballPos && (
                  <g>
                    <ellipse cx={ballPos.x} cy={ballPos.y + 7} rx={6 + (1 - ballPos.y / 300) * 2} ry="2.5"
                      fill="rgba(0,0,0,0.3)" />
                    <circle cx={ballPos.x} cy={ballPos.y} r={7 + (1 - ballPos.y / 300) * 1.5}
                      fill="url(#b-ball)" stroke="rgba(0,217,255,0.3)" strokeWidth="0.5">
                    </circle>
                    {/* Finger holes rotating */}
                    <g transform={`rotate(${ballRotation}, ${ballPos.x}, ${ballPos.y})`}>
                      <circle cx={ballPos.x - 2} cy={ballPos.y - 2} r="1" fill="rgba(0,0,0,0.5)" />
                      <circle cx={ballPos.x + 2} cy={ballPos.y - 2} r="1" fill="rgba(0,0,0,0.5)" />
                      <circle cx={ballPos.x} cy={ballPos.y + 1.5} r="0.8" fill="rgba(0,0,0,0.5)" />
                    </g>
                    {/* Motion trail */}
                    <line x1={ballPos.x} y1={ballPos.y + 10} x2={ballPos.x} y2={Math.min(ballPos.y + 30, 310)}
                      stroke="rgba(0,217,255,0.15)" strokeWidth="3" strokeLinecap="round" />
                  </g>
                )}

                {/* Ball at rest */}
                {!isRolling && isMyTurn && (
                  <g>
                    <ellipse cx={ballX} cy={298} rx="7" ry="2.5" fill="rgba(0,0,0,0.3)" />
                    <circle cx={ballX} cy={290} r="9" fill="url(#b-ball)"
                      stroke={isDragging ? 'rgba(0,217,255,0.6)' : 'rgba(0,217,255,0.2)'} strokeWidth="1"
                      style={{ filter: isDragging ? 'drop-shadow(0 0 12px rgba(0,217,255,0.4))' : 'none' }}>
                      {isDragging && <animate attributeName="r" values="9;10;9" dur="0.4s" repeatCount="indefinite" />}
                    </circle>
                    <circle cx={ballX - 2} cy={288} r="1.3" fill="rgba(0,0,0,0.4)" />
                    <circle cx={ballX + 2} cy={288} r="1.3" fill="rgba(0,0,0,0.4)" />
                    <circle cx={ballX} cy={291.5} r="1" fill="rgba(0,0,0,0.4)" />
                  </g>
                )}

                {/* Aim line */}
                {isDragging && (
                  <>
                    <line x1={ballX} y1={285} x2={ballX + spinAngle * 25} y2={50}
                      stroke="rgba(0,217,255,0.25)" strokeWidth="1" strokeDasharray="4,4" />
                    <circle cx={ballX + spinAngle * 25} cy={50} r="3" fill="rgba(0,217,255,0.15)" />
                  </>
                )}
              </svg>

              {/* Touch instruction */}
              {isMyTurn && !isRolling && !isDragging && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0.4, 0.8, 0.4] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                  <p className="text-[11px] text-primary/60 font-medium">
                    ↑ Kugel greifen & nach oben wischen
                  </p>
                </motion.div>
              )}
            </div>
          )}

          {game.status === 'waiting' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Teile diese Spiel-ID:</p>
              <code className="block bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-mono text-foreground select-all">
                {game.id}
              </code>
            </motion.div>
          )}

          {game.status === 'finished' && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex gap-2">
              <Button onClick={handleReset} className="gap-2"><RotateCcw className="w-4 h-4" /> Neue Runde</Button>
              <Button variant="secondary" onClick={handleLeave}>Zur Lobby</Button>
            </motion.div>
          )}
        </main>

        {game.status !== 'waiting' && (
          <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-white/10 h-48 lg:h-auto flex flex-col bg-black/30">
            <ChatPanel userId={userId} gameId={game.id} title="Spiel Chat" />
          </aside>
        )}
      </div>
    </div>
  );
}
