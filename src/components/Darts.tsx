import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

interface DartsProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const DART_SECTIONS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

interface DartStick { x: number; y: number; points: number; label: string }

export function Darts({ game: initialGame, userId, onLeave }: DartsProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [error, setError] = useState('');
  // 3 darts per turn
  const [dartsThrown, setDartsThrown] = useState<DartStick[]>([]);
  const [currentDart, setCurrentDart] = useState(0); // 0,1,2
  // Throw mechanics
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [powerMeter, setPowerMeter] = useState(0);
  const [throwAnim, setThrowAnim] = useState<{ x: number; y: number } | null>(null);
  const [lastHit, setLastHit] = useState<{ points: number; label: string } | null>(null);
  const [impactParticles, setImpactParticles] = useState<{ x: number; y: number; id: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<SVGSVGElement>(null);
  const particleId = useRef(0);

  const gameData = (game.game_data || {}) as Record<string, any>;
  const playerXScore = gameData.player_x_score ?? 301;
  const playerOScore = gameData.player_o_score ?? 301;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (payload) => setGame(payload.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  const calcHit = useCallback((svgX: number, svgY: number): { points: number; label: string } => {
    const dist = Math.sqrt(svgX * svgX + svgY * svgY);
    if (dist > 160) return { points: 0, label: 'Miss!' };
    if (dist <= 8) return { points: 50, label: 'BULLSEYE! 🎯' };
    if (dist <= 20) return { points: 25, label: 'Bull 25' };
    let angle = Math.atan2(svgY, svgX) * 180 / Math.PI + 99;
    if (angle < 0) angle += 360;
    const sectionIdx = Math.floor(angle / 18) % 20;
    const num = DART_SECTIONS[sectionIdx];
    if (dist > 130 && dist <= 150) return { points: num * 2, label: `Double ${num}` };
    if (dist > 80 && dist <= 100) return { points: num * 3, label: `Triple ${num}! 🔥` };
    return { points: num, label: `${num}` };
  }, []);

  const spawnParticles = (x: number, y: number) => {
    const newParticles = Array.from({ length: 8 }, () => ({
      x: x + (Math.random() - 0.5) * 40,
      y: y + (Math.random() - 0.5) * 40,
      id: particleId.current++,
    }));
    setImpactParticles(prev => [...prev, ...newParticles]);
    setTimeout(() => setImpactParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id))), 600);
  };

  const submitThrow = useCallback(async (points: number) => {
    if (!isMyTurn || game.status !== 'playing' || game.winner) return;
    const currentScore = isPlayerX ? playerXScore : playerOScore;
    const newScore = currentScore - points;
    if (newScore < 0) {
      setError('Bust! Zu viele Punkte.');
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
    if (newScore === 0) { update.winner = userId; update.status = 'finished'; sounds.win(); }
    if (points === 50) sounds.achievement();
    else if (points >= 25) sounds.coinEarn();
    else sounds.move();
    await supabase.from('games').update(update).eq('id', game.id);
  }, [isMyTurn, game, isPlayerX, playerXScore, playerOScore, gameData, userId]);

  // Touch/Mouse drag
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMyTurn || game.status !== 'playing' || game.winner || currentDart >= 3) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragCurrent({ x: e.clientX, y: e.clientY });
    setLastHit(null);
    setError('');
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragCurrent({ x: e.clientX, y: e.clientY });
    const dy = e.clientY - dragStart.y;
    setPowerMeter(Math.min(Math.abs(Math.min(dy, 0)) / 150, 1));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    const dy = e.clientY - dragStart.y;
    const dx = e.clientX - dragStart.x;

    // Need upward swipe
    if (dy > -30) { setPowerMeter(0); return; }

    const power = Math.min(Math.abs(dy) / 200, 1);
    const accuracy = 1 - Math.min(Math.abs(dx) / 150, 1);
    const jitter = (1 - accuracy) * 120 + (1 - power) * 40;
    const targetX = (dx * 0.6) + (Math.random() - 0.5) * jitter;
    const targetY = -(power * 100) + 40 + (Math.random() - 0.5) * jitter;

    // Animate
    setThrowAnim({ x: targetX, y: targetY });
    sounds.move();

    setTimeout(() => {
      setThrowAnim(null);
      const hit = calcHit(targetX, targetY);
      setLastHit(hit);
      setDartsThrown(prev => [...prev, { x: targetX, y: targetY, ...hit }]);
      setCurrentDart(prev => prev + 1);
      setPowerMeter(0);

      // Spawn impact particles
      if (containerRef.current && boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        const px = rect.left + rect.width / 2 + (targetX / 170) * (rect.width / 2);
        const py = rect.top + rect.height / 2 + (targetY / 170) * (rect.height / 2);
        spawnParticles(px, py);
      }

      submitThrow(hit.points);
    }, 450);
  };

  // Reset darts after turn switches
  useEffect(() => {
    setDartsThrown([]);
    setCurrentDart(0);
    setLastHit(null);
  }, [game.current_turn]);

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { player_x_score: 301, player_o_score: 301, current_round: 1 },
      winner: null, is_draw: false, status: 'playing' as any, current_turn: game.player_x,
    }).eq('id', game.id);
  };

  const handleLeave = async () => {
    const other = isPlayerX ? game.player_o : game.player_x;
    if (!other) await supabase.from('games').delete().eq('id', game.id);
    else await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    onLeave();
  };

  const myScore = isPlayerX ? playerXScore : playerOScore;
  const opponentScore = isPlayerX ? playerOScore : playerXScore;

  return (
    <div className="min-h-screen flex flex-col bg-background bg-orbs">
      {/* Impact particles */}
      {impactParticles.map(p => (
        <div key={p.id} className="fixed pointer-events-none z-50" style={{ left: p.x, top: p.y }}>
          <div className="w-2 h-2 rounded-full bg-primary particle-burst" />
        </div>
      ))}

      <header className="border-b border-border px-4 py-2.5 flex items-center justify-between glass sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground h-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-bold text-foreground">🎯 Darts 301</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative z-10">
        <main className="flex-1 flex flex-col items-center p-4 gap-3 overflow-y-auto">
          {/* Scores */}
          <div className="flex gap-3 w-full max-w-md">
            <motion.div animate={{ scale: isMyTurn ? 1.02 : 1 }}
              className={`flex-1 glass-card text-center p-3 ${isMyTurn ? 'neon-border' : ''}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Du</p>
              <p className="text-4xl font-extrabold text-foreground tabular-nums">{myScore}</p>
              <div className="flex justify-center gap-1 mt-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-all ${i < currentDart ? 'bg-primary glow-primary-sm' : 'bg-secondary'}`} />
                ))}
              </div>
            </motion.div>
            <div className="flex items-center text-muted-foreground text-xs font-bold">VS</div>
            <div className="flex-1 glass-card text-center p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Gegner</p>
              <p className="text-4xl font-extrabold text-foreground tabular-nums">{opponentScore}</p>
            </div>
          </div>

          {/* Status */}
          <AnimatePresence mode="wait">
            <motion.div key={game.winner ? 'winner' : isMyTurn ? 'my' : 'opp'} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className={`text-sm font-semibold px-5 py-2 rounded-full ${
                game.winner === userId ? 'bg-primary/15 text-primary glow-primary' :
                game.winner ? 'bg-destructive/15 text-destructive' :
                isMyTurn ? 'bg-primary/10 text-primary animate-pulse-glow' :
                'glass-card text-muted-foreground'
              }`}>
              {game.winner === userId && <Trophy className="w-4 h-4 inline mr-1" />}
              {game.status === 'waiting' ? 'Warte auf Mitspieler…' :
               game.winner === userId ? '🎯 Du hast gewonnen!' :
               game.winner ? 'Du hast verloren.' :
               isMyTurn ? '↑ Wische nach oben um zu werfen!' : 'Gegner wirft…'}
            </motion.div>
          </AnimatePresence>

          {/* Last hit */}
          <AnimatePresence>
            {lastHit && (
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                className={`text-2xl font-extrabold ${lastHit.points >= 25 ? 'text-primary glow-neon-cyan' : lastHit.points === 0 ? 'text-destructive' : 'text-foreground'}`}>
                {lastHit.label}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Power meter */}
          {isDragging && (
            <div className="w-2 h-24 rounded-full bg-secondary overflow-hidden relative">
              <motion.div animate={{ height: `${powerMeter * 100}%` }}
                className="absolute bottom-0 w-full rounded-full bg-gradient-to-t from-primary to-neon-lime"
                style={{ boxShadow: `0 0 ${powerMeter * 20}px hsl(var(--primary) / ${powerMeter * 0.6})` }} />
            </div>
          )}

          {/* Dartboard + Throw area */}
          {game.status === 'playing' && !game.winner && (
            <div ref={containerRef}
              className="relative w-full max-w-xs aspect-[3/4] touch-none select-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}>

              {/* SVG Dartboard with metallic look */}
              <svg ref={boardRef} viewBox="-170 -170 340 340" className="w-full drop-shadow-2xl"
                style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5)) drop-shadow(0 0 20px hsl(175 85% 50% / 0.1))' }}>
                {/* Outer ring - metal */}
                <circle cx="0" cy="0" r="165" fill="none" stroke="hsl(0,0%,30%)" strokeWidth="6" />
                <circle cx="0" cy="0" r="162" fill="hsl(0,0%,8%)" />
                {/* Wire frame */}
                <circle cx="0" cy="0" r="160" fill="hsl(0,0%,10%)" stroke="hsl(0,0%,25%)" strokeWidth="0.8" />

                {DART_SECTIONS.map((num, i) => {
                  const angle = (i * 18 - 99) * Math.PI / 180;
                  const nextAngle = ((i + 1) * 18 - 99) * Math.PI / 180;
                  const colors = i % 2 === 0
                    ? ['hsl(0,0%,12%)', 'hsl(0,70%,38%)', 'hsl(0,0%,12%)', 'hsl(0,70%,38%)']
                    : ['hsl(50,50%,50%)', 'hsl(145,55%,28%)', 'hsl(50,50%,50%)', 'hsl(145,55%,28%)'];
                  const radii = [150, 150, 100, 100];
                  const innerRadii = [130, 100, 80, 60];
                  return (
                    <g key={num}>
                      {radii.map((r, ri) => {
                        const ir = innerRadii[ri];
                        const x1 = Math.cos(angle) * r, y1 = Math.sin(angle) * r;
                        const x2 = Math.cos(nextAngle) * r, y2 = Math.sin(nextAngle) * r;
                        const x3 = Math.cos(nextAngle) * ir, y3 = Math.sin(nextAngle) * ir;
                        const x4 = Math.cos(angle) * ir, y4 = Math.sin(angle) * ir;
                        return (
                          <path key={ri}
                            d={`M${x4},${y4} A${ir},${ir} 0 0,1 ${x3},${y3} L${x2},${y2} A${r},${r} 0 0,0 ${x1},${y1} Z`}
                            fill={colors[ri]} stroke="hsl(0,0%,22%)" strokeWidth="0.5" />
                        );
                      })}
                      {/* Wire lines */}
                      <line x1={Math.cos(angle) * 60} y1={Math.sin(angle) * 60}
                        x2={Math.cos(angle) * 160} y2={Math.sin(angle) * 160}
                        stroke="hsl(0,0%,28%)" strokeWidth="0.5" />
                      <text
                        x={Math.cos((angle + nextAngle) / 2) * 155}
                        y={Math.sin((angle + nextAngle) / 2) * 155 + 4}
                        textAnchor="middle" fill="white" fontSize="9" fontWeight="bold"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                      >{num}</text>
                    </g>
                  );
                })}

                {/* Wire circles */}
                <circle cx="0" cy="0" r="130" fill="none" stroke="hsl(0,0%,28%)" strokeWidth="0.8" />
                <circle cx="0" cy="0" r="100" fill="none" stroke="hsl(0,0%,28%)" strokeWidth="0.8" />
                <circle cx="0" cy="0" r="80" fill="none" stroke="hsl(0,0%,28%)" strokeWidth="0.8" />
                <circle cx="0" cy="0" r="60" fill="none" stroke="hsl(0,0%,28%)" strokeWidth="0.8" />

                {/* Bull */}
                <circle cx="0" cy="0" r="20" fill="hsl(145,55%,28%)" stroke="hsl(0,0%,28%)" strokeWidth="0.8" />
                <circle cx="0" cy="0" r="8" fill="hsl(0,70%,38%)" stroke="hsl(0,0%,28%)" strokeWidth="0.8" />
                {/* Bull highlight */}
                <circle cx="-2" cy="-2" r="3" fill="hsl(0,70%,55%)" opacity="0.3" />

                {/* Stuck darts */}
                {dartsThrown.map((dart, i) => (
                  <g key={i}>
                    <circle cx={dart.x} cy={dart.y} r="3" fill="hsl(var(--primary))" stroke="hsl(var(--primary-foreground))" strokeWidth="0.5">
                      <animate attributeName="r" from="5" to="3" dur="0.3s" fill="freeze" />
                    </circle>
                    <line x1={dart.x} y1={dart.y} x2={dart.x} y2={dart.y - 15}
                      stroke="hsl(0,0%,60%)" strokeWidth="1.5" strokeLinecap="round" />
                    <polygon
                      points={`${dart.x - 3},${dart.y - 12} ${dart.x},${dart.y - 18} ${dart.x + 3},${dart.y - 12}`}
                      fill="hsl(var(--neon-cyan))" opacity="0.8" />
                  </g>
                ))}
              </svg>

              {/* Dart in hand */}
              {!throwAnim && isMyTurn && currentDart < 3 && (
                <motion.div
                  animate={{
                    x: isDragging ? (dragCurrent.x - dragStart.x) * 0.3 : 0,
                    y: isDragging ? Math.min(0, (dragCurrent.y - dragStart.y) * 0.3) : 0,
                    rotate: isDragging ? -45 + (dragCurrent.x - dragStart.x) * 0.15 : 0,
                    scale: isDragging ? 1.2 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 text-4xl pointer-events-none"
                  style={{ filter: isDragging ? 'drop-shadow(0 0 8px hsl(var(--primary) / 0.5))' : 'none' }}
                >
                  🎯
                </motion.div>
              )}

              {/* Throw animation */}
              <AnimatePresence>
                {throwAnim && (
                  <motion.div
                    initial={{ y: '80%', x: '-50%', scale: 1, opacity: 1 }}
                    animate={{ y: '15%', x: '-50%', scale: 0.5, opacity: 0.7 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.2, 0, 0.2, 1] }}
                    className="absolute left-1/2 text-3xl pointer-events-none"
                    style={{ transform: 'rotate(-90deg)' }}
                  >
                    🎯
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Throw instruction */}
              {isMyTurn && !isDragging && !throwAnim && currentDart < 3 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute bottom-0 left-0 right-0 text-center">
                  <p className="text-[10px] text-muted-foreground animate-bounce-soft">
                    ↑ Greife den Pfeil und wische nach oben
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

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive max-w-sm">{error}</motion.div>
            )}
          </AnimatePresence>
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
