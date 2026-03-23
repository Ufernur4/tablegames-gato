import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface MemoryProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const EMOJIS = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔'];

function generateBoard(): string[] {
  const pairs = [...EMOJIS].sort(() => Math.random() - 0.5).slice(0, 8);
  return [...pairs, ...pairs].sort(() => Math.random() - 0.5);
}

type MemoryData = {
  cards: string[];
  revealed: boolean[];
  matched: boolean[];
  player_x_score: number;
  player_o_score: number;
  first_pick: number | null;
};

export function Memory({ game: initialGame, userId, onLeave }: MemoryProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [localRevealed, setLocalRevealed] = useState<number | null>(null);

  const gd = (game.game_data || {}) as Record<string, unknown>;
  const data: MemoryData = {
    cards: (gd.cards as string[]) || [],
    revealed: (gd.revealed as boolean[]) || Array(16).fill(false),
    matched: (gd.matched as boolean[]) || Array(16).fill(false),
    player_x_score: (gd.player_x_score as number) || 0,
    player_o_score: (gd.player_o_score as number) || 0,
    first_pick: (gd.first_pick as number | null) ?? null,
  };

  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId && game.status === 'playing';
  const myScore = isPlayerX ? data.player_x_score : data.player_o_score;
  const oppScore = isPlayerX ? data.player_o_score : data.player_x_score;

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` }, (payload) => {
        setGame(payload.new as unknown as Game);
        setLocalRevealed(null);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  const handleCardClick = async (idx: number) => {
    if (!isMyTurn || data.matched[idx] || data.revealed[idx] || localRevealed === idx) return;

    if (data.first_pick === null) {
      // First card
      const newRevealed = [...data.revealed];
      newRevealed[idx] = true;
      await supabase.from('games').update({
        game_data: { ...data, revealed: newRevealed, first_pick: idx },
      }).eq('id', game.id);
    } else {
      // Second card
      setLocalRevealed(idx);
      const firstIdx = data.first_pick;
      const newRevealed = [...data.revealed];
      newRevealed[idx] = true;

      const isMatch = data.cards[firstIdx] === data.cards[idx];

      // Show card briefly then update
      await supabase.from('games').update({
        game_data: { ...data, revealed: newRevealed, first_pick: null },
      }).eq('id', game.id);

      setTimeout(async () => {
        const newMatched = [...data.matched];
        const finalRevealed = Array(16).fill(false);
        // Keep matched cards revealed
        newMatched.forEach((m, i) => { if (m) finalRevealed[i] = true; });

        const scoreKey = isPlayerX ? 'player_x_score' : 'player_o_score';
        const newScore = isMatch ? (isPlayerX ? data.player_x_score : data.player_o_score) + 1 : (isPlayerX ? data.player_x_score : data.player_o_score);

        if (isMatch) {
          newMatched[firstIdx] = true;
          newMatched[idx] = true;
          finalRevealed[firstIdx] = true;
          finalRevealed[idx] = true;
        }

        const allMatched = newMatched.every(Boolean);

        const update: Record<string, unknown> = {
          game_data: {
            ...data,
            revealed: finalRevealed,
            matched: newMatched,
            first_pick: null,
            [scoreKey]: newScore,
          },
          // On match, same player continues; on miss, switch turns
          current_turn: isMatch ? userId : (isPlayerX ? game.player_o : game.player_x),
        };

        if (allMatched) {
          const xScore = isPlayerX ? newScore : data.player_x_score;
          const oScore = isPlayerX ? data.player_o_score : newScore;
          if (xScore > oScore) update.winner = game.player_x;
          else if (oScore > xScore) update.winner = game.player_o;
          else update.is_draw = true;
          update.status = 'finished';
        }

        await supabase.from('games').update(update).eq('id', game.id);
      }, 1200);
    }
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
      game_data: {
        cards: generateBoard(),
        revealed: Array(16).fill(false),
        matched: Array(16).fill(false),
        player_x_score: 0,
        player_o_score: 0,
        first_pick: null,
      },
      winner: null,
      is_draw: false,
      status: 'playing' as any,
      current_turn: game.player_x,
    }).eq('id', game.id);
  };

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '🎉 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (game.is_draw) return 'Unentschieden!';
    if (isMyTurn) return 'Decke eine Karte auf!';
    return 'Zug des Gegners…';
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">🧠 Memory</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-primary font-bold">Du: {myScore}</span>
          <span className="text-xs text-muted-foreground">vs</span>
          <span className="text-xs text-foreground font-bold">Gegner: {oppScore}</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            isMyTurn ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
          }`}>
            {getStatusText()}
          </div>

          <div className="grid grid-cols-4 gap-2 w-full max-w-[320px] animate-fade-in-up">
            {data.cards.map((card, i) => {
              const isRevealed = data.revealed[i] || data.matched[i] || localRevealed === i;
              return (
                <button
                  key={i}
                  onClick={() => handleCardClick(i)}
                  className={`
                    aspect-square rounded-xl text-2xl flex items-center justify-center
                    transition-all duration-300 active:scale-95
                    ${data.matched[i] ? 'bg-primary/20 border border-primary/30 scale-95' :
                      isRevealed ? 'bg-card border border-border' :
                      'bg-secondary hover:bg-secondary/80 border border-transparent cursor-pointer'}
                  `}
                >
                  {isRevealed ? card : '❓'}
                </button>
              );
            })}
          </div>

          {game.status === 'finished' && (
            <div className="flex gap-2 animate-fade-in-up">
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
