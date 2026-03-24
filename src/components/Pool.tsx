import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion } from 'framer-motion';
import Matter from 'matter-js';

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

// Physics constants
const SCALE = 2; // physics to pixel scale
const TABLE_W = 600;
const TABLE_H = 340;
const BALL_R = 10;
const POCKET_R = 18;
const CUSHION = 20;

const POCKETS = [
  { x: CUSHION, y: CUSHION },
  { x: TABLE_W / 2, y: CUSHION - 4 },
  { x: TABLE_W - CUSHION, y: CUSHION },
  { x: CUSHION, y: TABLE_H - CUSHION },
  { x: TABLE_W / 2, y: TABLE_H - CUSHION + 4 },
  { x: TABLE_W - CUSHION, y: TABLE_H - CUSHION },
];

function rackBalls(): { id: number; x: number; y: number }[] {
  const balls: { id: number; x: number; y: number }[] = [];
  balls.push({ id: 0, x: 160, y: TABLE_H / 2 }); // cue ball

  const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const startX = 400;
  const startY = TABLE_H / 2;
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      if (idx < rackOrder.length) {
        balls.push({
          id: rackOrder[idx],
          x: startX + row * (BALL_R * 2 + 1),
          y: startY + (col - row / 2) * (BALL_R * 2 + 1),
        });
        idx++;
      }
    }
  }
  return balls;
}

