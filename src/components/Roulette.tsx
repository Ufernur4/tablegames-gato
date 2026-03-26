import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion } from 'framer-motion';

interface RouletteProps { game: Game; userId: string; onLeave: () => void; }

const NUMBERS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

type BetType = 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | number;

function getColor(n: number) { return n === 0 ? 'green' : RED.includes(n) ? 'red' : 'black'; }

function calcWin(bet: BetType, result: number): number {
  if (typeof bet === 'number') return bet === result ? 35 : -1;
  if (result === 0) return -1;
  if (bet === 'red') return RED.includes(result) ? 1 : -1;
  if (bet === 'black') return !RED.includes(result) ? 1 : -1;
  if (bet === 'even') return result % 2 === 0 ? 1 : -1;
  if (bet === 'odd') return result % 2 !== 0 ? 1 : -1;
  if (bet === 'low') return result >= 1 && result <= 18 ? 1 : -1;
  if (bet === 'high') return result >= 19 && result <= 36 ? 1 : -1;
  return -1;
}

export function Roulette({ game: initialGame, userId, onLeave }: RouletteProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [bet, setBet] = useState<BetType | null>(null);
  const [betAmount, setBetAmount] = useState(10);
  const [balance, setBalance] = useState(500);
  const [history, setHistory] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);

  const gd = (game.game_data || {}) as Record<string, any>;

  useEffect(() => {
    const ch = supabase.channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` },
        (p) => setGame(p.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [initialGame.id]);

  useEffect(() => {
    if (gd.balance !== undefined) setBalance(gd.balance);
    if (gd.history) setHistory(gd.history);
  }, [gd.balance, gd.history]);

  const spin = async () => {
    if (spinning || !bet) return;
    sounds.click();
    setSpinning(true);
    setShowResult(false);
    setResult(null);

    const num = NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
    const idx = NUMBERS.indexOf(num);
    const segAngle = 360 / NUMBERS.length;
    const targetAngle = 360 * 8 + (360 - idx * segAngle);
    
    setRotation(prev => prev + targetAngle);

    setTimeout(() => {
      setResult(num);
      setSpinning(false);
      setShowResult(true);
      
      const mult = calcWin(bet, num);
      const winnings = mult * betAmount;
      const newBal = balance + winnings;
      const newHist = [...history, num].slice(-20);
      setBalance(newBal);
      setHistory(newHist);

      if (winnings > 0) sounds.coinEarn();
      else sounds.invalid();

      supabase.from('games').update({
        game_data: { ...gd, balance: newBal, history: newHist, last_result: num, last_bet: bet, last_win: winnings },
      }).eq('id', game.id);

      if (newBal <= 0) {
        setTimeout(() => {
          supabase.from('games').update({ status: 'finished' as any, game_data: { ...gd, balance: 0, history: newHist } }).eq('id', game.id);
        }, 2000);
      }
    }, 4000);
  };

  const handleLeave = async () => {
    await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    onLeave();
  };

  const outsideBets: { label: string; value: BetType; bg: string }[] = [
    { label: 'Rot', value: 'red', bg: 'bg-red-600' },
    { label: 'Schwarz', value: 'black', bg: 'bg-gray-900' },
    { label: 'Gerade', value: 'even', bg: 'bg-primary/20' },
    { label: 'Ungerade', value: 'odd', bg: 'bg-primary/20' },
    { label: '1-18', value: 'low', bg: 'bg-primary/20' },
    { label: '19-36', value: 'high', bg: 'bg-primary/20' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/30 px-4 py-2.5 flex items-center justify-between bg-card/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground h-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-bold">🎰 Roulette</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-primary">💰 {balance}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4 overflow-auto">
        {/* Wheel */}
        <div className="relative w-64 h-64">
          <motion.div
            className="w-full h-full rounded-full border-4 border-primary/30 overflow-hidden relative"
            style={{ boxShadow: '0 0 40px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.3)' }}
            animate={{ rotate: rotation }}
            transition={{ duration: 4, ease: [0.17, 0.67, 0.12, 0.99] }}
          >
            <svg viewBox="0 0 200 200" className="w-full h-full">
              {NUMBERS.map((n, i) => {
                const angle = (i * 360) / NUMBERS.length;
                const rad = (angle * Math.PI) / 180;
                const endRad = ((angle + 360 / NUMBERS.length) * Math.PI) / 180;
                const x1 = 100 + 95 * Math.cos(rad);
                const y1 = 100 + 95 * Math.sin(rad);
                const x2 = 100 + 95 * Math.cos(endRad);
                const y2 = 100 + 95 * Math.sin(endRad);
                const fill = n === 0 ? '#16a34a' : RED.includes(n) ? '#dc2626' : '#1a1a2e';
                const textAngle = angle + 360 / NUMBERS.length / 2;
                const textRad = (textAngle * Math.PI) / 180;
                const tx = 100 + 75 * Math.cos(textRad);
                const ty = 100 + 75 * Math.sin(textRad);
                return (
                  <g key={n}>
                    <path d={`M100,100 L${x1},${y1} A95,95 0 0,1 ${x2},${y2} Z`} fill={fill} stroke="#333" strokeWidth="0.5" />
                    <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="6" fontWeight="bold"
                      transform={`rotate(${textAngle}, ${tx}, ${ty})`}>{n}</text>
                  </g>
                );
              })}
              <circle cx="100" cy="100" r="20" fill="#1a1a2e" stroke="#FFD700" strokeWidth="2" />
              <text x="100" y="102" textAnchor="middle" fill="#FFD700" fontSize="8" fontWeight="bold">X-Play</text>
            </svg>
          </motion.div>
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[16px] border-l-transparent border-r-transparent border-t-primary z-10" />
        </div>

        {/* Result */}
        {showResult && result !== null && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            className={`text-center rounded-xl px-6 py-3 ${getColor(result) === 'red' ? 'bg-red-600' : getColor(result) === 'green' ? 'bg-green-600' : 'bg-gray-800'}`}>
            <p className="text-3xl font-black text-white">{result}</p>
            <p className="text-xs text-white/70">{calcWin(bet!, result) > 0 ? `+${calcWin(bet!, result) * betAmount}` : `-${betAmount}`}</p>
          </motion.div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="flex gap-1 flex-wrap justify-center max-w-xs">
            {history.slice(-10).map((n, i) => (
              <span key={i} className={`w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center text-white
                ${getColor(n) === 'red' ? 'bg-red-600' : getColor(n) === 'green' ? 'bg-green-600' : 'bg-gray-700'}`}>{n}</span>
            ))}
          </div>
        )}

        {/* Bet selection */}
        <div className="w-full max-w-xs space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {outsideBets.map(b => (
              <button key={b.label} onClick={() => setBet(b.value)}
                className={`rounded-lg py-2 text-xs font-bold transition-all border-2 text-white
                  ${bet === b.value ? 'border-primary ring-2 ring-primary/40 scale-105' : 'border-transparent'}
                  ${b.bg}`}>
                {b.label}
              </button>
            ))}
          </div>

          {/* Number grid */}
          <div className="grid grid-cols-6 gap-1">
            {[0,...Array.from({length:36},(_,i)=>i+1)].map(n => (
              <button key={n} onClick={() => setBet(n)}
                className={`rounded text-[10px] font-bold py-1.5 transition-all text-white
                  ${bet === n ? 'ring-2 ring-primary scale-110' : ''}
                  ${n === 0 ? 'bg-green-600 col-span-6' : RED.includes(n) ? 'bg-red-600/80' : 'bg-gray-700'}`}>
                {n}
              </button>
            ))}
          </div>

          {/* Bet amount */}
          <div className="flex items-center gap-2 justify-center">
            {[5, 10, 25, 50, 100].map(a => (
              <button key={a} onClick={() => setBetAmount(a)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all
                  ${betAmount === a ? 'bg-primary text-primary-foreground scale-110' : 'bg-card border border-border text-foreground'}`}>
                {a}
              </button>
            ))}
          </div>

          <Button onClick={spin} disabled={spinning || !bet || balance < betAmount}
            className="w-full font-bold text-base gap-2" size="lg">
            {spinning ? <RotateCcw className="w-4 h-4 animate-spin" /> : '🎰'} {spinning ? 'Dreht…' : 'Drehen'}
          </Button>
        </div>
      </main>
    </div>
  );
}
