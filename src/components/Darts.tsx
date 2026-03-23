import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface DartsProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const DART_SECTIONS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export function Darts({ game: initialGame, userId, onLeave }: DartsProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [error, setError] = useState('');
  // Throw mechanics
  const [dartPos, setDartPos] = useState({ x: 0, y: 200 }); // dart start position
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [throwAnim, setThrowAnim] = useState<{ x: number; y: number; opacity: number } | null>(null);
  const [lastHit, setLastHit] = useState<{ points: number; label: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const gameData = (game.game_data || {}) as Record<string, any>;
  const playerXScore = gameData.player_x_score ?? 301;
  const playerOScore = gameData.player_o_score ?? 301;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;

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

  // Calculate what sector a point on the SVG dartboard hits
  const calcHit = useCallback((svgX: number, svgY: number): { points: number; label: string } => {
    const dist = Math.sqrt(svgX * svgX + svgY * svgY);
    if (dist > 160) return { points: 0, label: 'Daneben!' };
    if (dist <= 8) return { points: 50, label: 'Bullseye! 50' };
    if (dist <= 20) return { points: 25, label: 'Bull 25' };

    // Determine section
    let angle = Math.atan2(svgY, svgX) * 180 / Math.PI + 99;
    if (angle < 0) angle += 360;
    const sectionIdx = Math.floor(angle / 18) % 20;
    const num = DART_SECTIONS[sectionIdx];

    if (dist > 130 && dist <= 150) return { points: num * 2, label: `D${num} (${num * 2})` };
    if (dist > 80 && dist <= 100) return { points: num * 3, label: `T${num} (${num * 3})` };
    return { points: num, label: `${num}` };
  }, []);

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

    if (newScore === 0) {
      update.winner = userId;
      update.status = 'finished';
      sounds.win();
    }

    if (points === 50) sounds.achievement();
    else if (points >= 25) sounds.coinEarn();
    else sounds.move();

    await supabase.from('games').update(update).eq('id', game.id);
  }, [isMyTurn, game, isPlayerX, playerXScore, playerOScore, gameData, userId]);

  // Touch/Mouse drag-to-throw
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMyTurn || game.status !== 'playing' || game.winner) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDartPos({ x: 0, y: 200 });
    setLastHit(null);
    setError('');
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setDartPos({ x: dx * 0.5, y: 200 + dy * 0.5 });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);

    const dy = e.clientY - dragStart.y;
    const dx = e.clientX - dragStart.x;

    // Need upward swipe to throw
    if (dy > -30) {
      setDartPos({ x: 0, y: 200 });
      return;
    }

    // Calculate throw power & accuracy
    const power = Math.min(Math.abs(dy) / 200, 1);
    const accuracy = 1 - Math.min(Math.abs(dx) / 150, 1);

    // Determine landing position on dartboard SVG (-160 to 160)
    const targetX = (dx * 0.8) + (Math.random() - 0.5) * (1 - accuracy) * 200;
    const targetY = (1 - power) * 160 - 80 + (Math.random() - 0.5) * (1 - accuracy) * 200;

    // Animate dart flying
    setThrowAnim({ x: targetX, y: targetY - 300, opacity: 1 });
    sounds.move();

    setTimeout(() => {
      setThrowAnim(null);
      const hit = calcHit(targetX, targetY);
      setLastHit(hit);
      submitThrow(hit.points);
    }, 400);
  };

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

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '🎯 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (isMyTurn) return '↑ Wische nach oben um zu werfen!';
    return 'Gegner wirft…';
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Darts – 301</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-3 overflow-y-auto">
          {/* Scores */}
          <div className="flex gap-4 w-full max-w-md animate-fade-in-up">
            <div className={`flex-1 game-card text-center ${isPlayerX ? 'border-primary/30' : ''}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Du</p>
              <p className="text-3xl font-bold text-foreground tabular-nums">
                {isPlayerX ? playerXScore : playerOScore}
              </p>
            </div>
            <div className={`flex-1 game-card text-center ${!isPlayerX ? 'border-primary/30' : ''}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gegner</p>
              <p className="text-3xl font-bold text-foreground tabular-nums">
                {isPlayerX ? playerOScore : playerXScore}
              </p>
            </div>
          </div>

          {/* Status */}
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            isMyTurn ? 'bg-primary/10 text-primary animate-pulse-glow' :
            'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Last hit display */}
          {lastHit && (
            <div className={`text-lg font-bold animate-scale-in ${lastHit.points >= 25 ? 'text-primary' : lastHit.points === 0 ? 'text-destructive' : 'text-foreground'}`}>
              {lastHit.label}
            </div>
          )}

          {/* Interactive Dartboard + Throw area */}
          {game.status === 'playing' && !game.winner && (
            <div
              ref={containerRef}
              className="relative w-full max-w-xs aspect-[3/4] touch-none select-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* SVG Dartboard */}
              <svg ref={svgRef} viewBox="-170 -170 340 340" className="w-full drop-shadow-2xl" style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))' }}>
                <circle cx="0" cy="0" r="160" fill="hsl(0,0%,10%)" />
                {DART_SECTIONS.map((num, i) => {
                  const angle = (i * 18 - 99) * Math.PI / 180;
                  const nextAngle = ((i + 1) * 18 - 99) * Math.PI / 180;
                  const colors = i % 2 === 0
                    ? ['hsl(0,0%,15%)', 'hsl(0,70%,40%)', 'hsl(0,0%,15%)', 'hsl(0,70%,40%)']
                    : ['hsl(45,80%,55%)', 'hsl(140,50%,30%)', 'hsl(45,80%,55%)', 'hsl(140,50%,30%)'];
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
                            fill={colors[ri]} stroke="hsl(0,0%,25%)" strokeWidth="0.5"
                          />
                        );
                      })}
                      <text
                        x={Math.cos((angle + nextAngle) / 2) * 155}
                        y={Math.sin((angle + nextAngle) / 2) * 155 + 4}
                        textAnchor="middle" fill="white" fontSize="9" fontWeight="bold"
                      >{num}</text>
                    </g>
                  );
                })}
                <circle cx="0" cy="0" r="20" fill="hsl(140,50%,30%)" stroke="hsl(0,0%,25%)" strokeWidth="0.5" />
                <circle cx="0" cy="0" r="8" fill="hsl(0,70%,40%)" stroke="hsl(0,0%,25%)" strokeWidth="0.5" />
              </svg>

              {/* Dart emoji that user drags */}
              {!throwAnim && isMyTurn && (
                <div
                  className="absolute text-4xl transition-transform duration-100 pointer-events-none"
                  style={{
                    left: `calc(50% + ${dartPos.x}px)`,
                    top: `calc(85% + ${dartPos.y - 200}px)`,
                    transform: `translate(-50%, -50%) rotate(${isDragging ? -45 + dartPos.x * 0.2 : 0}deg)`,
                  }}
                >
                  🎯
                </div>
              )}

              {/* Throw animation */}
              {throwAnim && (
                <div
                  className="absolute text-3xl pointer-events-none animate-dart-fly"
                  style={{
                    left: `calc(50% + ${throwAnim.x * 0.4}px)`,
                    top: '20%',
                    transform: 'translate(-50%, -50%) rotate(-90deg)',
                  }}
                >
                  🎯
                </div>
              )}

              {/* Throw instruction */}
              {isMyTurn && !isDragging && !throwAnim && (
                <div className="absolute bottom-2 left-0 right-0 text-center">
                  <p className="text-xs text-muted-foreground animate-pulse">
                    ↑ Greife den Pfeil und wische nach oben
                  </p>
                </div>
              )}
            </div>
          )}

          {game.status === 'waiting' && (
            <div className="text-center animate-fade-in space-y-2">
              <p className="text-sm text-muted-foreground">Teile diese Spiel-ID:</p>
              <code className="block bg-secondary rounded-lg px-4 py-2 text-xs font-mono text-foreground select-all">{game.id}</code>
            </div>
          )}

          {game.status === 'finished' && (
            <div className="flex gap-2 animate-fade-in-up">
              <Button onClick={handleReset} className="gap-2"><RotateCcw className="w-4 h-4" /> Neue Runde</Button>
              <Button variant="secondary" onClick={handleLeave}>Zur Lobby</Button>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive animate-fade-in max-w-sm">{error}</div>
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
