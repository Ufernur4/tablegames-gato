import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { sounds } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

interface BlackjackProps { game: Game; userId: string; onLeave: () => void; }

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
type Card = { rank: string; suit: string };

function newDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d.sort(() => Math.random() - 0.5);
}

function cardValue(hand: Card[]): number {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { aces++; total += 11; }
    else if (['K', 'Q', 'J'].includes(c.rank)) total += 10;
    else total += parseInt(c.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isRed(suit: string) { return suit === '♥' || suit === '♦'; }

function CardUI({ card, hidden, delay = 0 }: { card: Card; hidden?: boolean; delay?: number }) {
  return (
    <motion.div
      initial={{ scale: 0.5, rotateY: 180, opacity: 0 }}
      animate={{ scale: 1, rotateY: 0, opacity: 1 }}
      transition={{ duration: 0.4, delay }}
      className={`relative w-16 h-24 rounded-xl flex flex-col items-center justify-center font-bold text-lg shadow-lg border-2 border-border/30
        ${hidden ? 'bg-gradient-to-br from-primary/40 to-primary/20' : 'bg-card'}`}
      style={{ perspective: '500px' }}
    >
      {hidden ? (
        <span className="text-2xl">🂠</span>
      ) : (
        <>
          <span className={`text-sm absolute top-1 left-2 ${isRed(card.suit) ? 'text-red-500' : 'text-foreground'}`}>{card.rank}</span>
          <span className={`text-2xl ${isRed(card.suit) ? 'text-red-500' : 'text-foreground'}`}>{card.suit}</span>
          <span className={`text-sm absolute bottom-1 right-2 rotate-180 ${isRed(card.suit) ? 'text-red-500' : 'text-foreground'}`}>{card.rank}</span>
        </>
      )}
    </motion.div>
  );
}

export function Blackjack({ game: initialGame, userId, onLeave }: BlackjackProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [phase, setPhase] = useState<'betting' | 'playing' | 'dealer' | 'result'>('betting');
  const [betAmount, setBetAmount] = useState(10);
  const [balance, setBalance] = useState(500);
  const [resultMsg, setResultMsg] = useState('');
  const [winAmount, setWinAmount] = useState(0);

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
  }, [gd.balance]);

  const deal = () => {
    sounds.click();
    const d = newDeck();
    const pH = [d.pop()!, d.pop()!];
    const dH = [d.pop()!, d.pop()!];
    setDeck(d);
    setPlayerHand(pH);
    setDealerHand(dH);
    setPhase('playing');
    setResultMsg('');
    setWinAmount(0);

    if (cardValue(pH) === 21) {
      finishRound(pH, dH, d, 'blackjack');
    }
  };

  const hit = () => {
    sounds.click();
    const d = [...deck];
    const pH = [...playerHand, d.pop()!];
    setDeck(d);
    setPlayerHand(pH);
    if (cardValue(pH) > 21) finishRound(pH, dealerHand, d, 'bust');
  };

  const stand = () => {
    sounds.click();
    setPhase('dealer');
    let d = [...deck];
    let dH = [...dealerHand];
    
    const dealerPlay = () => {
      const interval = setInterval(() => {
        if (cardValue(dH) < 17) {
          dH = [...dH, d.pop()!];
          setDealerHand([...dH]);
          setDeck([...d]);
        } else {
          clearInterval(interval);
          finishRound(playerHand, dH, d, 'stand');
        }
      }, 600);
    };
    setTimeout(dealerPlay, 400);
  };

  const doubleDown = () => {
    sounds.click();
    const d = [...deck];
    const pH = [...playerHand, d.pop()!];
    setDeck(d);
    setPlayerHand(pH);
    setBetAmount(prev => prev * 2);
    if (cardValue(pH) > 21) {
      finishRound(pH, dealerHand, d, 'bust');
    } else {
      setPhase('dealer');
      let dH = [...dealerHand];
      const dealerPlay = () => {
        const interval = setInterval(() => {
          if (cardValue(dH) < 17) {
            dH = [...dH, d.pop()!];
            setDealerHand([...dH]);
          } else {
            clearInterval(interval);
            finishRound(pH, dH, d, 'stand');
          }
        }, 600);
      };
      setTimeout(dealerPlay, 400);
    }
  };

  const finishRound = (pH: Card[], dH: Card[], d: Card[], reason: string) => {
    setPhase('result');
    const pV = cardValue(pH);
    const dV = cardValue(dH);
    let msg = '';
    let win = 0;

    if (reason === 'blackjack') { msg = 'BLACKJACK! 🃏'; win = Math.floor(betAmount * 1.5); }
    else if (reason === 'bust') { msg = 'Bust! 💥'; win = -betAmount; }
    else if (dV > 21) { msg = 'Dealer Bust! 🎉'; win = betAmount; }
    else if (pV > dV) { msg = 'Gewonnen! 🏆'; win = betAmount; }
    else if (pV < dV) { msg = 'Verloren 😢'; win = -betAmount; }
    else { msg = 'Push! 🤝'; win = 0; }

    setResultMsg(msg);
    setWinAmount(win);
    const newBal = balance + win;
    setBalance(newBal);

    if (win > 0) sounds.coinEarn();
    else if (win < 0) sounds.invalid();

    supabase.from('games').update({
      game_data: { ...gd, balance: newBal, rounds: (gd.rounds || 0) + 1 },
    }).eq('id', game.id);

    if (newBal <= 0) {
      setTimeout(() => {
        supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
      }, 2000);
    }
  };

  const handleLeave = async () => {
    await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    onLeave();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/30 px-4 py-2.5 flex items-center justify-between bg-card/50 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground h-8">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-bold">🃏 Blackjack</span>
        </div>
        <span className="text-sm font-bold text-primary">💰 {balance}</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
        {/* Dealer hand */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground font-medium">DEALER {phase !== 'playing' ? `(${cardValue(dealerHand)})` : ''}</p>
          <div className="flex gap-2 justify-center min-h-[96px]">
            {dealerHand.map((c, i) => (
              <CardUI key={i} card={c} hidden={phase === 'playing' && i === 1} delay={i * 0.15} />
            ))}
          </div>
        </div>

        {/* Result */}
        <AnimatePresence>
          {phase === 'result' && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="text-center space-y-1">
              <p className="text-2xl font-black text-foreground">{resultMsg}</p>
              <p className={`text-lg font-bold ${winAmount > 0 ? 'text-green-400' : winAmount < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                {winAmount > 0 ? `+${winAmount}` : winAmount < 0 ? winAmount : '±0'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player hand */}
        <div className="text-center space-y-2">
          <div className="flex gap-2 justify-center min-h-[96px]">
            {playerHand.map((c, i) => (
              <CardUI key={i} card={c} delay={i * 0.15} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground font-medium">DU ({cardValue(playerHand)})</p>
        </div>

        {/* Controls */}
        <div className="w-full max-w-xs space-y-3">
          {phase === 'betting' && (
            <>
              <div className="flex items-center gap-2 justify-center">
                {[5, 10, 25, 50, 100].map(a => (
                  <button key={a} onClick={() => setBetAmount(a)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition-all
                      ${betAmount === a ? 'bg-primary text-primary-foreground scale-110' : 'bg-card border border-border text-foreground'}`}>
                    {a}
                  </button>
                ))}
              </div>
              <Button onClick={deal} disabled={balance < betAmount} className="w-full font-bold gap-2" size="lg">
                🃏 Austeilen ({betAmount})
              </Button>
            </>
          )}
          {phase === 'playing' && (
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={hit} className="font-bold">Hit</Button>
              <Button onClick={stand} variant="secondary" className="font-bold">Stand</Button>
              <Button onClick={doubleDown} variant="outline" className="font-bold" disabled={balance < betAmount}>2x</Button>
            </div>
          )}
          {phase === 'result' && (
            <Button onClick={() => { setPhase('betting'); setBetAmount(10); }} className="w-full font-bold gap-2" size="lg">
              🔄 Nächste Runde
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
