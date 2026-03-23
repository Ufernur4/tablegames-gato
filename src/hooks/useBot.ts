import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import {
  tttBotMove,
  connectFourBotMove,
  checkersBotMove,
  dartsBotThrow,
  battleshipBotAttack,
} from '@/lib/botAI';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

const BOT_USER_ID = '00000000-0000-0000-0000-000000000000';
const BOT_MOVE_DELAY = 800; // ms

/**
 * Hook that manages bot behavior for a game.
 * When it's the bot's turn, it calculates and executes a move after a short delay.
 */
export function useBot(game: Game | null, userId: string, difficulty: BotDifficulty) {
  const [isBotGame, setIsBotGame] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const isBot = game?.player_o === BOT_USER_ID;

  useEffect(() => {
    if (!game || !isBot) return;
    setIsBotGame(true);

    // Check if it's bot's turn
    if (game.current_turn !== BOT_USER_ID || game.status !== 'playing' || game.winner) return;
    const gameType = game.game_type as string;

    // Execute bot move after delay
    timeoutRef.current = setTimeout(async () => {
      const board = Array.isArray(game.board) ? [...(game.board as string[])] : [];
      const gameData = (game.game_data || {}) as Record<string, any>;

      switch (gameType) {
        case 'tic-tac-toe': {
          const move = tttBotMove([...board], difficulty);
          if (move === -1) return;
          const newBoard = [...board];
          newBoard[move] = 'O';

          // Check winner
          const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
          let winner: string | null = null;
          for (const [a, b, c] of WIN_LINES) {
            if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) {
              winner = newBoard[a]; break;
            }
          }
          const isDraw = !winner && newBoard.every(c => c !== '');

          const update: Record<string, unknown> = {
            board: newBoard,
            current_turn: game.player_x,
          };
          if (winner) { update.winner = BOT_USER_ID; update.status = 'finished'; }
          else if (isDraw) { update.is_draw = true; update.status = 'finished'; }

          await supabase.from('games').update(update).eq('id', game.id);
          break;
        }

        case 'connect-four': {
          const col = connectFourBotMove([...board], difficulty);
          if (col === -1) return;
          const newBoard = [...board];
          // Find lowest row
          for (let r = 5; r >= 0; r--) {
            if (!newBoard[r * 7 + col]) {
              newBoard[r * 7 + col] = 'O';
              break;
            }
          }

          // Check winner (simplified)
          const dirs = [[0,1],[1,0],[1,1],[1,-1]];
          let winner: string | null = null;
          for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 7; c++) {
              const v = newBoard[r * 7 + c];
              if (!v) continue;
              for (const [dr, dc] of dirs) {
                let cnt = 1;
                for (let i = 1; i < 4; i++) {
                  const nr = r + dr * i, nc = c + dc * i;
                  if (nr < 0 || nr >= 6 || nc < 0 || nc >= 7) break;
                  if (newBoard[nr * 7 + nc] === v) cnt++; else break;
                }
                if (cnt >= 4) { winner = v; break; }
              }
              if (winner) break;
            }
            if (winner) break;
          }
          const isDraw = !winner && newBoard.every(c => c !== '');

          const update: Record<string, unknown> = {
            board: newBoard,
            current_turn: game.player_x,
          };
          if (winner) { update.winner = BOT_USER_ID; update.status = 'finished'; }
          else if (isDraw) { update.is_draw = true; update.status = 'finished'; }

          await supabase.from('games').update(update).eq('id', game.id);
          break;
        }

        case 'checkers': {
          const move = checkersBotMove([...board], difficulty);
          if (!move) return;
          const newBoard = [...board];
          newBoard[move.to] = newBoard[move.from];
          newBoard[move.from] = '';
          if (move.captured !== undefined) newBoard[move.captured] = '';

          // King promotion
          const toRow = Math.floor(move.to / 8);
          if (newBoard[move.to] === 'b' && toRow === 0) newBoard[move.to] = 'B';

          // Check if player has pieces left
          const playerPieces = newBoard.filter(p => p === 'r' || p === 'R').length;

          const update: Record<string, unknown> = {
            board: newBoard,
            current_turn: game.player_x,
          };
          if (playerPieces === 0) { update.winner = BOT_USER_ID; update.status = 'finished'; }

          await supabase.from('games').update(update).eq('id', game.id);
          break;
        }

        case 'darts': {
          const botScore = gameData.player_o_score ?? 301;
          const points = dartsBotThrow(botScore, difficulty);
          const newScore = botScore - points;

          const newGameData = {
            ...gameData,
            player_o_score: Math.max(0, newScore),
            current_round: (gameData.current_round || 1) + 1,
          };

          const update: Record<string, unknown> = {
            game_data: newGameData,
            current_turn: game.player_x,
          };

          if (newScore <= 0) {
            update.winner = BOT_USER_ID;
            update.status = 'finished';
          }

          await supabase.from('games').update(update).eq('id', game.id);
          break;
        }

        case 'battleship': {
          const botAttacks: number[] = gameData.attacks_o || [];
          const playerGrid: number[] = gameData.grid_x || [];
          const attack = battleshipBotAttack(botAttacks);
          if (attack === -1) return;

          const newAttacks = [...botAttacks, attack];
          const newGameData = { ...gameData, attacks_o: newAttacks };

          // Check if all player ships sunk
          const playerShipCells = playerGrid.reduce((acc: number[], v, i) => v === 1 ? [...acc, i] : acc, []);
          const totalHits = newAttacks.filter(a => playerGrid[a] === 1).length;

          const update: Record<string, unknown> = {
            game_data: newGameData,
            current_turn: game.player_x,
          };

          if (totalHits >= playerShipCells.length && playerShipCells.length > 0) {
            update.winner = BOT_USER_ID;
            update.status = 'finished';
            (newGameData as any).phase = 'finished';
            update.game_data = newGameData;
          }

          await supabase.from('games').update(update).eq('id', game.id);
          break;
        }
      }
    }, BOT_MOVE_DELAY);

    return () => { clearTimeout(timeoutRef.current); };
  }, [game?.current_turn, game?.status, game?.id, isBot, difficulty]);

  return { isBotGame, BOT_USER_ID };
}

/**
 * Creates a game with a bot as player_o.
 */
export async function createBotGame(
  userId: string,
  gameType: Game['game_type'],
  difficulty: BotDifficulty
) {
  const boardMap: Record<string, any> = {
    'tic-tac-toe': ['','','','','','','','',''],
    'connect-four': Array(42).fill(''),
    'checkers': (() => {
      const b = Array(64).fill('');
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 8; c++)
          if ((r + c) % 2 === 1) b[r * 8 + c] = 'r';
      for (let r = 5; r < 8; r++)
        for (let c = 0; c < 8; c++)
          if ((r + c) % 2 === 1) b[r * 8 + c] = 'b';
      return b;
    })(),
    'darts': [],
    'battleship': [],
  };

  const gameDataMap: Record<string, any> = {
    'tic-tac-toe': { bot_difficulty: difficulty },
    'connect-four': { bot_difficulty: difficulty },
    'checkers': { bot_difficulty: difficulty },
    'darts': { player_x_score: 301, player_o_score: 301, current_round: 1, bot_difficulty: difficulty },
    'battleship': { phase: 'placing', bot_difficulty: difficulty },
  };

  const { data, error } = await supabase
    .from('games')
    .insert({
      game_type: gameType,
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
