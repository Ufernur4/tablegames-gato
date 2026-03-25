import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, ArrowUp, ArrowDown, ArrowRight, ChevronLeft } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

interface SnakeProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const GRID = 20;
const CELL = 16;
const TICK_MS = 120;

type Dir = 'up' | 'down' | 'left' | 'right';
type Pos = { x: number; y: number };

export function Snake({ game: initialGame, userId, onLeave }: SnakeProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [snake, setSnake] = useState<Pos[]>([{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]);
  const [food, setFood] = useState<Pos>({ x: 15, y: 10 });
  const [dir, setDir] = useState<Dir>('right');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; life: number }[]>([]);
  const dirRef = useRef<Dir>('right');
  const tickRef = useRef<ReturnType<typeof setInterval>>();
  const pidRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const spawnFood = useCallback((s: Pos[]): Pos => {
    let f: Pos;
    do { f = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) }; }
    while (s.some(p => p.x === f.x && p.y === f.y));
    return f;
  }, []);

  const resetGame = () => {
    const s = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    setSnake(s);
    setFood(spawnFood(s));
    setDir('right');
    dirRef.current = 'right';
    setScore(0);
    setGameOver(false);
    setRunning(false);
  };

  const startGame = () => {
    if (gameOver) resetGame();
    setRunning(true);
    sounds.click();
  };

  useEffect(() => {
    if (!running || gameOver) return;
    tickRef.current = setInterval(() => {
      setSnake(prev => {
        const head = { ...prev[0] };
        const d = dirRef.current;
        if (d === 'up') head.y--;
        else if (d === 'down') head.y++;
        else if (d === 'left') head.x--;
        else head.x++;

        // Wall collision
        if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
          setGameOver(true);
          setRunning(false);
          sounds.invalid();
          return prev;
        }
        // Self collision
        if (prev.some(p => p.x === head.x && p.y === head.y)) {
          setGameOver(true);
          setRunning(false);
          sounds.invalid();
          return prev;
        }

        const newSnake = [head, ...prev];
        setFood(f => {
          if (head.x === f.x && head.y === f.y) {
            setScore(s => {
              const ns = s + 1;
              setHighScore(h => Math.max(h, ns));
              return ns;
            });
            sounds.coinEarn();
            // Particles
            setParticles(pp => [...pp, ...Array.from({ length: 6 }, () => ({
              id: pidRef.current++, x: f.x * CELL + CELL / 2, y: f.y * CELL + CELL / 2, life: 15,
            }))]);
            const nf = spawnFood(newSnake);
            return nf;
          }
          newSnake.pop();
          return f;
        });
        return newSnake;
      });
    }, TICK_MS);
    return () => clearInterval(tickRef.current);
  }, [running, gameOver, spawnFood]);

  // Particle decay
  useEffect(() => {
    if (particles.length === 0) return;
    const id = requestAnimationFrame(() => {
      setParticles(p => p.map(pp => ({ ...pp, life: pp.life - 1 })).filter(pp => pp.life > 0));
    });
    return () => cancelAnimationFrame(id);
  }, [particles]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      const nd = map[e.key];
      if (!nd) return;
      e.preventDefault();
      const opp: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (opp[nd] !== dirRef.current) { dirRef.current = nd; setDir(nd); }
      if (!running && !gameOver) startGame();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [running, gameOver]);

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const opp: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
    let nd: Dir;
    if (Math.abs(dx) > Math.abs(dy)) nd = dx > 0 ? 'right' : 'left';
    else nd = dy > 0 ? 'down' : 'up';
    if (opp[nd] !== dirRef.current) { dirRef.current = nd; setDir(nd); }
    if (!running && !gameOver) startGame();
    touchStartRef.current = null;
  };

  const handleLeave = async () => {
    await supabase.from('games').update({ status: 'finished' as any, game_data: { score, high_score: highScore } }).eq('id', game.id);
    onLeave();
  };

  // D-pad for mobile
  const pressDir = (d: Dir) => {
    const opp: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opp[d] !== dirRef.current) { dirRef.current = d; setDir(d); }
    if (!running && !gameOver) startGame();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/30 px-4 py-2.5 flex items-center justify-between bg-card/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground h-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-bold text-foreground">🐍 Snake</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">🏆 {highScore}</span>
          <span className="text-sm font-bold text-primary tabular-nums">{score}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4"
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        
        {/* Game board */}
        <div className="relative rounded-2xl overflow-hidden border-2 border-border/30"
          style={{
            width: GRID * CELL, height: GRID * CELL,
            background: 'radial-gradient(circle at 50% 50%, hsl(var(--secondary)) 0%, hsl(var(--background)) 100%)',
            boxShadow: '0 0 40px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.2)',
          }}>
          {/* Grid lines */}
          {Array.from({ length: GRID - 1 }, (_, i) => (
            <div key={`h${i}`} className="absolute w-full" style={{ top: (i + 1) * CELL, height: 1, background: 'hsl(var(--border) / 0.1)' }} />
          ))}
          {Array.from({ length: GRID - 1 }, (_, i) => (
            <div key={`v${i}`} className="absolute h-full" style={{ left: (i + 1) * CELL, width: 1, background: 'hsl(var(--border) / 0.1)' }} />
          ))}

          {/* Snake */}
          {snake.map((p, i) => (
            <motion.div key={i}
              initial={i === 0 ? { scale: 0.8 } : undefined}
              animate={{ scale: 1 }}
              className="absolute rounded-sm"
              style={{
                left: p.x * CELL + 1, top: p.y * CELL + 1,
                width: CELL - 2, height: CELL - 2,
                background: i === 0
                  ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))'
                  : `hsl(var(--primary) / ${1 - i * 0.03})`,
                boxShadow: i === 0 ? '0 0 8px hsl(var(--primary) / 0.5)' : 'none',
                borderRadius: i === 0 ? '4px' : '2px',
              }}
            >
              {i === 0 && (
                <div className="w-full h-full flex items-center justify-center text-[8px]">
                  {dir === 'right' ? '→' : dir === 'left' ? '←' : dir === 'up' ? '↑' : '↓'}
                </div>
              )}
            </motion.div>
          ))}

          {/* Food */}
          <motion.div
            key={`food-${food.x}-${food.y}`}
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className="absolute flex items-center justify-center text-sm"
            style={{ left: food.x * CELL, top: food.y * CELL, width: CELL, height: CELL }}
          >
            🍎
          </motion.div>

          {/* Particles */}
          {particles.map(p => (
            <motion.div key={p.id}
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: 0, opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="absolute w-2 h-2 rounded-full bg-primary"
              style={{ left: p.x, top: p.y }}
            />
          ))}

          {/* Game Over overlay */}
          <AnimatePresence>
            {gameOver && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
                <div className="text-4xl">💀</div>
                <p className="text-lg font-black text-foreground">Game Over!</p>
                <p className="text-2xl font-black text-primary">{score} Punkte</p>
                <Button onClick={() => { resetGame(); startGame(); }} className="gap-2">
                  <RotateCcw className="w-4 h-4" /> Nochmal
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Start overlay */}
          {!running && !gameOver && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
              <div className="text-4xl">🐍</div>
              <p className="text-sm font-bold text-foreground">Wische oder tippe zum Starten</p>
              <Button onClick={startGame} className="gap-2">▶ Start</Button>
            </motion.div>
          )}
        </div>

        {/* D-Pad for mobile */}
        <div className="grid grid-cols-3 gap-1 w-36 lg:hidden">
          <div />
          <Button variant="secondary" size="sm" className="h-10" onPointerDown={() => pressDir('up')}><ArrowUp className="w-4 h-4" /></Button>
          <div />
          <Button variant="secondary" size="sm" className="h-10" onPointerDown={() => pressDir('left')}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="h-10" />
          <Button variant="secondary" size="sm" className="h-10" onPointerDown={() => pressDir('right')}><ArrowRight className="w-4 h-4" /></Button>
          <div />
          <Button variant="secondary" size="sm" className="h-10" onPointerDown={() => pressDir('down')}><ArrowDown className="w-4 h-4" /></Button>
          <div />
        </div>
      </main>
    </div>
  );
}
