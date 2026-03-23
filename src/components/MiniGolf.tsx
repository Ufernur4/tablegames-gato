import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion } from 'framer-motion';

interface MiniGolfProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const TOTAL_HOLES = 5;
const PAR = [3, 2, 4, 3, 2];
const COURSE_W = 300;
const COURSE_H = 140;

// Different hole layouts
const HOLE_LAYOUTS = [
  { ballStart: { x: 40, y: 70 }, hole: { x: 260, y: 70 }, obstacles: [] },
  { ballStart: { x: 40, y: 100 }, hole: { x: 260, y: 40 }, obstacles: [{ x: 150, y: 50, w: 10, h: 60 }] },
  { ballStart: { x: 40, y: 70 }, hole: { x: 260, y: 70 }, obstacles: [{ x: 120, y: 20, w: 10, h: 50 }, { x: 180, y: 70, w: 10, h: 50 }] },
  { ballStart: { x: 40, y: 40 }, hole: { x: 260, y: 110 }, obstacles: [{ x: 140, y: 30, w: 10, h: 80 }] },
  { ballStart: { x: 40, y: 70 }, hole: { x: 260, y: 70 }, obstacles: [] },
];

export function MiniGolf({ game: initialGame, userId, onLeave }: MiniGolfProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const svgRef = useRef<SVGSVGElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const [ballPos, setBallPos] = useState({ x: 40, y: 70 });
  const [isRolling, setIsRolling] = useState(false);
  const [ballTrail, setBallTrail] = useState<{ x: number; y: number }[]>([]);
  const [holeInAnim, setHoleInAnim] = useState(false);

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const playerXScores: number[] = gameData.player_x_holes || [];
  const playerOScores: number[] = gameData.player_o_holes || [];
  const currentHole = gameData.current_hole ?? 0;
  const currentStrokes = gameData.current_strokes ?? 0;

  const myScores = isPlayerX ? playerXScores : playerOScores;
  const opScores = isPlayerX ? playerOScores : playerXScores;
  const myTotal = myScores.reduce((a: number, b: number) => a + b, 0);
  const opTotal = opScores.reduce((a: number, b: number) => a + b, 0);

  const layout = HOLE_LAYOUTS[Math.min(currentHole, HOLE_LAYOUTS.length - 1)];

  useEffect(() => {
    setBallPos(layout.ballStart);
  }, [currentHole]);

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (payload) => setGame(payload.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  const getSvgPoint = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * COURSE_W,
      y: ((e.clientY - rect.top) / rect.height) * COURSE_H,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMyTurn || game.winner || game.status !== 'playing' || isRolling) return;
    const pt = getSvgPoint(e);
    const dist = Math.hypot(pt.x - ballPos.x, pt.y - ballPos.y);
    if (dist > 30) return;
    setIsDragging(true);
    setDragStart(pt);
    setDragCurrent(pt);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [isMyTurn, game, isRolling, ballPos, getSvgPoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragCurrent(getSvgPoint(e));
  }, [isDragging, getSvgPoint]);

  const handlePointerUp = useCallback(async () => {
    if (!isDragging) return;
    setIsDragging(false);

    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const power = Math.min(Math.hypot(dx, dy), 120);
    if (power < 8) return;

    setIsRolling(true);
    sounds.click();

    const angle = Math.atan2(dy, dx);
    const targetX = ballPos.x + Math.cos(angle) * power * 1.5;
    const targetY = ballPos.y + Math.sin(angle) * power * 1.5;

    // Clamp to course bounds
    const finalX = Math.max(10, Math.min(COURSE_W - 10, targetX));
    const finalY = Math.max(10, Math.min(COURSE_H - 10, targetY));

    // Animate ball rolling
    const steps = 12;
    const trail: { x: number; y: number }[] = [];
    for (let i = 1; i <= steps; i++) {
      await new Promise(r => setTimeout(r, 50));
      const nx = ballPos.x + (finalX - ballPos.x) * (i / steps);
      const ny = ballPos.y + (finalY - ballPos.y) * (i / steps);
      setBallPos({ x: nx, y: ny });
      trail.push({ x: nx, y: ny });
      setBallTrail([...trail].slice(-8));
    }

    const newStrokes = currentStrokes + 1;
    const distToHole = Math.hypot(finalX - layout.hole.x, finalY - layout.hole.y);
    const isInHole = distToHole < 15 || newStrokes >= 6;

    if (isInHole) {
      setHoleInAnim(true);
      sounds.score();
      setTimeout(() => setHoleInAnim(false), 1000);

      const framesKey = isPlayerX ? 'player_x_holes' : 'player_o_holes';
      const currentScores = isPlayerX ? playerXScores : playerOScores;
      const holeScore = distToHole < 15 ? newStrokes : 6;
      const newScores = [...currentScores, holeScore];

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

      const xDone = (isPlayerX ? newScores : playerXScores).length >= TOTAL_HOLES;
      const oDone = (isPlayerX ? playerOScores : newScores).length >= TOTAL_HOLES;
      if (xDone && oDone) {
        const xTotal = (isPlayerX ? newScores : playerXScores).reduce((a, b) => a + b, 0);
        const oTotal = (isPlayerX ? playerOScores : newScores).reduce((a, b) => a + b, 0);
        update.status = 'finished';
        if (xTotal < oTotal) update.winner = game.player_x;
        else if (oTotal < xTotal) update.winner = game.player_o;
        else update.is_draw = true;
        sounds.win();
      }

      await supabase.from('games').update(update).eq('id', game.id);
    } else {
      setBallPos({ x: finalX, y: finalY });
      await supabase.from('games').update({
        game_data: { ...gameData, current_strokes: newStrokes, ball_position: Math.round(distToHole) },
      }).eq('id', game.id);
    }

    setTimeout(() => { setIsRolling(false); setBallTrail([]); }, 300);
  }, [isDragging, dragStart, dragCurrent, ballPos, currentStrokes, layout, gameData, isPlayerX, playerXScores, playerOScores, currentHole, userId, game]);

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

  const dragPower = isDragging ? Math.min(Math.hypot(dragStart.x - dragCurrent.x, dragStart.y - dragCurrent.y), 120) : 0;
  const dragAngle = isDragging ? Math.atan2(dragStart.y - dragCurrent.y, dragStart.x - dragCurrent.x) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Mini Golf</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          {/* Scorecard */}
          <div className="w-full max-w-md">
            <div className="bg-card/50 border border-border rounded-xl p-3">
              <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                <div className="text-muted-foreground">Loch</div>
                {Array.from({ length: TOTAL_HOLES }).map((_, i) => (
                  <div key={i} className={`font-medium ${i === currentHole ? 'text-primary' : 'text-muted-foreground'}`}>{i + 1}</div>
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
             game.winner === userId ? '⛳ Du hast gewonnen!' :
             game.winner ? 'Du hast verloren.' :
             game.is_draw ? 'Unentschieden!' :
             isMyTurn ? `Loch ${Math.min(currentHole + 1, TOTAL_HOLES)} – Schlag ${currentStrokes + 1}` :
             'Gegner puttet…'}
          </motion.div>

          {/* Golf course */}
          {game.status === 'playing' && !game.winner && (
            <div className="w-full max-w-md space-y-3">
              {isDragging && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Power</span>
                  <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                      animate={{ width: `${(dragPower / 120) * 100}%` }} />
                  </div>
                </motion.div>
              )}

              <svg
                ref={svgRef}
                viewBox={`0 0 ${COURSE_W} ${COURSE_H}`}
                className="w-full rounded-2xl touch-none select-none"
                style={{ background: 'linear-gradient(135deg, hsl(140,40%,22%), hsl(140,50%,30%))' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Course border */}
                <rect x="3" y="3" width={COURSE_W - 6} height={COURSE_H - 6} rx="6" fill="none" stroke="hsl(140,30%,18%)" strokeWidth="4" />

                {/* Obstacles */}
                {layout.obstacles.map((obs, i) => (
                  <rect key={i} x={obs.x} y={obs.y} width={obs.w} height={obs.h} rx="2" fill="hsl(30,50%,35%)" stroke="hsl(30,40%,25%)" strokeWidth="1" />
                ))}

                {/* Hole */}
                <circle cx={layout.hole.x} cy={layout.hole.y} r="8" fill="hsl(0,0%,10%)" />
                <circle cx={layout.hole.x} cy={layout.hole.y} r="5" fill="hsl(0,0%,5%)" />
                {/* Flag */}
                <line x1={layout.hole.x} y1={layout.hole.y - 5} x2={layout.hole.x} y2={layout.hole.y - 25} stroke="hsl(0,0%,80%)" strokeWidth="1" />
                <polygon points={`${layout.hole.x},${layout.hole.y - 25} ${layout.hole.x + 12},${layout.hole.y - 20} ${layout.hole.x},${layout.hole.y - 15}`} fill="hsl(0,70%,50%)" />

                {/* Ball trail */}
                {ballTrail.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r="2" fill="white" opacity={0.1 + i * 0.06} />
                ))}

                {/* Golf ball */}
                <circle cx={ballPos.x} cy={ballPos.y} r="4" fill="white" stroke="hsl(0,0%,85%)" strokeWidth="0.5" />
                {isMyTurn && !isRolling && (
                  <circle cx={ballPos.x} cy={ballPos.y} r="7" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.5">
                    <animate attributeName="r" values="6;9;6" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0.15;0.5" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Aim line */}
                {isDragging && (
                  <line
                    x1={ballPos.x} y1={ballPos.y}
                    x2={ballPos.x + Math.cos(dragAngle) * 50}
                    y2={ballPos.y + Math.sin(dragAngle) * 50}
                    stroke="white" strokeWidth="1" strokeDasharray="3,3" opacity="0.6"
                  />
                )}

                {/* Hole-in animation */}
                {holeInAnim && (
                  <g>
                    <circle cx={layout.hole.x} cy={layout.hole.y} r="3" fill="gold">
                      <animate attributeName="r" from="3" to="25" dur="0.6s" />
                      <animate attributeName="opacity" from="0.8" to="0" dur="0.6s" />
                    </circle>
                  </g>
                )}
              </svg>

              <p className="text-[10px] text-muted-foreground text-center">
                {isMyTurn ? '👆 Ziehe vom Ball weg um Richtung & Stärke zu wählen' : 'Warte auf den Gegner…'}
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
