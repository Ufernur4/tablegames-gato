/**
 * Chess Bot AI - evaluates moves using piece values and position heuristics
 */

type Board = string[];

const rc = (i: number) => [Math.floor(i / 8), i % 8] as const;
const idx = (r: number, c: number) => r * 8 + c;
const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const color = (p: string) => p ? p[0] as 'w' | 'b' : null;

const PIECE_VALUES: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };

function getSlidingMoves(board: Board, pos: number, dirs: number[][], col: 'w' | 'b'): number[] {
  const [r, c] = rc(pos);
  const moves: number[] = [];
  for (const [dr, dc] of dirs) {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (!inBounds(nr, nc)) break;
      const t = board[idx(nr, nc)];
      if (!t) { moves.push(idx(nr, nc)); continue; }
      if (color(t) !== col) moves.push(idx(nr, nc));
      break;
    }
  }
  return moves;
}

function getPseudoMoves(board: Board, pos: number): number[] {
  const piece = board[pos];
  if (!piece) return [];
  const col = color(piece)!;
  const [r, c] = rc(pos);
  const type = piece[1];

  if (type === 'P') {
    const moves: number[] = [];
    const dir = col === 'w' ? -1 : 1;
    const start = col === 'w' ? 6 : 1;
    if (inBounds(r+dir,c) && !board[idx(r+dir,c)]) {
      moves.push(idx(r+dir,c));
      if (r === start && !board[idx(r+2*dir,c)]) moves.push(idx(r+2*dir,c));
    }
    for (const dc of [-1,1]) {
      if (inBounds(r+dir,c+dc) && board[idx(r+dir,c+dc)] && color(board[idx(r+dir,c+dc)]) !== col)
        moves.push(idx(r+dir,c+dc));
    }
    return moves;
  }
  if (type === 'N') {
    const moves: number[] = [];
    for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r+dr, nc = c+dc;
      if (inBounds(nr,nc) && color(board[idx(nr,nc)]) !== col) moves.push(idx(nr,nc));
    }
    return moves;
  }
  if (type === 'B') return getSlidingMoves(board, pos, [[-1,-1],[-1,1],[1,-1],[1,1]], col);
  if (type === 'R') return getSlidingMoves(board, pos, [[-1,0],[1,0],[0,-1],[0,1]], col);
  if (type === 'Q') return getSlidingMoves(board, pos, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]], col);
  if (type === 'K') {
    const moves: number[] = [];
    for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = r+dr, nc = c+dc;
      if (inBounds(nr,nc) && color(board[idx(nr,nc)]) !== col) moves.push(idx(nr,nc));
    }
    return moves;
  }
  return [];
}

function isInCheck(board: Board, col: 'w' | 'b'): boolean {
  const ki = board.findIndex(p => p === col + 'K');
  if (ki === -1) return true;
  const opp = col === 'w' ? 'b' : 'w';
  for (let i = 0; i < 64; i++) {
    if (color(board[i]) === opp && getPseudoMoves(board, i).includes(ki)) return true;
  }
  return false;
}

function getLegalMoves(board: Board, col: 'w' | 'b'): { from: number; to: number }[] {
  const moves: { from: number; to: number }[] = [];
  for (let i = 0; i < 64; i++) {
    if (color(board[i]) !== col) continue;
    for (const to of getPseudoMoves(board, i)) {
      const nb = [...board]; nb[to] = nb[i]; nb[i] = '';
      if (!isInCheck(nb, col)) moves.push({ from: i, to });
    }
  }
  return moves;
}

function evaluate(board: Board): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const val = PIECE_VALUES[p[1]] || 0;
    const [r, c] = rc(i);
    // Center bonus
    const centerBonus = (3.5 - Math.abs(c - 3.5)) * 0.1 + (3.5 - Math.abs(r - 3.5)) * 0.05;
    if (color(p) === 'b') score += val + centerBonus;
    else score -= val + centerBonus;
  }
  return score;
}

function minimax(board: Board, depth: number, alpha: number, beta: number, isMax: boolean): number {
  if (depth === 0) return evaluate(board);
  const col = isMax ? 'b' : 'w';
  const moves = getLegalMoves(board, col);
  if (moves.length === 0) return isInCheck(board, col) ? (isMax ? -1000 : 1000) : 0;

  if (isMax) {
    let val = -Infinity;
    for (const m of moves) {
      const nb = [...board]; nb[m.to] = nb[m.from]; nb[m.from] = '';
      val = Math.max(val, minimax(nb, depth - 1, alpha, beta, false));
      alpha = Math.max(alpha, val);
      if (alpha >= beta) break;
    }
    return val;
  } else {
    let val = Infinity;
    for (const m of moves) {
      const nb = [...board]; nb[m.to] = nb[m.from]; nb[m.from] = '';
      val = Math.min(val, minimax(nb, depth - 1, alpha, beta, true));
      beta = Math.min(beta, val);
      if (alpha >= beta) break;
    }
    return val;
  }
}

export function chessBotMove(board: Board, difficulty: 'easy' | 'medium' | 'hard'): { from: number; to: number } | null {
  const moves = getLegalMoves(board, 'b');
  if (moves.length === 0) return null;

  if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)];

  const depth = difficulty === 'medium' ? 2 : 3;
  if (difficulty === 'medium' && Math.random() < 0.25) return moves[Math.floor(Math.random() * moves.length)];

  let bestScore = -Infinity;
  let bestMove = moves[0];
  for (const m of moves) {
    const nb = [...board]; nb[m.to] = nb[m.from]; nb[m.from] = '';
    const score = minimax(nb, depth - 1, -Infinity, Infinity, false);
    if (score > bestScore) { bestScore = score; bestMove = m; }
  }
  return bestMove;
}
