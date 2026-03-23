import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

interface PoolProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];

const BALL_COLORS: Record<number, string> = {
  0: '#FFFFFF', 1: '#EAB308', 2: '#2563EB', 3: '#EF4444', 4: '#7C3AED',
  5: '#F97316', 6: '#16A34A', 7: '#7F1D1D', 8: '#111827',
  9: '#FDE68A', 10: '#93C5FD', 11: '#FCA5A5', 12: '#C4B5FD',
  13: '#FDBA74', 14: '#86EFAC', 15: '#FCA5A5',
};

// Simple 2D pool table positions
const TABLE_W = 300;
const TABLE_H = 180;
const BALL_R = 7;
const POCKET_R = 10;
const POCKETS = [
  { x: 8, y: 8 }, { x: TABLE_W / 2, y: 5 }, { x: TABLE_W - 8, y: 8 },
  { x: 8, y: TABLE_H - 8 }, { x: TABLE_W / 2, y: TABLE_H - 5 }, { x: TABLE_W - 8, y: TABLE_H - 8 },
];

function initBallPositions(remaining: number[]): Record<number, { x: number; y: number }> {
  const pos: Record<number, { x: number; y: number }> = {};
  // Cue ball
  pos[0] = { x: 80, y: TABLE_H / 2 };
  // Rack the remaining balls in a triangle
  const rackX = 200;
  const rackY = TABLE_H / 2;
  let row = 0, col = 0, maxInRow = 1;
  remaining.forEach((b, i) => {
    pos[b] = {
      x: rackX + row * 14,
      y: rackY + (col - (maxInRow - 1) / 2) * 15,
    };
    col++;
    if (col >= maxInRow) { row++; maxInRow++; col = 0; }
  });
  return pos;
}

