import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, RotateCcw, Trophy } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface LudoProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const COLORS = ['🔴', '🔵', '🟢', '🟡'];
const COLOR_NAMES = ['Rot', 'Blau', 'Grün', 'Gelb'];
const COLOR_CSS = [
  'bg-red-500/20 text-red-400 border-red-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'bg-green-500/20 text-green-400 border-green-500/30',
  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
];

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

type LudoData = {
  pieces: number[][]; // 4 players × 4 pieces, -1=home, 0-39=board, 40-43=finish
  dice: number;
  rolled: boolean;
  current_player: number; // 0-3
  finished: number[]; // player indices who finished
};

const DEFAULT_DATA: LudoData = {
  pieces: [[-1,-1,-1,-1], [-1,-1,-1,-1], [-1,-1,-1,-1], [-1,-1,-1,-1]],
  dice: 0,
  rolled: false,
  current_player: 0,
  finished: [],
};

export function Ludo({ game: initialGame, userId, onLeave }: LudoProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [rolling, setRolling] = useState(false);

  const gd = (game.game_data || {}) as Record<string, unknown>;
  const data: LudoData = {
    pieces: (gd.pieces as number[][] | undefined) || DEFAULT_DATA.pieces,
    dice: (gd.dice as number | undefined) || 0,
    rolled: (gd.rolled as boolean | undefined) || false,
    current_player: (gd.current_player as number | undefined) || 0,
    finished: (gd.finished as number[] | undefined) || [],
  };

  const isPlayerX = game.player_x === userId;
  const myPlayerIndex = isPlayerX ? 0 : 1;
  const isMyTurn = game.current_turn === userId && game.status === 'playing';

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` }, (payload) => {
        setGame(payload.new as unknown as Game);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  const rollDice = async () => {
    if (!isMyTurn || data.rolled) return;
    setRolling(true);
    sounds.dice();
    const dice = Math.floor(Math.random() * 6) + 1;

    // Check if any move is possible
    const pieces = data.pieces[myPlayerIndex];
    const canMove = pieces.some((pos, _) => {
      if (pos === -1) return dice === 6; // Can only leave home with a 6
      const newPos = pos + dice;
      return newPos <= 43; // Don't overshoot finish
    });

    const newData = { ...data, dice, rolled: true };

    if (!canMove) {
      // Auto-skip turn after showing dice
      setTimeout(async () => {
        const nextPlayer = data.current_player === 0 ? 1 : 0;
        await supabase.from('games').update({
          game_data: { ...newData, rolled: false, current_player: nextPlayer, dice: 0 },
          current_turn: nextPlayer === 0 ? game.player_x : game.player_o,
        }).eq('id', game.id);
      }, 1500);
    }

    await supabase.from('games').update({
      game_data: newData,
    }).eq('id', game.id);

    setTimeout(() => setRolling(false), 800);
  };

  const movePiece = async (pieceIdx: number) => {
    if (!isMyTurn || !data.rolled) return;
    sounds.move();

    const pieces = JSON.parse(JSON.stringify(data.pieces)) as number[][];
    const currentPos = pieces[myPlayerIndex][pieceIdx];
    const dice = data.dice;

    if (currentPos === -1 && dice !== 6) return;

    let newPos: number;
    if (currentPos === -1) {
      newPos = 0; // Enter the board
    } else {
      newPos = currentPos + dice;
      if (newPos > 43) return; // Can't overshoot
    }

    pieces[myPlayerIndex][pieceIdx] = newPos;

    // Check if opponent piece is on same board position (kick back)
    if (newPos >= 0 && newPos <= 39) {
      const oppIdx = myPlayerIndex === 0 ? 1 : 0;
      for (let p = 0; p < 4; p++) {
        // Offset board positions for opponents
        const oppBoardPos = pieces[oppIdx][p];
        if (oppBoardPos >= 0 && oppBoardPos <= 39) {
          const myAbsPos = (myPlayerIndex * 10 + newPos) % 40;
          const oppAbsPos = (oppIdx * 10 + oppBoardPos) % 40;
          if (myAbsPos === oppAbsPos) {
            pieces[oppIdx][p] = -1; // Kick back home
          }
        }
      }
    }

    // Check if player finished (all pieces at 40-43)
    const allFinished = pieces[myPlayerIndex].every(p => p >= 40);
    const finished = [...data.finished];
    if (allFinished && !finished.includes(myPlayerIndex)) {
      finished.push(myPlayerIndex);
    }

    // Extra turn if rolled a 6
    const extraTurn = dice === 6;
    const nextPlayer = extraTurn ? data.current_player : (data.current_player === 0 ? 1 : 0);

    const update: Record<string, unknown> = {
      game_data: {
        ...data,
        pieces,
        rolled: false,
        dice: 0,
        current_player: nextPlayer,
        finished,
      },
      current_turn: nextPlayer === 0 ? game.player_x : game.player_o,
    };

    if (allFinished) {
      update.winner = userId;
      update.status = 'finished';
    }

    await supabase.from('games').update(update).eq('id', game.id);
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
      game_data: DEFAULT_DATA,
      winner: null,
      is_draw: false,
      status: 'playing' as any,
      current_turn: game.player_x,
    }).eq('id', game.id);
  };

  const DiceIcon = data.dice >= 1 && data.dice <= 6 ? DICE_ICONS[data.dice - 1] : Dice1;

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '🎉 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (isMyTurn && !data.rolled) return 'Würfle!';
    if (isMyTurn && data.rolled) return `Du hast ${data.dice} gewürfelt – wähle eine Figur`;
    return `${COLOR_NAMES[data.current_player]} ist am Zug…`;
  };

  const canMovePiece = (pieceIdx: number) => {
    if (!isMyTurn || !data.rolled) return false;
    const pos = data.pieces[myPlayerIndex][pieceIdx];
    if (pos === -1) return data.dice === 6;
    return pos + data.dice <= 43;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">🎲 Ludo</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            isMyTurn ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && game.winner === userId && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Dice */}
          {game.status === 'playing' && (
            <button
              onClick={rollDice}
              disabled={!isMyTurn || data.rolled || rolling}
              className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all active:scale-95 ${
                isMyTurn && !data.rolled
                  ? 'border-primary bg-primary/10 hover:bg-primary/20 cursor-pointer'
                  : 'border-border bg-secondary/50'
              } ${rolling ? 'animate-bounce' : ''}`}
            >
              <DiceIcon className={`w-10 h-10 ${data.dice ? 'text-primary' : 'text-muted-foreground'}`} />
            </button>
          )}

          {/* Player pieces */}
          <div className="grid grid-cols-2 gap-4 w-full max-w-md">
            {[0, 1].map(playerIdx => (
              <div key={playerIdx} className={`rounded-xl border p-4 ${COLOR_CSS[playerIdx]}`}>
                <div className="text-xs font-semibold mb-3 flex items-center gap-2">
                  {COLORS[playerIdx]} {COLOR_NAMES[playerIdx]}
                  {playerIdx === myPlayerIndex && <span className="text-[10px] opacity-60">(Du)</span>}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {data.pieces[playerIdx].map((pos, pieceIdx) => {
                    const canMove = playerIdx === myPlayerIndex && canMovePiece(pieceIdx);
                    return (
                      <button
                        key={pieceIdx}
                        onClick={() => canMove && movePiece(pieceIdx)}
                        disabled={!canMove}
                        className={`
                          w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold
                          transition-all
                          ${pos === -1 ? 'bg-background/30 border border-current/20' : 
                            pos >= 40 ? 'bg-background/50 border-2 border-current' :
                            'bg-background/40 border border-current/40'}
                          ${canMove ? 'ring-2 ring-primary animate-pulse cursor-pointer hover:scale-110 active:scale-95' : ''}
                        `}
                      >
                        {pos === -1 ? '🏠' : pos >= 40 ? '🏁' : pos}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
