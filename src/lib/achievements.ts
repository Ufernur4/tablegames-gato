import { supabase } from '@/integrations/supabase/client';

type Achievement = {
  id: string;
  key: string;
  title: string;
  description: string;
  emoji: string;
  category: string;
  threshold: number;
  coin_reward: number;
};

/**
 * Check and unlock achievements for a user based on current stats.
 * Returns newly unlocked achievement titles (for toast notifications).
 */
export async function checkAchievements(userId: string): Promise<string[]> {
  // Fetch all achievements and user's unlocked ones in parallel
  const [{ data: allAchievements }, { data: unlocked }, { data: profile }, { data: friendships }, { data: purchases }, { data: dailyLogins }, { data: userGames }] = await Promise.all([
    supabase.from('achievements').select('*'),
    supabase.from('user_achievements').select('achievement_id').eq('user_id', userId),
    supabase.from('profiles').select('games_played, games_won, coins').eq('user_id', userId).single(),
    supabase.from('friendships').select('id').eq('user_id', userId),
    supabase.from('user_purchases').select('id').eq('user_id', userId),
    supabase.from('coin_transactions').select('created_at').eq('user_id', userId).eq('reason', 'Täglicher Login-Bonus'),
    supabase.from('games').select('game_type, winner, created_at').or(`player_x.eq.${userId},player_o.eq.${userId}`).eq('status', 'finished'),
  ]);

  if (!allAchievements || !profile) return [];

  const unlockedIds = new Set((unlocked || []).map(u => u.achievement_id));
  const locked = allAchievements.filter(a => !unlockedIds.has(a.id)) as Achievement[];
  if (locked.length === 0) return [];

  const gamesPlayed = profile.games_played ?? 0;
  const gamesWon = profile.games_won ?? 0;
  const coins = profile.coins ?? 0;
  const friendCount = friendships?.length ?? 0;
  const purchaseCount = purchases?.length ?? 0;
  const uniqueDays = new Set((dailyLogins || []).map(d => d.created_at.split('T')[0])).size;

  // Count unique game types played
  const uniqueGameTypes = new Set((userGames || []).map(g => g.game_type)).size;

  // Count chess wins
  const chessWins = (userGames || []).filter(g => g.game_type === 'chess' && g.winner === userId).length;

  // Win streak (simple: count consecutive wins from recent games)
  let streak = 0;
  const sorted = (userGames || []).sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const g of sorted) {
    if (g.winner === userId) streak++;
    else break;
  }

  const newlyUnlocked: string[] = [];

  for (const a of locked) {
    let met = false;
    switch (a.key) {
      case 'first_win': met = gamesWon >= 1; break;
      case 'wins_5': met = gamesWon >= 5; break;
      case 'wins_25': met = gamesWon >= 25; break;
      case 'wins_100': met = gamesWon >= 100; break;
      case 'games_10': met = gamesPlayed >= 10; break;
      case 'games_50': met = gamesPlayed >= 50; break;
      case 'games_200': met = gamesPlayed >= 200; break;
      case 'coins_500': met = coins >= 500; break;
      case 'coins_2000': met = coins >= 2000; break;
      case 'friends_3': met = friendCount >= 3; break;
      case 'friends_10': met = friendCount >= 10; break;
      case 'streak_3': met = streak >= 3; break;
      case 'all_games': met = uniqueGameTypes >= 14; break;
      case 'first_purchase': met = purchaseCount >= 1; break;
      case 'daily_7': met = uniqueDays >= 7; break;
      case 'chess_master': met = chessWins >= 10; break;
      // speed_win and trivia_genius are checked contextually elsewhere
      default: break;
    }

    if (met) {
      const { error } = await supabase.from('user_achievements').insert({
        user_id: userId,
        achievement_id: a.id,
      });
      if (!error) {
        newlyUnlocked.push(`${a.emoji} ${a.title}`);
        // Award coin reward
        if (a.coin_reward > 0) {
          const { data: p } = await supabase.from('profiles').select('coins').eq('user_id', userId).single();
          if (p) {
            await supabase.from('profiles').update({ coins: (p.coins ?? 0) + a.coin_reward }).eq('user_id', userId);
            await supabase.from('coin_transactions').insert({
              user_id: userId,
              amount: a.coin_reward,
              reason: `Achievement: ${a.title}`,
            });
          }
        }
      }
    }
  }

  return newlyUnlocked;
}
