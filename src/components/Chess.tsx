import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';

interface ChessProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

type Piece = string; // e.g. 'wK','wQ','wR','wB','wN','wP','bK','bQ','bR','bB','bN','bP',''
type Board = Piece[];

const INITIAL_BOARD: Board = [
  'bR','bN','bB','bQ','bK','bB','bN','bR',
  'bP','bP','bP','bP','bP','bP','bP','bP',
  '','','','','','','','',
  '','','','','','','','',
  '','','','','','','','',
  '','','','','','','','',
  'wP','wP','wP','wP','wP','wP','wP','wP',
  'wR','wN','wB','wQ','wK','wB','wN','wR',
];

const PIECE_SYMBOLS: Record<string, string> = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟',
};

const rc = (i: number) => [Math.floor(i / 8), i % 8] as const;
const idx = (r: number, c: number) => r * 8 + c;
const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const color = (p: string) => p ? p[0] as 'w' | 'b' : null;

function getSlidingMoves(board: Board, pos: number, dirs: number[][], col: 'w' | 'b'): number[] {
  const [r, c] = rc(pos);
  const moves: number[] = [];
  for (const [dr, dc] of dirs) {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (!inBounds(nr, nc)) break;
      const target = board[idx(nr, nc)];
      if (!target) { moves.push(idx(nr, nc)); continue; }
      if (color(target) !== col) moves.push(idx(nr, nc));
      break;
    }
  }
  return moves;
}

function getPseudoLegalMoves(board: Board, pos: number): number[] {
  const piece = board[pos];
  if (!piece) return [];
  const col = color(piece)!;
  const [r, c] = rc(pos);
  const moves: number[] = [];

  const type = piece[1];

  if (type === 'P') {
    const dir = col === 'w' ? -1 : 1;
    const startRow = col === 'w' ? 6 : 1;
    // Forward
    if (inBounds(r + dir, c) && !board[idx(r + dir, c)]) {
      moves.push(idx(r + dir, c));
      if (r === startRow && !board[idx(r + 2 * dir, c)]) moves.push(idx(r + 2 * dir, c));
    }
    // Capture
    for (const dc of [-1, 1]) {
      if (inBounds(r + dir, c + dc)) {
        const t = board[idx(r + dir, c + dc)];
        if (t && color(t) !== col) moves.push(idx(r + dir, c + dc));
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && color(board[idx(nr, nc)]) !== col) moves.push(idx(nr, nc));
    }
  } else if (type === 'B') {
    return getSlidingMoves(board, pos, [[-1,-1],[-1,1],[1,-1],[1,1]], col);
  } else if (type === 'R') {
    return getSlidingMoves(board, pos, [[-1,0],[1,0],[0,-1],[0,1]], col);
  } else if (type === 'Q') {
    return getSlidingMoves(board, pos, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]], col);
  } else if (type === 'K') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && color(board[idx(nr, nc)]) !== col) moves.push(idx(nr, nc));
    }
  }
  return moves;
}

function isKingInCheck(board: Board, col: 'w' | 'b'): boolean {
  const kingIdx = board.findIndex(p => p === col + 'K');
  if (kingIdx === -1) return true;
  const opp = col === 'w' ? 'b' : 'w';
  for (let i = 0; i < 64; i++) {
    if (color(board[i]) === opp) {
      if (getPseudoLegalMoves(board, i).includes(kingIdx)) return true;
    }
  }
  return false;
}

function getLegalMoves(board: Board, pos: number): number[] {
  const piece = board[pos];
  if (!piece) return [];
  const col = color(piece)!;
  return getPseudoLegalMoves(board, pos).filter(to => {
    const nb = [...board];
    nb[to] = nb[pos];
    nb[pos] = '';
    return !isKingInCheck(nb, col);
  });
}

function isCheckmate(board: Board, col: 'w' | 'b'): boolean {
  if (!isKingInCheck(board, col)) return false;
  for (let i = 0; i < 64; i++) {
    if (color(board[i]) === col && getLegalMoves(board, i).length > 0) return false;
  }
  return true;
}

function isStalemate(board: Board, col: 'w' | 'b'): boolean {
  if (isKingInCheck(board, col)) return false;
  for (let i = 0; i < 64; i++) {
    if (color(board[i]) === col && getLegalMoves(board, i).length > 0) return false;
  }
  return true;
}

