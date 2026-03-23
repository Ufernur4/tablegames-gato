import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';

interface CheckersProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

// Board: 8x8 flat array. Values: '' | 'r' | 'b' | 'R' | 'B' (R/B = kings)
const BOARD_SIZE = 8;

const initialBoard = (): string[] => {
  const b = Array(64).fill('');
  // Red pieces (top, rows 0-2)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) b[r * 8 + c] = 'r';
    }
  }
  // Black pieces (bottom, rows 5-7)
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) b[r * 8 + c] = 'b';
    }
  }
  return b;
};

const isOwnPiece = (piece: string, isPlayerX: boolean) => {
  if (isPlayerX) return piece === 'r' || piece === 'R';
  return piece === 'b' || piece === 'B';
};

const isOpponentPiece = (piece: string, isPlayerX: boolean) => {
  if (isPlayerX) return piece === 'b' || piece === 'B';
  return piece === 'r' || piece === 'R';
};

const isKing = (piece: string) => piece === 'R' || piece === 'B';

type Move = { from: number; to: number; captured?: number };

const getValidMoves = (board: string[], pos: number, playerIsX: boolean): Move[] => {
  const r = Math.floor(pos / 8), c = pos % 8;
  const piece = board[pos];
  if (!piece || !isOwnPiece(piece, playerIsX)) return [];

  const moves: Move[] = [];
  // Directions: red moves down (+1), black moves up (-1), kings both
  const dirs: number[] = [];
  if (piece === 'r' || isKing(piece)) dirs.push(1); // down
  if (piece === 'b' || isKing(piece)) dirs.push(-1); // up

  for (const dr of dirs) {
    for (const dc of [-1, 1]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
      const target = board[nr * 8 + nc];

      if (!target) {
        moves.push({ from: pos, to: nr * 8 + nc });
      } else if (isOpponentPiece(target, playerIsX)) {
        // Jump
        const jr = nr + dr, jc = nc + dc;
        if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && !board[jr * 8 + jc]) {
          moves.push({ from: pos, to: jr * 8 + jc, captured: nr * 8 + nc });
        }
      }
    }
  }
  return moves;
};

const getAllMoves = (board: string[], playerIsX: boolean): Move[] => {
  const allMoves: Move[] = [];
  for (let i = 0; i < 64; i++) {
    allMoves.push(...getValidMoves(board, i, playerIsX));
  }
  // If there are captures, must capture (forced capture rule)
  const captures = allMoves.filter(m => m.captured !== undefined);
  return captures.length > 0 ? captures : allMoves;
};

const countPieces = (board: string[], playerIsX: boolean): number => {
  return board.filter(p => isOwnPiece(p, playerIsX)).length;
};

export function Checkers({ game: initialGame, userId, onLeave }: CheckersProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [error, setError] = useState('');

  const board = Array.isArray(game.board) && game.board.length === 64
    ? (game.board as string[])
    : initialBoard();
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

  const handleCellClick = useCallback(async (idx: number) => {
    if (!isMyTurn || game.status !== 'playing' || game.winner) return;

    const piece = board[idx];

    // If clicking on own piece, select it
    if (piece && isOwnPiece(piece, isPlayerX)) {
      const moves = getValidMoves(board, idx, isPlayerX);
      // Check forced capture
      const allMoves = getAllMoves(board, isPlayerX);
      const hasCaptures = allMoves.some(m => m.captured !== undefined);
      const filteredMoves = hasCaptures ? moves.filter(m => m.captured !== undefined) : moves;

      setSelectedPiece(idx);
      setValidMoves(filteredMoves);
      return;
    }

    // If a piece is selected and clicking a valid target
    if (selectedPiece !== null) {
      const move = validMoves.find(m => m.to === idx);
      if (!move) {
        setSelectedPiece(null);
        setValidMoves([]);
        return;
      }

      const newBoard = [...board];
      newBoard[move.to] = newBoard[move.from];
      newBoard[move.from] = '';
      if (move.captured !== undefined) newBoard[move.captured] = '';

      // King promotion
      const toRow = Math.floor(move.to / 8);
      if (newBoard[move.to] === 'r' && toRow === 7) newBoard[move.to] = 'R';
      if (newBoard[move.to] === 'b' && toRow === 0) newBoard[move.to] = 'B';

      // Check for multi-jump
      let continueJump = false;
      if (move.captured !== undefined) {
        const furtherJumps = getValidMoves(newBoard, move.to, isPlayerX).filter(m => m.captured !== undefined);
        if (furtherJumps.length > 0) continueJump = true;
      }

      if (continueJump) {
        // Stay on same turn for multi-jump
        const { error: err } = await supabase.from('games').update({
          board: newBoard,
        }).eq('id', game.id);
        if (err) setError(err.message);
        setSelectedPiece(move.to);
        setValidMoves(getValidMoves(newBoard, move.to, isPlayerX).filter(m => m.captured !== undefined));
        return;
      }

      // Check win
      const opponentPieces = countPieces(newBoard, !isPlayerX);
      const opponentMoves = getAllMoves(newBoard, !isPlayerX);

      const update: Record<string, unknown> = {
        board: newBoard,
        current_turn: isPlayerX ? game.player_o : game.player_x,
      };

      if (opponentPieces === 0 || opponentMoves.length === 0) {
        update.winner = userId;
        update.status = 'finished';
      }

      const { error: err } = await supabase.from('games').update(update).eq('id', game.id);
      if (err) setError(err.message);

      setSelectedPiece(null);
      setValidMoves([]);
    }
  }, [isMyTurn, game, board, isPlayerX, selectedPiece, validMoves, userId]);

  const handleReset = async () => {
    await supabase.from('games').update({
      board: initialBoard(), winner: null, is_draw: false,
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
    if (isMyTurn) return `Dein Zug (${isPlayerX ? '🔴' : '⚫'})`;
    return 'Zug des Gegners…';
  };

  const getPieceDisplay = (piece: string) => {
    if (!piece) return null;
    const isRed = piece === 'r' || piece === 'R';
    return (
      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center
        ${isRed ? 'bg-red-500 border-red-300' : 'bg-gray-800 border-gray-600'}
        ${isKing(piece) ? 'ring-2 ring-primary' : ''}
        transition-transform
      `}>
        {isKing(piece) && <span className="text-[10px]">👑</span>}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Dame</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            isMyTurn ? 'bg-primary/10 text-primary animate-pulse-glow' :
            'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Score */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>🔴 {countPieces(board, true)}</span>
            <span>⚫ {countPieces(board, false)}</span>
          </div>

          {/* Board */}
          <div className="rounded-xl overflow-hidden shadow-lg border border-border animate-fade-in-up">
            <div className="grid grid-cols-8">
              {Array.from({ length: 64 }).map((_, idx) => {
                const r = Math.floor(idx / 8), c = idx % 8;
                const isDark = (r + c) % 2 === 1;
                const piece = board[idx];
                const isSelected = selectedPiece === idx;
                const isValidTarget = validMoves.some(m => m.to === idx);

                return (
                  <button
                    key={idx}
                    onClick={() => handleCellClick(idx)}
                    className={`w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center relative transition-all
                      ${isDark ? 'bg-[hsl(30,40%,30%)]' : 'bg-[hsl(40,30%,75%)]'}
                      ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
                      ${isValidTarget ? 'after:absolute after:w-3 after:h-3 after:rounded-full after:bg-primary/50' : ''}
                      active:scale-95
                    `}
                  >
                    {getPieceDisplay(piece)}
                  </button>
                );
              })}
            </div>
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
