import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';
import { DartBoard } from '@/components/darts/DartBoard';
import { DartsScoreboard } from '@/components/darts/DartsScoreboard';
import { DartsHitDisplay } from '@/components/darts/DartsHitDisplay';
import { useDartThrow } from '@/components/darts/useDartThrow';

interface DartsProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

export function Darts({ game: initialGame, userId, onLeave }: DartsProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [error, setError] = useState('');
  const [particles, setParticles] = useState<{ x: number; y: number; id: number; color: string }[]>([]);
  const boardRef = useRef<SVGSVGElement>(null!);
  const containerRef = useRef<HTMLDivElement>(null);
  const pidRef = useRef(0);

  const gameData = (game.game_data || {}) as Record<string, any>;
  const playerXScore = gameData.player_x_score ?? 301;
  const playerOScore = gameData.player_o_score ?? 301;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const myScore = isPlayerX ? playerXScore : playerOScore;
  const opponentScore = isPlayerX ? playerOScore : playerXScore;

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (payload) => setGame(payload.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

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
    await supabase.from('games').update(update).eq('id', game.id);
  }, [isMyTurn, game, isPlayerX, playerXScore, playerOScore, gameData, userId]);

  const spawnParticles = useCallback((svgX: number, svgY: number, points: number) => {
    if (!boardRef.current || !containerRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const px = rect.left + rect.width / 2 + (svgX / 180) * (rect.width / 2);
    const py = rect.top + rect.height / 2 + (svgY / 180) * (rect.height / 2);
    const color = points >= 50 ? 'hsl(175,85%,50%)' : points >= 25 ? 'hsl(85,75%,55%)' : 'hsl(320,80%,60%)';
    const newP = Array.from({ length: 10 }, () => ({
      x: px + (Math.random() - 0.5) * 50,
      y: py + (Math.random() - 0.5) * 50,
      id: pidRef.current++,
      color,
    }));
    setParticles(p => [...p, ...newP]);
    setTimeout(() => setParticles(p => p.filter(pp => !newP.find(n => n.id === pp.id))), 700);
  }, []);

  const onHit = useCallback((hit: { points: number; label: string }, dart: { x: number; y: number }) => {
    setError('');
    spawnParticles(dart.x, dart.y, hit.points);
    submitThrow(hit.points);
  }, [spawnParticles, submitThrow]);

  const canThrow = isMyTurn && game.status === 'playing' && !game.winner;
  const { darts, currentDart, lastHit, throwState, handlePointerDown, handlePointerMove, handlePointerUp, reset, dartsLeft } = 
    useDartThrow(canThrow, 3, onHit);

  // Reset darts on turn change
  useEffect(() => { reset(); }, [game.current_turn, reset]);

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

  const statusText = game.status === 'waiting' ? 'Warte auf Mitspieler…' :
    game.winner === userId ? '🎯 Du hast gewonnen!' :
    game.winner ? 'Du hast verloren.' :
    isMyTurn ? '↑ Wische nach oben zum Werfen' : 'Gegner wirft…';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Impact particles */}
      <AnimatePresence>
        {particles.map(p => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 0, y: -30 + Math.random() * 60, x: (Math.random() - 0.5) * 40 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="fixed pointer-events-none z-50"
            style={{ left: p.x, top: p.y }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}` }} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-border px-4 py-2.5 flex items-center justify-between glass sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground h-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-bold text-foreground">🎯 Darts 301</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-3 overflow-y-auto">
          {/* Scoreboard */}
          <DartsScoreboard
            myScore={myScore} opponentScore={opponentScore}
            isMyTurn={isMyTurn} dartsLeft={dartsLeft}
            isWinner={game.winner === userId} isLoser={!!game.winner && game.winner !== userId}
            isWaiting={game.status === 'waiting'} statusText={statusText}
          />

          {/* Hit display */}
          <DartsHitDisplay lastHit={lastHit} error={error} />

          {/* Power meter */}
          <AnimatePresence>
            {throwState.isDragging && (
              <motion.div
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0 }}
                className="w-3 h-28 rounded-full bg-secondary/50 overflow-hidden relative border border-border"
              >
                <motion.div
                  animate={{ height: `${throwState.power * 100}%` }}
                  className="absolute bottom-0 w-full rounded-full"
                  style={{
                    background: `linear-gradient(to top, hsl(var(--primary)), hsl(var(--neon-lime)))`,
                    boxShadow: `0 0 ${throwState.power * 16}px hsl(var(--primary) / ${throwState.power * 0.5})`,
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dartboard + throw area */}
          {game.status === 'playing' && !game.winner && (
            <div
              ref={containerRef}
              className="relative w-full max-w-xs aspect-square touch-none select-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ perspective: '800px' }}
            >
              {/* 3D tilt on board */}
              <motion.div
                animate={{
                  rotateX: throwState.isDragging ? 5 : 0,
                  rotateY: throwState.isDragging
                    ? (throwState.dragCurrent.x - throwState.dragStart.x) * 0.03
                    : 0,
                  scale: throwState.isDragging ? 1.02 : 1,
                }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="w-full h-full"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <DartBoard darts={darts} svgRef={boardRef} />
              </motion.div>

              {/* Dart in hand */}
              {!throwState.throwAnim && canThrow && currentDart < 3 && (
                <motion.div
                  animate={{
                    x: throwState.isDragging ? (throwState.dragCurrent.x - throwState.dragStart.x) * 0.25 : 0,
                    y: throwState.isDragging ? Math.min(0, (throwState.dragCurrent.y - throwState.dragStart.y) * 0.25) : 0,
                    rotate: throwState.isDragging ? -30 + (throwState.dragCurrent.x - throwState.dragStart.x) * 0.1 : 0,
                    scale: throwState.isDragging ? 1.3 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 text-4xl pointer-events-none select-none"
                  style={{ filter: throwState.isDragging ? 'drop-shadow(0 0 12px hsl(175 85% 50% / 0.5))' : 'none' }}
                >
                  🎯
                </motion.div>
              )}

              {/* Throw flight animation */}
              <AnimatePresence>
                {throwState.throwAnim && (
                  <motion.div
                    initial={{ bottom: '5%', left: '50%', x: '-50%', scale: 1, opacity: 1 }}
                    animate={{ bottom: '55%', left: '50%', x: '-50%', scale: 0.3, opacity: 0.5 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.15, 0, 0.2, 1] }}
                    className="absolute text-3xl pointer-events-none"
                  >
                    🎯
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Swipe instruction */}
              {canThrow && !throwState.isDragging && !throwState.throwAnim && currentDart < 3 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.7 }}
                  className="absolute -bottom-6 left-0 right-0 text-center text-[10px] text-muted-foreground"
                >
                  <motion.span animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                    ↑ Greife & wische nach oben
                  </motion.span>
                </motion.p>
              )}
            </div>
          )}

          {/* Waiting state */}
          {game.status === 'waiting' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Teile diese Spiel-ID:</p>
              <code className="block glass-card rounded-xl px-4 py-2 text-xs font-mono text-foreground select-all">{game.id}</code>
            </motion.div>
          )}

          {/* Finished */}
          {game.status === 'finished' && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex gap-2 mt-4">
              <Button onClick={handleReset} className="gap-2 btn-neon"><RotateCcw className="w-4 h-4" /> Neue Runde</Button>
              <Button variant="secondary" onClick={handleLeave}>Zur Lobby</Button>
            </motion.div>
          )}
        </main>

        {/* Chat */}
        {game.status !== 'waiting' && (
          <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-border h-48 lg:h-auto flex flex-col glass">
            <ChatPanel userId={userId} gameId={game.id} title="Spiel Chat" />
          </aside>
        )}
      </div>
    </div>
  );
}
