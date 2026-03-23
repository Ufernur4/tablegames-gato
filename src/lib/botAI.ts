/**
 * Bot AI system for X-Play platform.
 * Provides AI opponents with configurable difficulty for each game type.
 */

// ============ TIC-TAC-TOE BOT ============

const TTT_WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6],
];

function tttMinimax(board: string[], isMax: boolean, depth: number): number {
  for (const [a, b, c] of TTT_WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] === 'O' ? 10 - depth : depth - 10; // Bot is always O
    }
  }
  if (board.every(c => c)) return 0;

  if (isMax) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = 'O';
      best = Math.max(best, tttMinimax(board, false, depth + 1));
      board[i] = '';
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = 'X';
      best = Math.min(best, tttMinimax(board, true, depth + 1));
      board[i] = '';
    }
    return best;
  }
}

export function tttBotMove(board: string[], difficulty: 'easy' | 'medium' | 'hard'): number {
  const empty = board.map((v, i) => v === '' ? i : -1).filter(i => i !== -1);
  if (empty.length === 0) return -1;

  // Easy: random move
  if (difficulty === 'easy') {
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // Medium: 50% chance of optimal, 50% random
  if (difficulty === 'medium' && Math.random() < 0.5) {
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // Hard / Medium (optimal path): minimax
  let bestScore = -Infinity;
  let bestMove = empty[0];
  for (const i of empty) {
    board[i] = 'O';
    const score = tttMinimax(board, false, 0);
    board[i] = '';
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

// ============ CONNECT FOUR BOT ============

const C4_ROWS = 6, C4_COLS = 7;
const c4Cell = (b: string[], r: number, c: number) => b[r * C4_COLS + c];

function c4LowestRow(board: string[], col: number): number {
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (!c4Cell(board, r, col)) return r;
  }
  return -1;
}

function c4CheckWin(board: string[]): string | null {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const v = c4Cell(board, r, c);
      if (!v) continue;
      for (const [dr, dc] of dirs) {
        let cnt = 1;
        for (let i = 1; i < 4; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= C4_ROWS || nc < 0 || nc >= C4_COLS) break;
          if (c4Cell(board, nr, nc) === v) cnt++; else break;
        }
        if (cnt >= 4) return v;
      }
    }
  }
  return null;
}

function c4Score(board: string[], symbol: string): number {
  const opp = symbol === 'X' ? 'O' : 'X';
  let score = 0;
  // Center column preference
  for (let r = 0; r < C4_ROWS; r++) {
    if (c4Cell(board, r, 3) === symbol) score += 3;
  }
  // Evaluate windows
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      for (const [dr, dc] of dirs) {
        const window: string[] = [];
        for (let i = 0; i < 4; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= C4_ROWS || nc < 0 || nc >= C4_COLS) break;
          window.push(c4Cell(board, nr, nc));
        }
        if (window.length === 4) {
          const mine = window.filter(w => w === symbol).length;
          const theirs = window.filter(w => w === opp).length;
          const empty = window.filter(w => !w).length;
          if (mine === 4) score += 100;
          else if (mine === 3 && empty === 1) score += 5;
          else if (mine === 2 && empty === 2) score += 2;
          if (theirs === 3 && empty === 1) score -= 4;
        }
      }
    }
  }
  return score;
}

function c4Minimax(board: string[], depth: number, alpha: number, beta: number, isMax: boolean): number {
  const winner = c4CheckWin(board);
  if (winner === 'O') return 10000 + depth;
  if (winner === 'X') return -10000 - depth;
  if (board.every(c => c) || depth === 0) return c4Score(board, 'O');

  if (isMax) {
    let val = -Infinity;
    for (let c = 0; c < C4_COLS; c++) {
      const r = c4LowestRow(board, c);
      if (r === -1) continue;
      board[r * C4_COLS + c] = 'O';
      val = Math.max(val, c4Minimax(board, depth - 1, alpha, beta, false));
      board[r * C4_COLS + c] = '';
      alpha = Math.max(alpha, val);
      if (alpha >= beta) break;
    }
    return val;
  } else {
    let val = Infinity;
    for (let c = 0; c < C4_COLS; c++) {
      const r = c4LowestRow(board, c);
      if (r === -1) continue;
      board[r * C4_COLS + c] = 'X';
      val = Math.min(val, c4Minimax(board, depth - 1, alpha, beta, true));
      board[r * C4_COLS + c] = '';
      beta = Math.min(beta, val);
      if (alpha >= beta) break;
    }
    return val;
  }
}

export function connectFourBotMove(board: string[], difficulty: 'easy' | 'medium' | 'hard'): number {
  const validCols = [];
  for (let c = 0; c < C4_COLS; c++) {
    if (c4LowestRow(board, c) !== -1) validCols.push(c);
  }
  if (validCols.length === 0) return -1;

  if (difficulty === 'easy') {
    return validCols[Math.floor(Math.random() * validCols.length)];
  }

  const depth = difficulty === 'medium' ? 3 : 5;
  let bestScore = -Infinity;
  let bestCol = validCols[0];

  if (difficulty === 'medium' && Math.random() < 0.3) {
    return validCols[Math.floor(Math.random() * validCols.length)];
  }

  for (const c of validCols) {
    const r = c4LowestRow(board, c);
    board[r * C4_COLS + c] = 'O';
    const score = c4Minimax(board, depth, -Infinity, Infinity, false);
    board[r * C4_COLS + c] = '';
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }
  return bestCol;
}

// ============ CHECKERS BOT ============

const isOwnPiece = (piece: string, isX: boolean) =>
  isX ? (piece === 'r' || piece === 'R') : (piece === 'b' || piece === 'B');

