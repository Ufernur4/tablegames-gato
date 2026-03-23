import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';

interface PoolProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

// Simplified pool: 15 balls, players pocket solids (1-7) or stripes (9-15), 8-ball last
const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];

const BALL_COLORS: Record<number, string> = {
  1: 'bg-yellow-500', 2: 'bg-blue-600', 3: 'bg-red-500', 4: 'bg-purple-600',
  5: 'bg-orange-500', 6: 'bg-green-600', 7: 'bg-red-800', 8: 'bg-gray-900',
  9: 'bg-yellow-300', 10: 'bg-blue-400', 11: 'bg-red-400', 12: 'bg-purple-400',
  13: 'bg-orange-300', 14: 'bg-green-400', 15: 'bg-red-300',
};

export function Pool({ game: initialGame, userId, onLeave }: PoolProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [error, setError] = useState('');

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;

  const pocketedBalls: number[] = gameData.pocketed || [];
  const playerXType: 'solids' | 'stripes' | null = gameData.player_x_type || null;
  const remainingBalls = Array.from({ length: 15 }, (_, i) => i + 1).filter(b => !pocketedBalls.includes(b));

  const myType = isPlayerX ? playerXType : (playerXType === 'solids' ? 'stripes' : playerXType === 'stripes' ? 'solids' : null);
  const myBalls = myType === 'solids' ? SOLIDS : myType === 'stripes' ? STRIPES : [];
  const myRemaining = myBalls.filter(b => !pocketedBalls.includes(b));
  const canShoot8 = myRemaining.length === 0 && myType !== null;

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

  const handleShoot = async (targetBall: number) => {
    if (!isMyTurn || game.winner || game.status !== 'playing') return;

    // Simulate shot: 60% chance to pocket
    const success = Math.random() < 0.6;

    if (!success) {
      // Miss - switch turns
      await supabase.from('games').update({
        current_turn: isPlayerX ? game.player_o : game.player_x,
      }).eq('id', game.id);
      return;
    }

    const newPocketed = [...pocketedBalls, targetBall];
    const newGameData = { ...gameData, pocketed: newPocketed };

    // Assign types on first pocket (if not 8-ball)
    if (!playerXType && targetBall !== 8) {
      const isSolid = SOLIDS.includes(targetBall);
      (newGameData as any).player_x_type = isPlayerX ? (isSolid ? 'solids' : 'stripes') : (isSolid ? 'stripes' : 'solids');
    }

    const update: Record<string, unknown> = {
      game_data: newGameData,
    };

    // 8-ball logic
    if (targetBall === 8) {
      update.status = 'finished';
      if (canShoot8) {
        update.winner = userId; // Legal 8-ball pocket
      } else {
        update.winner = isPlayerX ? game.player_o : game.player_x; // Illegal - other player wins
      }
    } else {
      // Determine if player pocketed their own ball (gets another turn)
      const currentMyType = isPlayerX ? (newGameData as any).player_x_type : ((newGameData as any).player_x_type === 'solids' ? 'stripes' : 'solids');
      const isMyBall = currentMyType === 'solids' ? SOLIDS.includes(targetBall) : STRIPES.includes(targetBall);
      update.current_turn = isMyBall ? userId : (isPlayerX ? game.player_o : game.player_x);
    }

    await supabase.from('games').update(update).eq('id', game.id);
  };

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { pocketed: [], player_x_type: null },
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
    if (game.winner === userId) return '🎱 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (isMyTurn) {
      if (canShoot8) return '8-Ball! Letzte Kugel!';
      return `Dein Stoß! (${myType === 'solids' ? 'Volle' : myType === 'stripes' ? 'Halbe' : 'Wähle'})`;
    }
    return 'Gegner spielt…';
  };

  // Determine which balls the player can shoot
  const shootableBalls = remainingBalls.filter(b => {
    if (b === 8) return canShoot8;
    if (!myType) return b !== 8; // Before assignment, can shoot any non-8
    return myBalls.includes(b);
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">8-Ball Pool</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            isMyTurn ? 'bg-primary/10 text-primary animate-pulse-glow' :
            'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Pool table */}
          {game.status === 'playing' && !game.winner && (
            <div className="w-full max-w-md animate-fade-in-up">
              {/* Table */}
              <div className="bg-[hsl(150,50%,25%)] rounded-2xl p-4 border-4 border-[hsl(30,50%,30%)] shadow-lg">
                <p className="text-[10px] text-white/50 text-center mb-3 uppercase tracking-wider">
                  Tippe auf eine Kugel um zu stoßen
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {remainingBalls.map(ball => {
                    const canShoot = isMyTurn && shootableBalls.includes(ball);
                    const isSolid = SOLIDS.includes(ball);
                    return (
                      <button
                        key={ball}
                        onClick={() => canShoot && handleShoot(ball)}
                        disabled={!canShoot}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold
                          ${BALL_COLORS[ball]} text-white shadow-md
                          ${canShoot ? 'cursor-pointer hover:scale-110 active:scale-95' : 'opacity-60'}
                          transition-all duration-200
                          ${isSolid ? '' : 'ring-2 ring-white ring-inset'}
                        `}
                      >
                        {ball}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pocketed balls */}
              {pocketedBalls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1 justify-center">
                  <span className="text-[10px] text-muted-foreground mr-1">Versenkt:</span>
                  {pocketedBalls.map(ball => (
                    <div
                      key={ball}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white
                        ${BALL_COLORS[ball]} opacity-60
                        ${SOLIDS.includes(ball) ? '' : 'ring-1 ring-white ring-inset'}
                      `}
                    >
                      {ball}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