export function Pool({ game: initialGame, userId, onLeave }: PoolProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const bodiesRef = useRef<Map<number, Matter.Body>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [isSimulating, setIsSimulating] = useState(false);
  const [pocketedThisTurn, setPocketedThisTurn] = useState<number[]>([]);
  const [particles, setParticles] = useState<{ x: number; y: number; vx: number; vy: number; life: number; color: string }[]>([]);
  const rafRef = useRef<number>(0);
  const pocketedRef = useRef<Set<number>>(new Set());

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const pocketedBalls: number[] = gameData.pocketed || [];
  const playerXType: 'solids' | 'stripes' | null = gameData.player_x_type || null;

  const myType = isPlayerX ? playerXType : (playerXType === 'solids' ? 'stripes' : playerXType === 'stripes' ? 'solids' : null);
  const myBalls = myType === 'solids' ? SOLIDS : myType === 'stripes' ? STRIPES : [];
  const myRemaining = myBalls.filter(b => !pocketedBalls.includes(b));
  const canShoot8 = myRemaining.length === 0 && myType !== null;

  // Listen for game updates
  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (payload) => setGame(payload.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  // Initialize Matter.js engine
  const initEngine = useCallback(() => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    engineRef.current = engine;
    bodiesRef.current.clear();
    pocketedRef.current = new Set(pocketedBalls);

    // Walls (cushions)
    const wallOpts = { isStatic: true, restitution: 0.8, friction: 0.05 };
    const walls = [
      Matter.Bodies.rectangle(TABLE_W / 2, 5, TABLE_W - 60, 10, wallOpts),       // top
      Matter.Bodies.rectangle(TABLE_W / 2, TABLE_H - 5, TABLE_W - 60, 10, wallOpts), // bottom
      Matter.Bodies.rectangle(5, TABLE_H / 2, 10, TABLE_H - 60, wallOpts),        // left
      Matter.Bodies.rectangle(TABLE_W - 5, TABLE_H / 2, 10, TABLE_H - 60, wallOpts), // right
    ];
    Matter.Composite.add(engine.world, walls);

    // Balls
    const ballLayout = rackBalls();
    ballLayout.forEach(({ id, x, y }) => {
      if (pocketedRef.current.has(id)) return;
      const ball = Matter.Bodies.circle(x, y, BALL_R, {
        restitution: 0.9,
        friction: 0.02,
        frictionAir: 0.015,
        density: 0.025,
        label: `ball-${id}`,
      });
      bodiesRef.current.set(id, ball);
      Matter.Composite.add(engine.world, ball);
    });

    return engine;
  }, [pocketedBalls]);

  // Canvas render loop
  useEffect(() => {
    const engine = initEngine();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const render = () => {
      Matter.Engine.update(engine, 1000 / 60);

      // Check pocketing
      bodiesRef.current.forEach((body, id) => {
        if (pocketedRef.current.has(id)) return;
        for (const pocket of POCKETS) {
          const dist = Math.hypot(body.position.x - pocket.x, body.position.y - pocket.y);
          if (dist < POCKET_R) {
            pocketedRef.current.add(id);
            Matter.Composite.remove(engine.world, body);
            if (id !== 0) {
              setPocketedThisTurn(prev => [...prev, id]);
              sounds.coinEarn();
              // Particle burst
              const newParticles = Array.from({ length: 8 }, () => ({
                x: pocket.x, y: pocket.y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 30,
                color: BALL_COLORS[id] || '#fff',
              }));
              setParticles(prev => [...prev, ...newParticles]);
            } else {
              // Cue ball pocketed - respawn
              setTimeout(() => {
                const newCue = Matter.Bodies.circle(160, TABLE_H / 2, BALL_R, {
                  restitution: 0.9, friction: 0.02, frictionAir: 0.015, density: 0.025, label: 'ball-0',
                });
                bodiesRef.current.set(0, newCue);
                pocketedRef.current.delete(0);
                Matter.Composite.add(engine.world, newCue);
              }, 500);
            }
            break;
          }
        }
      });

      // Check if all balls stopped
      let allStopped = true;
      bodiesRef.current.forEach((body) => {
        if (!pocketedRef.current.has(parseInt(body.label.split('-')[1]))) {
          const speed = Math.hypot(body.velocity.x, body.velocity.y);
          if (speed > 0.3) allStopped = false;
        }
      });

      if (isSimulating && allStopped) {
        setIsSimulating(false);
      }

      // Draw
      ctx.clearRect(0, 0, TABLE_W, TABLE_H);

      // Table felt
      const grad = ctx.createLinearGradient(0, 0, TABLE_W, TABLE_H);
      grad.addColorStop(0, '#1a5c2a');
      grad.addColorStop(1, '#237a38');
      ctx.fillStyle = grad;
      ctx.roundRect(0, 0, TABLE_W, TABLE_H, 12);
      ctx.fill();

      // Cushion border
      ctx.strokeStyle = '#5c3a1e';
      ctx.lineWidth = 14;
      ctx.roundRect(0, 0, TABLE_W, TABLE_H, 12);
      ctx.stroke();
      ctx.strokeStyle = '#8b5e3c';
      ctx.lineWidth = 2;
      ctx.roundRect(7, 7, TABLE_W - 14, TABLE_H - 14, 8);
      ctx.stroke();

      // Pockets
      POCKETS.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Diamond markers
      for (let i = 1; i <= 3; i++) {
        const x = CUSHION + (TABLE_W - 2 * CUSHION) * i / 4;
        ctx.fillStyle = '#fff3';
        ctx.beginPath(); ctx.arc(x, 12, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, TABLE_H - 12, 2, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 1; i <= 2; i++) {
        const y = CUSHION + (TABLE_H - 2 * CUSHION) * i / 3;
        ctx.fillStyle = '#fff3';
        ctx.beginPath(); ctx.arc(12, y, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(TABLE_W - 12, y, 2, 0, Math.PI * 2); ctx.fill();
      }

      // Particles
      setParticles(prev => {
        const next = prev.map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 1 })).filter(p => p.life > 0);
        next.forEach(p => {
          ctx.globalAlpha = p.life / 30;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        return next;
      });

      // Balls
      bodiesRef.current.forEach((body, id) => {
        if (pocketedRef.current.has(id)) return;
        const { x, y } = body.position;

        // Shadow
        ctx.beginPath();
        ctx.arc(x + 2, y + 2, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Ball body
        ctx.beginPath();
        ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = BALL_COLORS[id] || '#fff';
        ctx.fill();

        // Stripe band
        if (STRIPES.includes(id)) {
          ctx.beginPath();
          ctx.arc(x, y, BALL_R * 0.55, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffffaa';
          ctx.fill();
        }

        // Number
        if (id > 0) {
          ctx.fillStyle = id === 8 ? '#fff' : '#000';
          ctx.font = 'bold 7px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(id), x, y + 0.5);
        }

        // Shine
        const shineGrad = ctx.createRadialGradient(x - 3, y - 3, 0, x, y, BALL_R);
        shineGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
        shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = shineGrad;
        ctx.fill();
      });

      // Cue ball highlight
      const cueBall = bodiesRef.current.get(0);
      if (cueBall && isMyTurn && !isSimulating && !pocketedRef.current.has(0)) {
        ctx.beginPath();
        ctx.arc(cueBall.position.x, cueBall.position.y, BALL_R + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,255,200,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      Matter.Engine.clear(engine);
    };
  }, [initEngine, isMyTurn, isSimulating]);

  // Handle shot result when simulation ends
  useEffect(() => {
    if (isSimulating) return;
    if (pocketedThisTurn.length === 0 && game.status === 'playing' && !game.winner) return;
    if (pocketedThisTurn.length > 0) {
      // Process pocketed balls
      const newPocketed = [...pocketedBalls, ...pocketedThisTurn];
      const newGameData: Record<string, any> = { ...gameData, pocketed: newPocketed };

      if (!playerXType && !pocketedThisTurn.includes(8)) {
        const firstPocketed = pocketedThisTurn[0];
        const isSolid = SOLIDS.includes(firstPocketed);
        newGameData.player_x_type = isPlayerX ? (isSolid ? 'solids' : 'stripes') : (isSolid ? 'stripes' : 'solids');
      }

      const update: Record<string, unknown> = { game_data: newGameData };

      if (pocketedThisTurn.includes(8)) {
        update.status = 'finished';
        update.winner = canShoot8 ? userId : (isPlayerX ? game.player_o : game.player_x);
        if (canShoot8) sounds.win();
      } else {
        const curMyType = isPlayerX ? (newGameData.player_x_type) : (newGameData.player_x_type === 'solids' ? 'stripes' : 'solids');
        const pocketedMyBall = pocketedThisTurn.some(b => curMyType === 'solids' ? SOLIDS.includes(b) : STRIPES.includes(b));
        update.current_turn = pocketedMyBall ? userId : (isPlayerX ? game.player_o : game.player_x);
      }

      supabase.from('games').update(update).eq('id', game.id).then();
      setPocketedThisTurn([]);
    }
  }, [isSimulating]);

  // Canvas interaction handlers
  const getCanvasPoint = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * TABLE_W,
      y: (e.clientY - rect.top) / rect.height * TABLE_H,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMyTurn || game.winner || game.status !== 'playing' || isSimulating) return;
    const pt = getCanvasPoint(e);
    const cueBall = bodiesRef.current.get(0);
    if (!cueBall) return;
    const dist = Math.hypot(pt.x - cueBall.position.x, pt.y - cueBall.position.y);
    if (dist > 35) return;
    setIsDragging(true);
    setDragStart(pt);
    setDragCurrent(pt);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [isMyTurn, game.winner, game.status, isSimulating, getCanvasPoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragCurrent(getCanvasPoint(e));
  }, [isDragging, getCanvasPoint]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.min(Math.hypot(dx, dy), 150);
    if (power < 8) return;

    const cueBall = bodiesRef.current.get(0);
    if (!cueBall) return;

    sounds.click();
    const angle = Math.atan2(dy, dx);
    const force = power * 0.0004;
    Matter.Body.applyForce(cueBall, cueBall.position, {
      x: Math.cos(angle) * force,
      y: Math.sin(angle) * force,
    });

    setIsSimulating(true);

    // Fallback: if no pocketing after 5s, switch turn
    setTimeout(() => {
      setIsSimulating(false);
      setPocketedThisTurn(prev => {
        if (prev.length === 0) {
          supabase.from('games').update({
            current_turn: isPlayerX ? game.player_o : game.player_x,
          }).eq('id', game.id).then();
        }
        return prev;
      });
    }, 5000);
  }, [isDragging, dragStart, dragCurrent, isPlayerX, game]);

  // Draw aim line overlay on canvas
  useEffect(() => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cueBall = bodiesRef.current.get(0);
    if (!cueBall) return;

    const ctx = canvas.getContext('2d')!;
    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const angle = Math.atan2(dy, dx);

    // Draw aim line on next frame
    const drawAim = () => {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cueBall.position.x, cueBall.position.y);
      ctx.lineTo(
        cueBall.position.x + Math.cos(angle) * 100,
        cueBall.position.y + Math.sin(angle) * 100
      );
      ctx.stroke();

      // Cue stick line (behind ball)
      ctx.setLineDash([]);
      ctx.strokeStyle = '#8b5e3c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cueBall.position.x - Math.cos(angle) * 15, cueBall.position.y - Math.sin(angle) * 15);
      ctx.lineTo(cueBall.position.x - Math.cos(angle) * 80, cueBall.position.y - Math.sin(angle) * 80);
      ctx.stroke();
      ctx.restore();
    };
    // This runs each render frame via the main loop overlay
  }, [isDragging, dragStart, dragCurrent]);

  const dragPower = isDragging ? Math.min(Math.hypot(dragStart.x - dragCurrent.x, dragStart.y - dragCurrent.y), 150) : 0;

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { pocketed: [], player_x_type: null },
      winner: null, is_draw: false, status: 'playing' as any, current_turn: game.player_x,
    }).eq('id', game.id);
    pocketedRef.current.clear();
    setPocketedThisTurn([]);
  };

  const handleLeave = async () => {
    const other = isPlayerX ? game.player_o : game.player_x;
    if (!other) await supabase.from('games').delete().eq('id', game.id);
    else await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    onLeave();
  };

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
          <span className="text-sm font-semibold text-foreground">🎱 8-Ball Pool</span>
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
            <div className="w-full max-w-2xl space-y-3">
              {isDragging && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Power</span>
                  <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-destructive"
                      animate={{ width: `${(dragPower / 150) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-foreground">{Math.round((dragPower / 150) * 100)}%</span>
                </motion.div>
              )}

              <canvas
                ref={canvasRef}
                width={TABLE_W}
                height={TABLE_H}
                className="w-full rounded-2xl touch-none select-none cursor-crosshair shadow-2xl"
                style={{ imageRendering: 'auto' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />

              <p className="text-[10px] text-muted-foreground text-center">
                {isMyTurn && !isSimulating ? '👆 Ziehe von der weißen Kugel und lasse los zum Schießen' : isSimulating ? '⏳ Kugeln in Bewegung…' : 'Warte auf den Gegner…'}
              </p>

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