const isOpPiece = (piece: string, isX: boolean) =>
  isX ? (piece === 'b' || piece === 'B') : (piece === 'r' || piece === 'R');

const isKing = (p: string) => p === 'R' || p === 'B';

type CMove = { from: number; to: number; captured?: number };

function getCheckerMoves(board: string[], pos: number, isX: boolean): CMove[] {
  const r = Math.floor(pos / 8), c = pos % 8;
  const piece = board[pos];
  if (!piece || !isOwnPiece(piece, isX)) return [];
  const moves: CMove[] = [];
  const dirs: number[] = [];
  if (piece === 'r' || isKing(piece)) dirs.push(1);
  if (piece === 'b' || isKing(piece)) dirs.push(-1);

  for (const dr of dirs) {
    for (const dc of [-1, 1]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
      if (!board[nr * 8 + nc]) {
        moves.push({ from: pos, to: nr * 8 + nc });
      } else if (isOpPiece(board[nr * 8 + nc], isX)) {
        const jr = nr + dr, jc = nc + dc;
        if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && !board[jr * 8 + jc]) {
          moves.push({ from: pos, to: jr * 8 + jc, captured: nr * 8 + nc });
        }
      }
    }
  }
  return moves;
}

function getAllCheckerMoves(board: string[], isX: boolean): CMove[] {
  const all: CMove[] = [];
  for (let i = 0; i < 64; i++) all.push(...getCheckerMoves(board, i, isX));
  const captures = all.filter(m => m.captured !== undefined);
  return captures.length > 0 ? captures : all;
}

export function checkersBotMove(board: string[], difficulty: 'easy' | 'medium' | 'hard'): CMove | null {
  // Bot plays as black (isX = false)
  const moves = getAllCheckerMoves(board, false);
  if (moves.length === 0) return null;

  if (difficulty === 'easy') {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Prefer captures, then center moves
  const captures = moves.filter(m => m.captured !== undefined);
  if (captures.length > 0) {
    if (difficulty === 'hard') {
      // Pick capture that removes most advanced opponent piece
      return captures.reduce((best, m) => {
        const capturedRow = Math.floor(m.captured! / 8);
        const bestRow = Math.floor(best.captured! / 8);
        return capturedRow > bestRow ? m : best;
      });
    }
    return captures[Math.floor(Math.random() * captures.length)];
  }

  if (difficulty === 'hard') {
    // Prefer advancing pieces and centering
    return moves.reduce((best, m) => {
      const toR = Math.floor(m.to / 8), toC = m.to % 8;
      const bestR = Math.floor(best.to / 8), bestC = best.to % 8;
      const mScore = (7 - toR) + (3.5 - Math.abs(toC - 3.5));
      const bScore = (7 - bestR) + (3.5 - Math.abs(bestC - 3.5));
      return mScore > bScore ? m : best;
    });
  }

  return moves[Math.floor(Math.random() * moves.length)];
}

// ============ DARTS BOT ============

export function dartsBotThrow(currentScore: number, difficulty: 'easy' | 'medium' | 'hard'): number {
  if (difficulty === 'easy') {
    // Random throw 1-20, occasionally bull
    const sections = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    const score = sections[Math.floor(Math.random() * sections.length)];
    return Math.min(score, currentScore);
  }

  if (difficulty === 'medium') {
    // Aim for decent scores
    const targets = [20, 19, 18, 17, 16, 15, 25];
    let target = targets[Math.floor(Math.random() * targets.length)];
    // Sometimes miss
    if (Math.random() < 0.3) target = Math.floor(Math.random() * 20) + 1;
    return Math.min(target, currentScore);
  }

  // Hard: strategic
  if (currentScore <= 40) {
    // Try to finish
    return currentScore;
  }
  // Aim for high scores
  const highTargets = [60, 57, 54, 51, 50, 48, 45, 40, 36, 25, 20];
  for (const t of highTargets) {
    if (t <= currentScore) return t;
  }
  return Math.min(20, currentScore);
}

// ============ BATTLESHIP BOT ============

export function battleshipBotAttack(myAttacks: number[]): number {
  const attacked = new Set(myAttacks);
  // Find hits that aren't fully resolved
  const hits = myAttacks.filter(idx => true); // We don't know which are hits without opponent grid

  // Smart targeting: if we have recent hits, attack adjacent
  // For simplicity: attack in a pattern with randomization
  const candidates: number[] = [];
  for (let i = 0; i < 100; i++) {
    if (!attacked.has(i)) candidates.push(i);
  }

  if (candidates.length === 0) return -1;

  // Checkerboard pattern for better coverage
  const patternCandidates = candidates.filter(idx => {
    const r = Math.floor(idx / 10), c = idx % 10;
    return (r + c) % 2 === 0;
  });

  const pool = patternCandidates.length > 0 ? patternCandidates : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Enhanced battleship bot that uses knowledge of hits */
export function battleshipSmartAttack(myAttacks: number[], opponentGrid: number[]): number {
  const attacked = new Set(myAttacks);
  const hits = myAttacks.filter(a => opponentGrid[a] === 1);

  // If we have unhunted hits, attack adjacent cells
  for (const hit of hits) {
    const r = Math.floor(hit / 10), c = hit % 10;
    const adjacent = [
      r > 0 ? (r - 1) * 10 + c : -1,
      r < 9 ? (r + 1) * 10 + c : -1,
      c > 0 ? r * 10 + c - 1 : -1,
      c < 9 ? r * 10 + c + 1 : -1,
    ].filter(i => i !== -1 && !attacked.has(i));

    if (adjacent.length > 0) {
      return adjacent[Math.floor(Math.random() * adjacent.length)];
    }
  }

  return battleshipBotAttack(myAttacks);
}
