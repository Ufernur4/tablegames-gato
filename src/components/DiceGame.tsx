import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

interface DiceGameProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const BOT_ID = '00000000-0000-0000-0000-000000000000';
const MAX_ROUNDS = 5;
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function DiceGame({ game: initialGame, userId, onLeave }: DiceGameProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [rolling, setRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState<number[]>([1, 1]);
  const [showResult, setShowResult] = useState<string | null>(null);

  const gd = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const isBotGame = game.player_o === BOT_ID;
  const round = gd.round || 0;
  const xScore = gd.player_x_score || 0;
  const oScore = gd.player_o_score || 0;
  const myScore = isPlayerX ? xScore : oScore;
  const opScore = isPlayerX ? oScore : xScore;
  const lastRollResult = gd.last_roll;

  useEffect(() => {
    const ch = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (payload) => setGame(payload.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [initialGame.id]);

  // Show result when last_roll changes
  useEffect(() => {
    if (lastRollResult) {
      setDisplayDice(lastRollResult.dice || [1, 1]);
      setShowResult(lastRollResult.label || null);
      setTimeout(() => setShowResult(null), 2000);
    }
  }, [JSON.stringify(lastRollResult)]);

  const rollDice = async () => {
    if (!isMyTurn || rolling || game.status !== 'playing' || game.winner) return;
    setRolling(true);
    sounds.click();

    // Animation
    const animSteps = 12;
    for (let i = 0; i < animSteps; i++) {
      await new Promise(r => setTimeout(r, 60));
      setDisplayDice([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
    }

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2;
    setDisplayDice([d1, d2]);

    const isDouble = d1 === d2;
    const bonus = isDouble ? total : 0;
    const points = total + bonus;
    const label = isDouble ? `Pasch! ${total} + ${bonus} Bonus = ${points}` : `${total} Punkte`;

    if (isDouble) { sounds.achievement(); } else { sounds.move(); }

    const myKey = isPlayerX ? 'player_x_score' : 'player_o_score';
    const newScore = (isPlayerX ? xScore : oScore) + points;
    const newRound = round + 1;

    const nd: Record<string, any> = {
      ...gd,
      [myKey]: newScore,
      round: newRound,
      last_roll: { dice: [d1, d2], total: points, label },
    };

    const update: Record<string, unknown> = {
      game_data: nd,
      current_turn: isPlayerX ? game.player_o : game.player_x,
    };

    if (newRound >= MAX_ROUNDS * 2) {
      update.status = 'finished';
      const finalX = isPlayerX ? newScore : xScore;
      const finalO = isPlayerX ? oScore : newScore;
      if (finalX > finalO) update.winner = game.player_x;
      else if (finalO > finalX) update.winner = game.player_o;
      else update.is_draw = true;
    }

    setShowResult(label);
    setTimeout(() => setShowResult(null), 2500);

    await supabase.from('games').update(update).eq('id', game.id);
    setRolling(false);
  };

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { player_x_score: 0, player_o_score: 0, round: 0, last_roll: null },
      winner: null, is_draw: false, status: 'playing' as any, current_turn: game.player_x,
    }).eq('id', game.id);
  };

  const handleLeave = async () => {
    if (!game.player_o) await supabase.from('games').delete().eq('id', game.id);
    else await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    onLeave();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/30 px-4 py-2.5 flex items-center justify-between bg-card/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground h-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-bold text-foreground">🎲 Würfelspiel</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          Runde {Math.min(Math.floor(round / 2) + 1, MAX_ROUNDS)}/{MAX_ROUNDS}
        </span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
          {/* Scores */}
          <div className="flex gap-4 w-full max-w-sm">
            <motion.div animate={{ scale: isMyTurn ? 1.03 : 1 }}
              className={`flex-1 rounded-2xl p-4 text-center transition-all ${
                isMyTurn ? 'bg-primary/10 border border-primary/30 shadow-[0_0_20px_hsl(var(--primary)/0.15)]' : 'bg-secondary/50 border border-border'
              }`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Du</p>
              <p className="text-4xl font-black text-foreground tabular-nums">{myScore}</p>
            </motion.div>
            <div className="flex items-center text-muted-foreground text-xs font-black opacity-40">VS</div>
            <div className={`flex-1 rounded-2xl p-4 text-center bg-secondary/50 border border-border ${
              game.current_turn === BOT_ID ? 'border-destructive/30' : ''
            }`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                {isBotGame ? '🤖 Bot' : 'Gegner'}
              </p>
              <p className="text-4xl font-black text-foreground tabular-nums">{opScore}</p>
            </div>
          </div>

          {/* Dice display */}
          <div className="flex gap-6">
            {displayDice.map((d, i) => (
              <motion.div key={i}
                animate={rolling ? { rotate: [0, 360, 720], scale: [1, 1.2, 1] } : { rotate: 0 }}
                transition={rolling ? { duration: 0.6, repeat: Infinity } : { duration: 0.3 }}
                className="w-20 h-20 rounded-2xl bg-card border-2 border-border flex items-center justify-center text-4xl shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--card)), hsl(var(--secondary)))',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              >
                {DICE_FACES[d - 1]}
              </motion.div>
            ))}
          </div>

          {/* Result display */}
          <AnimatePresence>
            {showResult && (
              <motion.div initial={{ y: 20, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                className="text-lg font-black text-primary px-4 py-2 rounded-full bg-primary/10">
                {showResult}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status & Action */}
          {game.status === 'playing' && !game.winner && (
            <>
              {isMyTurn ? (
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button onClick={rollDice} disabled={rolling} size="lg"
                    className="text-lg px-8 py-6 rounded-2xl gap-3 font-bold shadow-lg">
                    {rolling ? (
                      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.5 }}>🎲</motion.span>
                    ) : '🎲'} Würfeln!
                  </Button>
                </motion.div>
              ) : (
                <div className="text-sm text-muted-foreground animate-pulse">
                  {isBotGame ? '🤖 Bot würfelt…' : 'Gegner würfelt…'}
                </div>
              )}
            </>
          )}

          {game.status === 'finished' && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-3">
              <div className="text-4xl">{game.winner === userId ? '🏆' : game.is_draw ? '🤝' : '😢'}</div>
              <p className="text-xl font-black text-foreground">
                {game.winner === userId ? 'Du hast gewonnen!' : game.is_draw ? 'Unentschieden!' : 'Verloren!'}
              </p>
              <p className="text-sm text-muted-foreground">{myScore} vs {opScore}</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={handleReset} className="gap-2"><RotateCcw className="w-4 h-4" /> Nochmal</Button>
                <Button variant="secondary" onClick={handleLeave}>Lobby</Button>
              </div>
            </motion.div>
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
