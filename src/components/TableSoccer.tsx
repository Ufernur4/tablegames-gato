import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

interface TableSoccerProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const FIELD_W = 300;
const FIELD_H = 180;
const BALL_R = 5;
const GOAL_H = 50;
const PLAYER_R = 7;
const GOAL_TOP = (FIELD_H - GOAL_H) / 2;
const GOAL_BOTTOM = GOAL_TOP + GOAL_H;

// Player rod positions (x positions for each team)
const MY_RODS = [
  { x: 60, players: [50, 90, 130] },   // Defense
  { x: 140, players: [40, 70, 100, 130] }, // Midfield
  { x: 220, players: [60, 90, 120] },  // Attack
];
const OP_RODS = [
  { x: FIELD_W - 60, players: [50, 90, 130] },
  { x: FIELD_W - 140, players: [40, 70, 100, 130] },
  { x: FIELD_W - 220, players: [60, 90, 120] },
];

export function TableSoccer({ game: initialGame, userId, onLeave }: TableSoccerProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const svgRef = useRef<SVGSVGElement>(null);

  const [ballPos, setBallPos] = useState({ x: FIELD_W / 2, y: FIELD_H / 2 });
  const [ballVel, setBallVel] = useState({ vx: 0, vy: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [goalAnim, setGoalAnim] = useState<'left' | 'right' | null>(null);
  const [confetti, setConfetti] = useState<{ x: number; y: number; id: number }[]>([]);
  const animRef = useRef<number>();
  const confettiId = useRef(0);

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const myScore = isPlayerX ? (gameData.score_x ?? 0) : (gameData.score_o ?? 0);
  const opScore = isPlayerX ? (gameData.score_o ?? 0) : (gameData.score_x ?? 0);
  const maxGoals = gameData.max_goals ?? 5;

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (payload) => setGame(payload.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  // Simple physics loop for ball
  useEffect(() => {
    if (ballVel.vx === 0 && ballVel.vy === 0) return;

    const step = () => {
      setBallPos(prev => {
        let nx = prev.x + ballVel.vx;
        let ny = prev.y + ballVel.vy;

        // Wall bounce
        if (ny <= BALL_R || ny >= FIELD_H - BALL_R) {
          setBallVel(v => ({ ...v, vy: -v.vy * 0.8 }));
          ny = Math.max(BALL_R, Math.min(FIELD_H - BALL_R, ny));
        }

        // Goal check - left
        if (nx <= BALL_R && ny > GOAL_TOP && ny < GOAL_BOTTOM) {
          setGoalAnim('left');
          sounds.score();
          spawnConfetti(10, FIELD_H / 2);
          setTimeout(() => handleGoal('right'), 1000);
          setBallVel({ vx: 0, vy: 0 });
          return { x: FIELD_W / 2, y: FIELD_H / 2 };
        }
        // Goal check - right
        if (nx >= FIELD_W - BALL_R && ny > GOAL_TOP && ny < GOAL_BOTTOM) {
          setGoalAnim('right');
          sounds.score();
          spawnConfetti(FIELD_W - 10, FIELD_H / 2);
          setTimeout(() => handleGoal('left'), 1000);
          setBallVel({ vx: 0, vy: 0 });
          return { x: FIELD_W / 2, y: FIELD_H / 2 };
        }

        // Wall bounce x
        if (nx <= BALL_R || nx >= FIELD_W - BALL_R) {
          setBallVel(v => ({ ...v, vx: -v.vx * 0.7 }));
          nx = Math.max(BALL_R, Math.min(FIELD_W - BALL_R, nx));
        }

        // Friction
        setBallVel(v => ({ vx: v.vx * 0.98, vy: v.vy * 0.98 }));
        if (Math.abs(ballVel.vx) < 0.1 && Math.abs(ballVel.vy) < 0.1) {
          setBallVel({ vx: 0, vy: 0 });
        }

        return { x: nx, y: ny };
      });

      animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [ballVel]);

  const spawnConfetti = (x: number, y: number) => {
    const particles = Array.from({ length: 8 }, () => ({
      x: x + (Math.random() - 0.5) * 40,
      y: y + (Math.random() - 0.5) * 40,
      id: confettiId.current++,
    }));
    setConfetti(particles);
    setTimeout(() => setConfetti([]), 1000);
  };

  const handleGoal = async (scorer: 'left' | 'right') => {
    setGoalAnim(null);
    // Left player = player_x, right = player_o
    const xScored = scorer === 'left';
    const newScoreX = (gameData.score_x ?? 0) + (xScored ? 1 : 0);
    const newScoreO = (gameData.score_o ?? 0) + (xScored ? 0 : 1);

    const update: Record<string, unknown> = {
      game_data: { ...gameData, score_x: newScoreX, score_o: newScoreO },
      current_turn: xScored ? game.player_o : game.player_x,
    };

    if (newScoreX >= maxGoals || newScoreO >= maxGoals) {
      update.status = 'finished';
      update.winner = newScoreX >= maxGoals ? game.player_x : game.player_o;
      sounds.win();
    }

    await supabase.from('games').update(update).eq('id', game.id);
  };

  const getSvgPoint = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * FIELD_W,
      y: ((e.clientY - rect.top) / rect.height) * FIELD_H,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMyTurn || game.winner || game.status !== 'playing') return;
    const pt = getSvgPoint(e);
    const dist = Math.hypot(pt.x - ballPos.x, pt.y - ballPos.y);
    if (dist > 30 && ballVel.vx === 0 && ballVel.vy === 0) return;
    setIsDragging(true);
    setDragStart(pt);
    setDragCurrent(pt);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [isMyTurn, game, ballPos, ballVel, getSvgPoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragCurrent(getSvgPoint(e));
  }, [isDragging, getSvgPoint]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.min(Math.hypot(dx, dy), 80);
    if (power < 5) return;

    const angle = Math.atan2(dy, dx);
    setBallVel({
      vx: Math.cos(angle) * power * 0.12,
      vy: Math.sin(angle) * power * 0.12,
    });
    sounds.click();
  }, [isDragging, dragStart, dragCurrent]);

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { score_x: 0, score_o: 0, max_goals: 5 },
      winner: null, is_draw: false, status: 'playing' as any, current_turn: game.player_x,
    }).eq('id', game.id);
    setBallPos({ x: FIELD_W / 2, y: FIELD_H / 2 });
    setBallVel({ vx: 0, vy: 0 });
  };

  const handleLeave = async () => {
    const other = isPlayerX ? game.player_o : game.player_x;
    if (!other) await supabase.from('games').delete().eq('id', game.id);
    else await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    onLeave();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">⚽ Tischfußball</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          {/* Score */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{isPlayerX ? myScore : opScore}</div>
              <div className="text-[10px] text-muted-foreground">{isPlayerX ? 'Du' : 'Gegner'}</div>
            </div>
            <div className="text-lg text-muted-foreground">:</div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{isPlayerX ? opScore : myScore}</div>
              <div className="text-[10px] text-muted-foreground">{isPlayerX ? 'Gegner' : 'Du'}</div>
            </div>
          </div>

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`text-sm font-medium px-4 py-2 rounded-full ${
              game.winner === userId ? 'bg-primary/15 text-primary' :
              game.winner ? 'bg-destructive/15 text-destructive' :
              isMyTurn ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {game.winner && <Trophy className="w-4 h-4 inline mr-1" />}
            {game.status === 'waiting' ? 'Warte auf Mitspieler…' :
             game.winner === userId ? '⚽ Du hast gewonnen!' :
             game.winner ? 'Du hast verloren.' :
             isMyTurn ? 'Dein Anstoß! Wische über den Ball!' : 'Gegner spielt…'}
          </motion.div>

          {/* Field */}
          {game.status === 'playing' && !game.winner && (
            <div className="w-full max-w-md space-y-3">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
                className="w-full rounded-2xl touch-none select-none shadow-lg"
                style={{ background: 'linear-gradient(135deg, hsl(130,50%,28%), hsl(130,50%,35%))' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Field lines */}
                <line x1={FIELD_W / 2} y1="0" x2={FIELD_W / 2} y2={FIELD_H} stroke="white" strokeWidth="1" opacity="0.3" />
                <circle cx={FIELD_W / 2} cy={FIELD_H / 2} r="25" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
                <circle cx={FIELD_W / 2} cy={FIELD_H / 2} r="2" fill="white" opacity="0.3" />

                {/* Goals */}
                <rect x="0" y={GOAL_TOP} width="6" height={GOAL_H} rx="1" fill="none" stroke="white" strokeWidth="2" opacity="0.8" />
                <rect x={FIELD_W - 6} y={GOAL_TOP} width="6" height={GOAL_H} rx="1" fill="none" stroke="white" strokeWidth="2" opacity="0.8" />

                {/* My players (left/blue) */}
                {MY_RODS.map((rod, ri) => (
                  <g key={`my-${ri}`}>
                    <line x1={rod.x} y1="5" x2={rod.x} y2={FIELD_H - 5} stroke="hsl(210,10%,40%)" strokeWidth="2" opacity="0.4" />
                    {rod.players.map((py, pi) => (
                      <g key={pi}>
                        <circle cx={rod.x} cy={py} r={PLAYER_R} fill="hsl(210,80%,55%)" stroke="hsl(210,80%,40%)" strokeWidth="1.5" />
                        <circle cx={rod.x} cy={py} r={PLAYER_R - 3} fill="hsl(210,80%,65%)" opacity="0.5" />
                      </g>
                    ))}
                  </g>
                ))}

                {/* Opponent players (right/red) */}
                {OP_RODS.map((rod, ri) => (
                  <g key={`op-${ri}`}>
                    <line x1={rod.x} y1="5" x2={rod.x} y2={FIELD_H - 5} stroke="hsl(0,10%,40%)" strokeWidth="2" opacity="0.4" />
                    {rod.players.map((py, pi) => (
                      <g key={pi}>
                        <circle cx={rod.x} cy={py} r={PLAYER_R} fill="hsl(0,70%,50%)" stroke="hsl(0,70%,35%)" strokeWidth="1.5" />
                        <circle cx={rod.x} cy={py} r={PLAYER_R - 3} fill="hsl(0,70%,60%)" opacity="0.5" />
                      </g>
                    ))}
                  </g>
                ))}

                {/* Ball */}
                <circle cx={ballPos.x} cy={ballPos.y} r={BALL_R} fill="white" />
                <circle cx={ballPos.x} cy={ballPos.y} r={BALL_R} fill="url(#soccerShine)" />
                {isMyTurn && ballVel.vx === 0 && ballVel.vy === 0 && (
                  <circle cx={ballPos.x} cy={ballPos.y} r={BALL_R + 4} fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.5">
                    <animate attributeName="r" values={`${BALL_R + 3};${BALL_R + 7};${BALL_R + 3}`} dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0.15;0.5" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Aim line */}
                {isDragging && (
                  <line
                    x1={ballPos.x} y1={ballPos.y}
                    x2={ballPos.x + (dragStart.x - dragCurrent.x)}
                    y2={ballPos.y + (dragStart.y - dragCurrent.y)}
                    stroke="white" strokeWidth="1" strokeDasharray="3,3" opacity="0.5"
                  />
                )}

                {/* Goal animation */}
                <AnimatePresence>
                  {goalAnim && (
                    <text x={FIELD_W / 2} y={FIELD_H / 2} textAnchor="middle" dominantBaseline="middle" fontSize="28" fill="white" fontWeight="bold" opacity="0.9">
                      ⚽ TOR!
                    </text>
                  )}
                </AnimatePresence>

                {/* Confetti */}
                {confetti.map(p => (
                  <circle key={p.id} cx={p.x} cy={p.y} r="2" fill={`hsl(${Math.random() * 360},80%,60%)`}>
                    <animate attributeName="cy" from={p.y} to={p.y - 30} dur="0.8s" />
                    <animate attributeName="opacity" from="1" to="0" dur="0.8s" />
                  </circle>
                ))}

                <defs>
                  <radialGradient id="soccerShine" cx="35%" cy="35%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </radialGradient>
                </defs>
              </svg>

              <p className="text-[10px] text-muted-foreground text-center">
                {isMyTurn ? '👆 Wische über den Ball um zu schießen' : 'Warte auf den Gegner…'}
              </p>
            </div>
          )}

          {game.status === 'finished' && (
            <div className="flex gap-2 animate-fade-in">
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