export function Pool({ game: initialGame, userId, onLeave }: PoolProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const svgRef = useRef<SVGSVGElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [cueBallTrail, setCueBallTrail] = useState<{ x: number; y: number }[]>([]);
  const [impactFlash, setImpactFlash] = useState<{ x: number; y: number } | null>(null);

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const pocketedBalls: number[] = gameData.pocketed || [];
  const playerXType: 'solids' | 'stripes' | null = gameData.player_x_type || null;
  const remainingBalls = Array.from({ length: 15 }, (_, i) => i + 1).filter(b => !pocketedBalls.includes(b));

  const myType = isPlayerX ? playerXType : (playerXType === 'solids' ? 'stripes' : playerXType === 'stripes' ? 'solids' : null);
  const myBalls = myType === 'solids' ? SOLIDS : myType === 'stripes' ? STRIPES : [];
  const myRemaining = myBalls.filter(b => !pocketedBalls.includes(b));
  const canShoot8 = myRemaining.length === 0 && myType !== null;

  const [ballPositions, setBallPositions] = useState(() => initBallPositions(remainingBalls));

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (payload) => {
          const ng = payload.new as unknown as Game;
          setGame(ng);
          const nd = (ng.game_data || {}) as Record<string, any>;
          const newRemaining = Array.from({ length: 15 }, (_, i) => i + 1).filter(b => !(nd.pocketed || []).includes(b));
          setBallPositions(initBallPositions(newRemaining));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  const getSvgPoint = useCallback((e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * TABLE_W,
      y: ((e.clientY - rect.top) / rect.height) * TABLE_H,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMyTurn || game.winner || game.status !== 'playing' || isAnimating) return;
    const pt = getSvgPoint(e);
    const cueBall = ballPositions[0];
    if (!cueBall) return;
    const dist = Math.hypot(pt.x - cueBall.x, pt.y - cueBall.y);
    if (dist > 25) return; // Must tap near cue ball
    setIsDragging(true);
    setDragStart(pt);
    setDragCurrent(pt);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [isMyTurn, game.winner, game.status, isAnimating, ballPositions, getSvgPoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragCurrent(getSvgPoint(e));
  }, [isDragging, getSvgPoint]);

  const handlePointerUp = useCallback(async (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.min(Math.hypot(dx, dy), 100);
    if (power < 5) return;

    setIsAnimating(true);
    sounds.click();

    // Simulate: power determines hit quality, direction aims at nearest ball
    const angle = Math.atan2(dy, dx);
    const success = Math.random() < (0.3 + (power / 150));

    // Animate cue ball movement
    const cueBall = ballPositions[0];
    const targetX = cueBall.x + Math.cos(angle) * power * 1.5;
    const targetY = cueBall.y + Math.sin(angle) * power * 1.5;

    // Trail animation
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await new Promise(r => setTimeout(r, 40));
      setCueBallTrail(prev => [...prev.slice(-6), {
        x: cueBall.x + (targetX - cueBall.x) * (i / steps),
        y: cueBall.y + (targetY - cueBall.y) * (i / steps),
      }]);
    }

    if (success && remainingBalls.length > 0) {
      // Pick which ball gets pocketed
      let targetBall: number;
      if (canShoot8) {
        targetBall = 8;
      } else if (!myType) {
        targetBall = remainingBalls.filter(b => b !== 8)[Math.floor(Math.random() * (remainingBalls.length - 1))];
      } else {
        const myAvail = myBalls.filter(b => remainingBalls.includes(b));
        targetBall = myAvail.length > 0
          ? myAvail[Math.floor(Math.random() * myAvail.length)]
          : remainingBalls.filter(b => b !== 8)[0];
      }

      if (targetBall) {
        setImpactFlash(ballPositions[targetBall] || { x: targetX, y: targetY });
        sounds.coinEarn();
        setTimeout(() => setImpactFlash(null), 500);

        const newPocketed = [...pocketedBalls, targetBall];
        const newGameData: Record<string, any> = { ...gameData, pocketed: newPocketed };

        if (!playerXType && targetBall !== 8) {
          const isSolid = SOLIDS.includes(targetBall);
          newGameData.player_x_type = isPlayerX ? (isSolid ? 'solids' : 'stripes') : (isSolid ? 'stripes' : 'solids');
        }

        const update: Record<string, unknown> = { game_data: newGameData };

        if (targetBall === 8) {
          update.status = 'finished';
          update.winner = canShoot8 ? userId : (isPlayerX ? game.player_o : game.player_x);
          if (canShoot8) sounds.win();
        } else {
          const curMyType = isPlayerX ? newGameData.player_x_type : (newGameData.player_x_type === 'solids' ? 'stripes' : 'solids');
          const isMyBall = curMyType === 'solids' ? SOLIDS.includes(targetBall) : STRIPES.includes(targetBall);
          update.current_turn = isMyBall ? userId : (isPlayerX ? game.player_o : game.player_x);
        }

        await supabase.from('games').update(update).eq('id', game.id);
      }
    } else {
      // Miss
      sounds.click();
      await supabase.from('games').update({
        current_turn: isPlayerX ? game.player_o : game.player_x,
      }).eq('id', game.id);
    }

    setTimeout(() => {
      setIsAnimating(false);
      setCueBallTrail([]);
    }, 300);
  }, [isDragging, dragStart, dragCurrent, ballPositions, remainingBalls, myBalls, myType, canShoot8, pocketedBalls, gameData, playerXType, isPlayerX, userId, game]);

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { pocketed: [], player_x_type: null },
      winner: null, is_draw: false, status: 'playing' as any, current_turn: game.player_x,
    }).eq('id', game.id);
  };

  const handleLeave = async () => {
    const other = isPlayerX ? game.player_o : game.player_x;
    if (!other) await supabase.from('games').delete().eq('id', game.id);
    else await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    onLeave();
  };

  const dragPower = isDragging ? Math.min(Math.hypot(dragStart.x - dragCurrent.x, dragStart.y - dragCurrent.y), 100) : 0;
  const dragAngle = isDragging ? Math.atan2(dragStart.y - dragCurrent.y, dragStart.x - dragCurrent.x) : 0;
  const cueBall = ballPositions[0];

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '🎱 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (isMyTurn) return `Dein Stoß! ${myType === 'solids' ? '(Volle)' : myType === 'stripes' ? '(Halbe)' : ''}`;
    return 'Gegner spielt…';
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">8-Ball Pool</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-sm font-medium px-4 py-2 rounded-full ${
              game.winner === userId ? 'bg-primary/15 text-primary' :
              game.winner ? 'bg-destructive/15 text-destructive' :
              isMyTurn ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {game.winner && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </motion.div>

          {game.status === 'playing' && !game.winner && (
            <div className="w-full max-w-md space-y-3">
              {/* Power meter */}
              {isDragging && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Power</span>
                  <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-destructive"
                      animate={{ width: `${dragPower}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-foreground">{Math.round(dragPower)}%</span>
                </motion.div>
              )}

              {/* Pool table SVG */}
              <svg
                ref={svgRef}
                viewBox={`0 0 ${TABLE_W} ${TABLE_H}`}
                className="w-full rounded-2xl touch-none select-none"
                style={{ background: 'linear-gradient(135deg, hsl(150,50%,20%), hsl(150,50%,28%))' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Table border */}
                <rect x="2" y="2" width={TABLE_W - 4} height={TABLE_H - 4} rx="8" fill="none" stroke="hsl(30,50%,25%)" strokeWidth="6" />
                <rect x="6" y="6" width={TABLE_W - 12} height={TABLE_H - 12} rx="5" fill="none" stroke="hsl(30,40%,35%)" strokeWidth="1" />

                {/* Pockets */}
                {POCKETS.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={POCKET_R} fill="hsl(0,0%,10%)" />
                ))}

                {/* Cue ball trail */}
                {cueBallTrail.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={BALL_R * 0.6} fill="white" opacity={0.15 + i * 0.05} />
                ))}

                {/* Balls */}
                {remainingBalls.map(b => {
                  const pos = ballPositions[b];
                  if (!pos) return null;
                  const isStripe = STRIPES.includes(b);
                  return (
                    <g key={b}>
                      <circle cx={pos.x} cy={pos.y} r={BALL_R} fill={BALL_COLORS[b]} />
                      {isStripe && <circle cx={pos.x} cy={pos.y} r={BALL_R * 0.5} fill="white" opacity="0.6" />}
                      <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="5" fill="white" fontWeight="bold">{b}</text>
                      <circle cx={pos.x} cy={pos.y} r={BALL_R} fill="url(#ballShine)" />
                    </g>
                  );
                })}

                {/* Cue ball */}
                {cueBall && (
                  <g>
                    <circle cx={cueBall.x} cy={cueBall.y} r={BALL_R} fill="white" stroke="hsl(0,0%,80%)" strokeWidth="0.5" />
                    <circle cx={cueBall.x} cy={cueBall.y} r={BALL_R} fill="url(#ballShine)" />
                    {isMyTurn && !isAnimating && (
                      <circle cx={cueBall.x} cy={cueBall.y} r={BALL_R + 3} fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.6">
                        <animate attributeName="r" values={`${BALL_R + 2};${BALL_R + 5};${BALL_R + 2}`} dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    )}
                  </g>
                )}

                {/* Aim line */}
                {isDragging && cueBall && (
                  <line
                    x1={cueBall.x}
                    y1={cueBall.y}
                    x2={cueBall.x + Math.cos(dragAngle) * 60}
                    y2={cueBall.y + Math.sin(dragAngle) * 60}
                    stroke="white"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                    opacity="0.7"
                  />
                )}

                {/* Impact flash */}
                {impactFlash && (
                  <circle cx={impactFlash.x} cy={impactFlash.y} r="15" fill="white" opacity="0.5">
                    <animate attributeName="r" from="5" to="20" dur="0.4s" />
                    <animate attributeName="opacity" from="0.8" to="0" dur="0.4s" />
                  </circle>
                )}

                {/* Ball shine gradient */}
                <defs>
                  <radialGradient id="ballShine" cx="35%" cy="35%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </radialGradient>
                </defs>
              </svg>

              <p className="text-[10px] text-muted-foreground text-center">
                {isMyTurn ? '👆 Ziehe von der weißen Kugel in Schussrichtung' : 'Warte auf den Gegner…'}
              </p>

              {/* Pocketed balls */}
              {pocketedBalls.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center">
                  <span className="text-[10px] text-muted-foreground mr-1">Versenkt:</span>
                  {pocketedBalls.map(b => (
                    <div key={b} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white opacity-60"
                      style={{ background: BALL_COLORS[b] }}>
                      {b}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {game.status === 'finished' && (
            <div className="flex gap-2 animate-fade-in">
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