export function Chess({ game: initialGame, userId, onLeave }: ChessProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [selected, setSelected] = useState<number | null>(null);
  const [legalMoves, setLegalMoves] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [lastMove, setLastMove] = useState<[number, number] | null>(null);

  const board: Board = Array.isArray(game.board) && game.board.length === 64
    ? (game.board as string[])
    : INITIAL_BOARD;

  const isPlayerX = game.player_x === userId;
  const isMyTurn = game.current_turn === userId;
  const myColor: 'w' | 'b' = isPlayerX ? 'w' : 'b';

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${initialGame.id}` }, (payload) => {
        setGame(payload.new as unknown as Game);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  const handleCellClick = async (i: number) => {
    if (!isMyTurn || game.status !== 'playing' || game.winner) return;

    const piece = board[i];

    if (selected !== null) {
      if (legalMoves.includes(i)) {
        // Execute move
        const newBoard = [...board];
        let movedPiece = newBoard[selected];

        // Pawn promotion
        const [toR] = rc(i);
        if (movedPiece[1] === 'P' && (toR === 0 || toR === 7)) {
          movedPiece = movedPiece[0] + 'Q';
        }

        newBoard[i] = movedPiece;
        newBoard[selected] = '';

        const oppColor = myColor === 'w' ? 'b' : 'w';
        const checkmate = isCheckmate(newBoard, oppColor);
        const stalemate = isStalemate(newBoard, oppColor);

        const update: Record<string, unknown> = {
          board: newBoard,
          current_turn: isPlayerX ? game.player_o : game.player_x,
        };

        if (checkmate) {
          update.winner = userId;
          update.status = 'finished';
        } else if (stalemate) {
          update.is_draw = true;
          update.status = 'finished';
        }

        setSelected(null);
        setLegalMoves([]);
        setLastMove([selected, i]);

        await supabase.from('games').update(update).eq('id', game.id);
        return;
      }
    }

    // Select own piece
    if (piece && color(piece) === myColor) {
      const moves = getLegalMoves(board, i);
      setSelected(i);
      setLegalMoves(moves);
    } else {
      setSelected(null);
      setLegalMoves([]);
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
      board: INITIAL_BOARD,
      winner: null,
      is_draw: false,
      status: 'playing' as any,
      current_turn: game.player_x,
    }).eq('id', game.id);
  };

  const inCheck = game.status === 'playing' && isKingInCheck(board, isMyTurn ? myColor : (myColor === 'w' ? 'b' : 'w'));

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (game.winner === userId) return '🎉 Schachmatt! Du hast gewonnen!';
    if (game.winner) return 'Schachmatt. Du hast verloren.';
    if (game.is_draw) return 'Patt – Unentschieden!';
    if (isMyTurn) return inCheck ? '⚠️ Du bist im Schach!' : `Dein Zug (${myColor === 'w' ? 'Weiß' : 'Schwarz'})`;
    return 'Zug des Gegners…';
  };

  // Render board - flip for black
  const renderBoard = () => {
    const cells = [];
    for (let displayR = 0; displayR < 8; displayR++) {
      for (let displayC = 0; displayC < 8; displayC++) {
        const r = isPlayerX ? displayR : 7 - displayR;
        const c = isPlayerX ? displayC : 7 - displayC;
        const i = idx(r, c);
        const isDark = (r + c) % 2 === 1;
        const isSelected = selected === i;
        const isLegal = legalMoves.includes(i);
        const isLast = lastMove && (lastMove[0] === i || lastMove[1] === i);
        const piece = board[i];

        cells.push(
          <button
            key={`${displayR}-${displayC}`}
            onClick={() => handleCellClick(i)}
            className={`
              aspect-square flex items-center justify-center text-lg sm:text-2xl transition-all duration-150
              ${isDark ? 'bg-[hsl(25,30%,35%)]' : 'bg-[hsl(35,30%,75%)]'}
              ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
              ${isLegal ? 'relative' : ''}
              ${isLast ? 'bg-[hsl(38,60%,50%,0.3)]' : ''}
              hover:brightness-110 active:scale-95
            `}
          >
            {isLegal && !piece && (
              <div className="w-2.5 h-2.5 rounded-full bg-primary/40" />
            )}
            {isLegal && piece && (
              <div className="absolute inset-0 ring-2 ring-primary/60 ring-inset rounded-sm" />
            )}
            {piece && (
              <span className={`${color(piece) === 'w' ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]' : 'drop-shadow-[0_1px_2px_rgba(255,255,255,0.2)]'}`}>
                {PIECE_SYMBOLS[piece] || ''}
              </span>
            )}
          </button>
        );
      }
    }
    return cells;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">♔ Schach</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            game.is_draw ? 'bg-secondary text-muted-foreground' :
            isMyTurn ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && game.winner === userId && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          <div className="grid grid-cols-8 w-full max-w-[360px] aspect-square rounded-lg overflow-hidden shadow-xl animate-fade-in-up">
            {renderBoard()}
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
