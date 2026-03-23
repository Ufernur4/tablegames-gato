import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import {
  tttBotMove, connectFourBotMove, checkersBotMove, dartsBotThrow, battleshipBotAttack,
} from '@/lib/botAI';
import { chessBotMove } from '@/lib/chessBotAI';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';
const BOT_MOVE_DELAY = 800;

export function useBot(game: Game | null, userId: string, difficulty: BotDifficulty) {
  const [isBotGame, setIsBotGame] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isBot = game?.player_o === BOT_USER_ID;

  useEffect(() => {
    if (!game || !isBot) return;
    setIsBotGame(true);
    if (game.current_turn !== BOT_USER_ID || game.status !== 'playing' || game.winner) return;

    const gameType = game.game_type as string;

    timeoutRef.current = setTimeout(async () => {
      const board = Array.isArray(game.board) ? [...(game.board as string[])] : [];
      const gameData = (game.game_data || {}) as Record<string, any>;

      switch (gameType) {
        case 'tic-tac-toe': {
          const move = tttBotMove([...board], difficulty);
          if (move === -1) return;
          const nb = [...board]; nb[move] = 'O';
          const WIN = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
          let w: string | null = null;
          for (const [a,b,c] of WIN) { if (nb[a] && nb[a] === nb[b] && nb[a] === nb[c]) { w = nb[a]; break; } }
          const d = !w && nb.every(c => c !== '');
          const u: Record<string, unknown> = { board: nb, current_turn: game.player_x };
          if (w) { u.winner = BOT_USER_ID; u.status = 'finished'; }
          else if (d) { u.is_draw = true; u.status = 'finished'; }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'connect-four': {
          const col = connectFourBotMove([...board], difficulty);
          if (col === -1) return;
          const nb = [...board];
          for (let r = 5; r >= 0; r--) { if (!nb[r * 7 + col]) { nb[r * 7 + col] = 'O'; break; } }
          const dirs = [[0,1],[1,0],[1,1],[1,-1]];
          let w: string | null = null;
          for (let r = 0; r < 6 && !w; r++) for (let c = 0; c < 7 && !w; c++) {
            const v = nb[r*7+c]; if (!v) continue;
            for (const [dr,dc] of dirs) { let cnt = 1; for (let i = 1; i < 4; i++) { const nr = r+dr*i, nc = c+dc*i; if (nr<0||nr>=6||nc<0||nc>=7) break; if (nb[nr*7+nc]===v) cnt++; else break; } if (cnt>=4) { w = v; break; } }
          }
          const d = !w && nb.every(c => c !== '');
          const u: Record<string, unknown> = { board: nb, current_turn: game.player_x };
          if (w) { u.winner = BOT_USER_ID; u.status = 'finished'; } else if (d) { u.is_draw = true; u.status = 'finished'; }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'checkers': {
          const move = checkersBotMove([...board], difficulty);
          if (!move) return;
          const nb = [...board]; nb[move.to] = nb[move.from]; nb[move.from] = '';
          if (move.captured !== undefined) nb[move.captured] = '';
          const toRow = Math.floor(move.to / 8);
          if (nb[move.to] === 'b' && toRow === 0) nb[move.to] = 'B';
          const pp = nb.filter(p => p === 'r' || p === 'R').length;
          const u: Record<string, unknown> = { board: nb, current_turn: game.player_x };
          if (pp === 0) { u.winner = BOT_USER_ID; u.status = 'finished'; }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'darts': {
          const bs = gameData.player_o_score ?? 301;
          const pts = dartsBotThrow(bs, difficulty);
          const ns = Math.max(0, bs - pts);
          const nd = { ...gameData, player_o_score: ns, current_round: (gameData.current_round || 1) + 1 };
          const u: Record<string, unknown> = { game_data: nd, current_turn: game.player_x };
          if (ns <= 0) { u.winner = BOT_USER_ID; u.status = 'finished'; }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'battleship': {
          const ba = gameData.attacks_o || [];
          const pg: number[] = gameData.grid_x || [];
          const atk = battleshipBotAttack(ba);
          if (atk === -1) return;
          const na = [...ba, atk];
          const nd = { ...gameData, attacks_o: na };
          const sc = pg.reduce((a: number[], v, i) => v === 1 ? [...a, i] : a, []);
          const th = na.filter(a => pg[a] === 1).length;
          const u: Record<string, unknown> = { game_data: nd, current_turn: game.player_x };
          if (th >= sc.length && sc.length > 0) { u.winner = BOT_USER_ID; u.status = 'finished'; (nd as any).phase = 'finished'; u.game_data = nd; }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'chess': {
          const move = chessBotMove([...board], difficulty);
          if (!move) return;
          const nb = [...board];
          let piece = nb[move.from];
          // Pawn promotion
          const toR = Math.floor(move.to / 8);
          if (piece[1] === 'P' && (toR === 0 || toR === 7)) piece = piece[0] + 'Q';
          nb[move.to] = piece; nb[move.from] = '';
          // Simple checkmate detection
          const oppKing = nb.findIndex(p => p === 'wK');
          const u: Record<string, unknown> = { board: nb, current_turn: game.player_x };
          if (oppKing === -1) { u.winner = BOT_USER_ID; u.status = 'finished'; }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'memory': {
          // Bot picks random unmatched cards
          const matched = gameData.matched as boolean[] || [];
          const unmatched = matched.map((m, i) => m ? -1 : i).filter(i => i !== -1);
          if (unmatched.length < 2) return;
          const cards = gameData.cards as string[];
          // Try to find a match (harder bots remember)
          let pick1 = -1, pick2 = -1;
          if (difficulty === 'hard') {
            for (let i = 0; i < unmatched.length; i++) for (let j = i+1; j < unmatched.length; j++) {
              if (cards[unmatched[i]] === cards[unmatched[j]]) { pick1 = unmatched[i]; pick2 = unmatched[j]; break; }
              if (pick1 !== -1) break;
            }
          }
          if (pick1 === -1) {
            pick1 = unmatched[Math.floor(Math.random() * unmatched.length)];
            const rest = unmatched.filter(i => i !== pick1);
            pick2 = rest[Math.floor(Math.random() * rest.length)];
          }
          const isMatch = cards[pick1] === cards[pick2];
          const newMatched = [...matched]; if (isMatch) { newMatched[pick1] = true; newMatched[pick2] = true; }
          const newScore = (gameData.player_o_score || 0) + (isMatch ? 1 : 0);
          const allDone = newMatched.every(Boolean);
          const u: Record<string, unknown> = {
            game_data: { ...gameData, matched: newMatched, player_o_score: newScore, first_pick: null, revealed: Array(16).fill(false).map((_,i) => newMatched[i]) },
            current_turn: isMatch && !allDone ? BOT_USER_ID : game.player_x,
          };
          if (allDone) {
            u.status = 'finished';
            const xs = gameData.player_x_score || 0;
            if (newScore > xs) u.winner = BOT_USER_ID;
            else if (xs > newScore) u.winner = game.player_x;
            else u.is_draw = true;
          }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'rock-paper-scissors': {
          const choices = ['rock', 'paper', 'scissors'] as const;
          const choice = choices[Math.floor(Math.random() * 3)];
          const xChoice = gameData.player_x_choice;
          const nd: Record<string, any> = { ...gameData, player_o_choice: choice };
          if (xChoice) {
            const getW = (a: string, b: string) => a === b ? 'draw' : ((a==='rock'&&b==='scissors')||(a==='paper'&&b==='rock')||(a==='scissors'&&b==='paper')) ? 'a' : 'b';
            const result = getW(xChoice, choice);
            const xs = (gameData.player_x_score || 0) + (result === 'a' ? 1 : 0);
            const os = (gameData.player_o_score || 0) + (result === 'b' ? 1 : 0);
            const rounds = (gameData.rounds || 0) + 1;
            const rText = result === 'draw' ? 'Unentschieden!' : result === 'a' ? 'Du gewinnst!' : 'Bot gewinnt!';
            nd.player_x_score = xs; nd.player_o_score = os; nd.rounds = rounds; nd.round_result = rText;
            const gameOver = rounds >= (gameData.max_rounds || 5);
            const u: Record<string, unknown> = { game_data: nd };
            if (gameOver) { u.status = 'finished'; if (xs > os) u.winner = game.player_x; else if (os > xs) u.winner = BOT_USER_ID; else u.is_draw = true; }
            await supabase.from('games').update(u).eq('id', game.id);
            if (!gameOver) {
              setTimeout(async () => {
                await supabase.from('games').update({
                  game_data: { ...nd, player_x_choice: null, player_o_choice: null, round_result: null },
                }).eq('id', game.id);
              }, 2500);
            }
          } else {
            await supabase.from('games').update({ game_data: nd }).eq('id', game.id);
          }
          break;
        }
        case 'ludo': {
          const pieces = JSON.parse(JSON.stringify(gameData.pieces || [[-1,-1,-1,-1],[-1,-1,-1,-1]]));
          const dice = Math.floor(Math.random() * 6) + 1;
          const botIdx = 1;
          const movable = pieces[botIdx].map((pos: number, i: number) => {
            if (pos === -1) return dice === 6 ? i : -1;
            return pos + dice <= 43 ? i : -1;
          }).filter((i: number) => i !== -1);
          if (movable.length > 0) {
            const pi = movable[Math.floor(Math.random() * movable.length)];
            if (pieces[botIdx][pi] === -1) pieces[botIdx][pi] = 0;
            else pieces[botIdx][pi] += dice;
          }
          const allFinished = pieces[botIdx].every((p: number) => p >= 40);
          const nextPlayer = dice === 6 ? 1 : 0;
          const u: Record<string, unknown> = {
            game_data: { ...gameData, pieces, dice, rolled: false, current_player: nextPlayer, finished: allFinished ? [1] : [] },
            current_turn: nextPlayer === 0 ? game.player_x : BOT_USER_ID,
          };
          if (allFinished) { u.winner = BOT_USER_ID; u.status = 'finished'; }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'bowling': {
          const framesKey = 'player_o_frames';
          const curFrames = gameData.player_o_frames || [];
          const roll = gameData.current_roll || 1;
          const firstPins = gameData.first_roll_pins ?? null;
          let pinsDown: number;
          if (roll === 1) {
            pinsDown = difficulty === 'hard' ? (Math.random() < 0.4 ? 10 : Math.floor(Math.random() * 5) + 5) :
                       difficulty === 'medium' ? Math.floor(Math.random() * 8) + 1 :
                       Math.floor(Math.random() * 7);
          } else {
            const remaining = 10 - (firstPins || 0);
            pinsDown = Math.floor(Math.random() * (remaining + 1));
          }
          if (roll === 1 && pinsDown === 10) {
            const nf = [...curFrames, 10];
            const nd = { ...gameData, [framesKey]: nf, current_roll: 1, first_roll_pins: null };
            const u: Record<string, unknown> = { game_data: nd, current_turn: game.player_x };
            const xF = gameData.player_x_frames || [];
            if (xF.length >= 5 && nf.length >= 5) {
              u.status = 'finished';
              const xT = xF.reduce((a: number, b: number) => a + b, 0), oT = nf.reduce((a: number, b: number) => a + b, 0);
              if (xT > oT) u.winner = game.player_x; else if (oT > xT) u.winner = BOT_USER_ID; else u.is_draw = true;
            }
            await supabase.from('games').update(u).eq('id', game.id);
          } else if (roll === 1) {
            await supabase.from('games').update({
              game_data: { ...gameData, current_roll: 2, first_roll_pins: pinsDown },
              current_turn: BOT_USER_ID,
            }).eq('id', game.id);
          } else {
            const total = (firstPins || 0) + pinsDown;
            const nf = [...curFrames, total];
            const nd = { ...gameData, [framesKey]: nf, current_roll: 1, first_roll_pins: null };
            const u: Record<string, unknown> = { game_data: nd, current_turn: game.player_x };
            const xF = gameData.player_x_frames || [];
            if (xF.length >= 5 && nf.length >= 5) {
              u.status = 'finished';
              const xT = xF.reduce((a: number, b: number) => a + b, 0), oT = nf.reduce((a: number, b: number) => a + b, 0);
              if (xT > oT) u.winner = game.player_x; else if (oT > xT) u.winner = BOT_USER_ID; else u.is_draw = true;
            }
            await supabase.from('games').update(u).eq('id', game.id);
          }
          break;
        }
        case 'mini-golf': {
          const holes = gameData.player_o_holes || [];
          const strokes = difficulty === 'hard' ? Math.floor(Math.random() * 2) + 2 :
                         difficulty === 'medium' ? Math.floor(Math.random() * 3) + 2 :
                         Math.floor(Math.random() * 4) + 3;
          const newHoles = [...holes, strokes];
          const nd = { ...gameData, player_o_holes: newHoles };
          const u: Record<string, unknown> = { game_data: nd, current_turn: game.player_x };
          const xH = gameData.player_x_holes || [];
          if (xH.length >= 5 && newHoles.length >= 5) {
            u.status = 'finished';
            const xT = xH.reduce((a: number, b: number) => a + b, 0), oT = newHoles.reduce((a: number, b: number) => a + b, 0);
            if (xT < oT) u.winner = game.player_x; else if (oT < xT) u.winner = BOT_USER_ID; else u.is_draw = true;
          }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'pool': {
          // Simple bot: pocket a random ball
          const pocketed = gameData.pocketed || [];
          const remaining = Array.from({ length: 15 }, (_, i) => i + 1).filter(b => !pocketed.includes(b));
          if (remaining.length > 0) {
            const ball = remaining[Math.floor(Math.random() * remaining.length)];
            const np = [...pocketed, ball];
            const nd = { ...gameData, pocketed: np };
            const u: Record<string, unknown> = { game_data: nd, current_turn: game.player_x };
            if (ball === 8 && remaining.length > 1) {
              u.winner = game.player_x; u.status = 'finished'; // Bot pocketed 8 too early = loses
            } else if (ball === 8) {
              u.winner = BOT_USER_ID; u.status = 'finished';
            }
            await supabase.from('games').update(u).eq('id', game.id);
          }
          break;
        }
        case 'trivia': {
          // Bot answers
          const correct = difficulty === 'hard' ? Math.random() < 0.8 :
                         difficulty === 'medium' ? Math.random() < 0.5 : Math.random() < 0.25;
          const newScore = (gameData.player_o_score || 0) + (correct ? 1 : 0);
          const nextQ = (gameData.current_question || 0) + 1;
          const nd = { ...gameData, player_o_score: newScore, current_question: nextQ };
          const u: Record<string, unknown> = { game_data: nd, current_turn: game.player_x };
          if (nextQ >= (gameData.total_questions || 10)) {
            u.status = 'finished';
            const xs = gameData.player_x_score || 0;
            if (xs > newScore) u.winner = game.player_x; else if (newScore > xs) u.winner = BOT_USER_ID; else u.is_draw = true;
          }
          await supabase.from('games').update(u).eq('id', game.id);
          break;
        }
        case 'word-game': {
          // Bot guesses a letter
          const guessed = gameData.guessed_letters || [];
          const alphabet = 'ETAOINSRHLDCUMFPGWYBVKJXQZ'.split('');
          const next = alphabet.find(l => !guessed.includes(l));
          if (next) {
            const ng = [...guessed, next];
            const u: Record<string, unknown> = { game_data: { ...gameData, guessed_letters: ng }, current_turn: game.player_x };
            await supabase.from('games').update(u).eq('id', game.id);
          }
          break;
        }
        case 'table-soccer': {
          // Bot "kicks" the ball - scores based on difficulty
          const chance = difficulty === 'hard' ? 0.5 : difficulty === 'medium' ? 0.35 : 0.2;
          const scored = Math.random() < chance;
          if (scored) {
            const newScoreO = (gameData.score_o ?? 0) + 1;
            const nd = { ...gameData, score_o: newScoreO };
            const u: Record<string, unknown> = { game_data: nd, current_turn: game.player_x };
            if (newScoreO >= (gameData.max_goals ?? 5)) { u.status = 'finished'; u.winner = BOT_USER_ID; }
            await supabase.from('games').update(u).eq('id', game.id);
          } else {
            await supabase.from('games').update({ current_turn: game.player_x }).eq('id', game.id);
          }
          break;
        }
      }
    }, BOT_MOVE_DELAY);

    return () => { clearTimeout(timeoutRef.current); };
  }, [game?.current_turn, game?.status, game?.id, isBot, difficulty]);

  return { isBotGame, BOT_USER_ID };
}

export async function createBotGame(userId: string, gameType: Game['game_type'], difficulty: BotDifficulty) {
  const EMOJIS = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔'];
  const genMem = () => { const p = [...EMOJIS].sort(() => Math.random() - 0.5).slice(0, 8); return [...p, ...p].sort(() => Math.random() - 0.5); };

  const boardMap: Record<string, any> = {
    'tic-tac-toe': ['','','','','','','','',''],
    'connect-four': Array(42).fill(''),
    'checkers': (() => { const b = Array(64).fill(''); for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r+c)%2===1) b[r*8+c]='r'; for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if ((r+c)%2===1) b[r*8+c]='b'; return b; })(),
    'chess': ['bR','bN','bB','bQ','bK','bB','bN','bR','bP','bP','bP','bP','bP','bP','bP','bP','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','wP','wP','wP','wP','wP','wP','wP','wP','wR','wN','wB','wQ','wK','wB','wN','wR'],
    'darts': [],
    'battleship': [],
    'ludo': [],
    'memory': [],
    'rock-paper-scissors': [],
  };

  const gameDataMap: Record<string, any> = {
    'tic-tac-toe': { bot_difficulty: difficulty },
    'connect-four': { bot_difficulty: difficulty },
    'checkers': { bot_difficulty: difficulty },
    'chess': { bot_difficulty: difficulty },
    'darts': { player_x_score: 301, player_o_score: 301, current_round: 1, bot_difficulty: difficulty },
    'battleship': { phase: 'placing', bot_difficulty: difficulty },
    'bowling': { player_x_frames: [], player_o_frames: [], current_roll: 1, first_roll_pins: null, bot_difficulty: difficulty },
    'mini-golf': { player_x_holes: [], player_o_holes: [], current_hole: 0, current_strokes: 0, ball_position: 100, bot_difficulty: difficulty },
    'pool': { pocketed: [], player_x_type: null, bot_difficulty: difficulty },
    'trivia': { current_question: 0, player_x_score: 0, player_o_score: 0, total_questions: 10, bot_difficulty: difficulty },
    'word-game': { guessed_letters: [], wrong_guesses: 0, bot_difficulty: difficulty },
    'ludo': { pieces: [[-1,-1,-1,-1], [-1,-1,-1,-1]], dice: 0, rolled: false, current_player: 0, finished: [], bot_difficulty: difficulty },
    'memory': { cards: genMem(), revealed: Array(16).fill(false), matched: Array(16).fill(false), player_x_score: 0, player_o_score: 0, first_pick: null, bot_difficulty: difficulty },
    'rock-paper-scissors': { player_x_choice: null, player_o_choice: null, player_x_score: 0, player_o_score: 0, rounds: 0, max_rounds: 5, round_result: null, bot_difficulty: difficulty },
    'table-soccer': { score_x: 0, score_o: 0, max_goals: 5, bot_difficulty: difficulty },
  };

  const { data, error } = await supabase
    .from('games')
    .insert({
      game_type: gameType as any,
      created_by: userId,
      player_x: userId,
      player_o: BOT_USER_ID,
      current_turn: userId,
      status: 'playing' as any,
      board: boardMap[gameType] || [],
      game_data: gameDataMap[gameType] || {},
    })
    .select()
    .single();

  return { data: data as unknown as Game | null, error };
}
