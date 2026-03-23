import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface RPSProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

type Choice = 'rock' | 'paper' | 'scissors';
const CHOICES: { id: Choice; emoji: string; label: string }[] = [
  { id: 'rock', emoji: '🪨', label: 'Stein' },
  { id: 'paper', emoji: '📄', label: 'Papier' },
  { id: 'scissors', emoji: '✂️', label: 'Schere' },
];

type RPSData = {
  player_x_choice: Choice | null;
  player_o_choice: Choice | null;
  player_x_score: number;
  player_o_score: number;
  rounds: number;
  max_rounds: number;
  round_result: string | null;
};

function getWinner(a: Choice, b: Choice): 'a' | 'b' | 'draw' {
  if (a === b) return 'draw';
  if ((a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper')) return 'a';
  return 'b';
}

export function RockPaperScissors({ game: initialGame, userId, onLeave }: RPSProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [animating, setAnimating] = useState(false);

  const gd = (game.game_data || {}) as Record<string, unknown>;
  const data: RPSData = {
    player_x_choice: (gd.player_x_choice as Choice | null) || null,
    player_o_choice: (gd.player_o_choice as Choice | null) || null,
    player_x_score: (gd.player_x_score as number) || 0,
    player_o_score: (gd.player_o_score as number) || 0,
    rounds: (gd.rounds as number) || 0,
    max_rounds: (gd.max_rounds as number) || 5,
    round_result: (gd.round_result as string | null) || null,
  };

  const isPlayerX = game.player_x === userId;
  const myChoice = isPlayerX ? data.player_x_choice : data.player_o_choice;
  const oppChoice = isPlayerX ? data.player_o_choice : data.player_x_choice;

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` }, (payload) => {
        setGame(payload.new as unknown as Game);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  const makeChoice = async (choice: Choice) => {
    if (myChoice || game.status !== 'playing') return;
    setAnimating(true);
    sounds.click();

    const choiceKey = isPlayerX ? 'player_x_choice' : 'player_o_choice';
    const newData = { ...data, [choiceKey]: choice };

    // Check if both players chose
    const otherChoice = isPlayerX ? data.player_o_choice : data.player_x_choice;

    if (otherChoice) {
      // Both chose - resolve round
      const xChoice = isPlayerX ? choice : otherChoice;
      const oChoice = isPlayerX ? otherChoice : choice;
      const result = getWinner(xChoice, oChoice);

      const xScore = data.player_x_score + (result === 'a' ? 1 : 0);
      const oScore = data.player_o_score + (result === 'b' ? 1 : 0);
      const rounds = data.rounds + 1;

      const resultText = result === 'draw' ? 'Unentschieden!' :
        ((result === 'a' && isPlayerX) || (result === 'b' && !isPlayerX)) ? 'Du gewinnst die Runde!' : 'Gegner gewinnt die Runde!';

      const gameOver = rounds >= data.max_rounds;

      const update: Record<string, unknown> = {
        game_data: {
          ...newData,
          player_x_choice: xChoice,
          player_o_choice: oChoice,
          player_x_score: xScore,
          player_o_score: oScore,
          rounds,
          round_result: resultText,
        },
      };

      if (gameOver) {
        update.status = 'finished';
        if (xScore > oScore) update.winner = game.player_x;
        else if (oScore > xScore) update.winner = game.player_o;
        else update.is_draw = true;
      }

      await supabase.from('games').update(update).eq('id', game.id);

      // Auto-reset for next round after delay
      if (!gameOver) {
        setTimeout(async () => {
          await supabase.from('games').update({
            game_data: {
              player_x_choice: null,
              player_o_choice: null,
              player_x_score: xScore,
              player_o_score: oScore,
              rounds,
              max_rounds: data.max_rounds,
              round_result: null,
            },
          }).eq('id', game.id);
        }, 2500);
      }
    } else {
      await supabase.from('games').update({
        game_data: newData,
      }).eq('id', game.id);
    }

    setTimeout(() => setAnimating(false), 500);
  };

  const handleLeave = async () => {
    const otherPlayer = isPlayerX ? game.player_o : game.player_x;
    if (!otherPlayer) {
      await supabase.from('games').delete().eq('id', game.id);
    } else {
      await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    }
    onLeave();
  };

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { player_x_choice: null, player_o_choice: null, player_x_score: 0, player_o_score: 0, rounds: 0, max_rounds: 5, round_result: null },
      winner: null, is_draw: false, status: 'playing' as any,
      current_turn: game.player_x,
    }).eq('id', game.id);
  };

  const bothChose = data.player_x_choice && data.player_o_choice;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">✊ Schere Stein Papier</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-primary font-bold">{isPlayerX ? data.player_x_score : data.player_o_score}</span>
          <span className="text-muted-foreground">:</span>
          <span className="text-foreground font-bold">{isPlayerX ? data.player_o_score : data.player_x_score}</span>
          <span className="text-muted-foreground ml-1">Runde {data.rounds + 1}/{data.max_rounds}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-6">
        {game.status === 'waiting' ? (
          <div className="text-center animate-fade-in space-y-2">
            <p className="text-sm text-muted-foreground">Warte auf Mitspieler…</p>
            <code className="block bg-secondary rounded-lg px-4 py-2 text-xs font-mono text-foreground select-all">{game.id}</code>
          </div>
        ) : (
          <>
            {data.round_result && (
              <div className="text-lg font-bold text-primary animate-fade-in">{data.round_result}</div>
            )}

            {bothChose && (
              <div className="flex items-center gap-8 animate-fade-in-up">
                <div className="text-center">
                  <div className="text-6xl mb-2">{CHOICES.find(c => c.id === (isPlayerX ? data.player_x_choice : data.player_o_choice))?.emoji}</div>
                  <span className="text-xs text-muted-foreground">Du</span>
                </div>
                <span className="text-2xl text-muted-foreground">vs</span>
                <div className="text-center">
                  <div className="text-6xl mb-2">{CHOICES.find(c => c.id === (isPlayerX ? data.player_o_choice : data.player_x_choice))?.emoji}</div>
                  <span className="text-xs text-muted-foreground">Gegner</span>
                </div>
              </div>
            )}

            {!myChoice && !bothChose && (
              <>
                <p className="text-sm text-primary font-medium animate-fade-in">Wähle deine Waffe!</p>
                <div className="flex gap-4">
                  {CHOICES.map(({ id, emoji, label }) => (
                    <button
                      key={id}
                      onClick={() => makeChoice(id)}
                      className="w-24 h-24 rounded-2xl bg-card border border-border hover:border-primary/40 flex flex-col items-center justify-center gap-2 transition-all active:scale-90 hover:scale-105"
                    >
                      <span className="text-4xl">{emoji}</span>
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {myChoice && !bothChose && (
              <div className="text-center animate-fade-in space-y-3">
                <div className="text-6xl">{CHOICES.find(c => c.id === myChoice)?.emoji}</div>
                <p className="text-sm text-muted-foreground">Warte auf Gegner…</p>
              </div>
            )}

            {game.status === 'finished' && (
              <div className="flex gap-2 animate-fade-in-up mt-4">
                <Button onClick={handleReset} className="gap-2"><RotateCcw className="w-4 h-4" /> Nochmal</Button>
                <Button variant="secondary" onClick={handleLeave}>Zur Lobby</Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
