import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Trophy, Crosshair } from 'lucide-react';

interface BattleshipProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const GRID = 10;
const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

type Phase = 'placing' | 'playing' | 'finished';

/** Auto-place ships randomly on a 10x10 grid */
const autoPlaceShips = (): number[] => {
  const grid = Array(100).fill(0); // 0=empty, 1=ship
  for (const ship of SHIPS) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 200) {
      attempts++;
      const horizontal = Math.random() > 0.5;
      const r = Math.floor(Math.random() * GRID);
      const c = Math.floor(Math.random() * GRID);
      if (horizontal && c + ship.size > GRID) continue;
      if (!horizontal && r + ship.size > GRID) continue;

      let canPlace = true;
      const cells: number[] = [];
      for (let i = 0; i < ship.size; i++) {
        const idx = horizontal ? r * GRID + c + i : (r + i) * GRID + c;
        if (grid[idx] !== 0) { canPlace = false; break; }
        cells.push(idx);
      }
      if (canPlace) {
        cells.forEach(idx => grid[idx] = 1);
        placed = true;
      }
    }
  }
  return grid;
};

export function Battleship({ game: initialGame, userId, onLeave }: BattleshipProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [error, setError] = useState('');

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;

  // Each player's data stored in game_data
  const myGridKey = isPlayerX ? 'grid_x' : 'grid_o';
  const opGridKey = isPlayerX ? 'grid_o' : 'grid_x';
  const myAttacksKey = isPlayerX ? 'attacks_x' : 'attacks_o';
  const opAttacksKey = isPlayerX ? 'attacks_o' : 'attacks_x';

  const myGrid: number[] = gameData[myGridKey] || [];
  const opGrid: number[] = gameData[opGridKey] || [];
  const myAttacks: number[] = gameData[myAttacksKey] || [];
  const opAttacks: number[] = gameData[opAttacksKey] || [];
  const phase: Phase = gameData.phase || 'placing';
  const isMyTurn = game.current_turn === userId;

  // Check if this player has placed ships
  const hasPlaced = myGrid.length === 100;
  const opHasPlaced = opGrid.length === 100;

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

  // Auto-place ships when game starts
  const handlePlaceShips = async () => {
    const grid = autoPlaceShips();
    const newGameData = { ...gameData, [myGridKey]: grid };

    // If both placed, start playing
    if (opHasPlaced) {
      newGameData.phase = 'playing';
    }

    await supabase.from('games').update({
      game_data: newGameData,
      current_turn: game.player_x, // X always starts
    }).eq('id', game.id);
  };

  const handleAttack = async (idx: number) => {
    if (!isMyTurn || phase !== 'playing' || game.winner) return;
    if (myAttacks.includes(idx)) return; // Already attacked

    const newAttacks = [...myAttacks, idx];
    const newGameData = { ...gameData, [myAttacksKey]: newAttacks };

    // Count hits on opponent's ships
    const opShipCells = opGrid.reduce((acc: number[], v, i) => v === 1 ? [...acc, i] : acc, []);
    const totalHits = newAttacks.filter(a => opGrid[a] === 1).length;

    const update: Record<string, unknown> = {
      game_data: newGameData,
      current_turn: isPlayerX ? game.player_o : game.player_x,
    };

    // Check if all opponent ships sunk
    if (totalHits >= opShipCells.length) {
      update.winner = userId;
      update.status = 'finished';
      newGameData.phase = 'finished';
      update.game_data = newGameData;
    }

    const { error: err } = await supabase.from('games').update(update).eq('id', game.id);
    if (err) setError(err.message);
  };

  const handleReset = async () => {
    await supabase.from('games').update({
      game_data: { phase: 'placing' },
      winner: null, is_draw: false,
      status: 'playing' as any, current_turn: game.player_x,
    }).eq('id', game.id);
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

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '🎉 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (phase === 'placing') {
      if (!hasPlaced) return 'Platziere deine Schiffe!';
      return 'Warte auf Gegner…';
    }
    if (isMyTurn) return '🎯 Dein Schuss!';
    return 'Gegner schießt…';
  };

  const renderGrid = (
    grid: number[],
    attacks: number[],
    isOwn: boolean,
    onClick?: (idx: number) => void
  ) => (
    <div className="grid grid-cols-10 gap-px bg-border rounded-lg overflow-hidden">
      {Array.from({ length: 100 }).map((_, idx) => {
        const isShip = grid[idx] === 1;
        const isAttacked = attacks.includes(idx);
        const isHit = isAttacked && isShip;
        const isMiss = isAttacked && !isShip;

        return (
          <button
            key={idx}
            onClick={() => onClick?.(idx)}
            disabled={!onClick || isAttacked}
            className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-xs transition-all active:scale-95
              ${isHit ? 'bg-red-500/80' : isMiss ? 'bg-muted/60' : isOwn && isShip ? 'bg-primary/30' : 'bg-card'}
              ${onClick && !isAttacked ? 'cursor-pointer hover:bg-primary/10' : ''}
            `}
          >
            {isHit && '💥'}
            {isMiss && '·'}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Schiffe versenken</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            isMyTurn && phase === 'playing' ? 'bg-primary/10 text-primary animate-pulse-glow' :
            'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Placing phase */}
          {game.status === 'playing' && phase === 'placing' && !hasPlaced && (
            <div className="animate-fade-in-up space-y-3 text-center">
              <p className="text-xs text-muted-foreground">Schiffe werden zufällig platziert</p>
              <Button onClick={handlePlaceShips} className="gap-2">
                <Crosshair className="w-4 h-4" /> Schiffe platzieren
              </Button>
            </div>
          )}

          {/* Playing phase - show both grids */}
          {(phase === 'playing' || phase === 'finished') && (
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up">
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">Dein Feld</p>
                {renderGrid(myGrid, opAttacks, true)}
              </div>
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">Gegner</p>
                {renderGrid(
                  phase === 'finished' ? opGrid : Array(100).fill(0),
                  myAttacks,
                  false,
                  phase === 'playing' && isMyTurn && !game.winner ? handleAttack : undefined
                )}
              </div>
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
