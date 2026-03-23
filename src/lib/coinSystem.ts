import { supabase } from '@/integrations/supabase/client';

const COIN_REWARDS = {
  win: 25,
  draw: 10,
  loss: 5,
  daily_login: 10,
};

/**
 * Award coins to a user for a game result.
 */
export async function awardCoins(userId: string, result: 'win' | 'draw' | 'loss') {
  const amount = COIN_REWARDS[result];

  // Update profile coins
  const { data: profile } = await supabase
    .from('profiles')
    .select('coins')
    .eq('user_id', userId)
    .single();

  if (profile) {
    await supabase
      .from('profiles')
      .update({ coins: (profile.coins ?? 0) + amount })
      .eq('user_id', userId);

    // Log transaction
    await supabase.from('coin_transactions').insert({
      user_id: userId,
      amount,
      reason: result === 'win' ? 'Spiel gewonnen' : result === 'draw' ? 'Unentschieden' : 'Spiel verloren',
    });
  }

  return amount;
}

/**
 * Award daily login bonus if not already claimed today.
 */
export async function awardDailyLogin(userId: string) {
  const today = new Date().toISOString().split('T')[0];

  // Check if already claimed today
  const { data: existing } = await supabase
    .from('coin_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', 'Täglicher Login-Bonus')
    .gte('created_at', today + 'T00:00:00Z');

  if (existing && existing.length > 0) return 0;

  const amount = COIN_REWARDS.daily_login;

  const { data: profile } = await supabase
    .from('profiles')
    .select('coins')
    .eq('user_id', userId)
    .single();

  if (profile) {
    await supabase
      .from('profiles')
      .update({ coins: (profile.coins ?? 0) + amount })
      .eq('user_id', userId);

    await supabase.from('coin_transactions').insert({
      user_id: userId,
      amount,
      reason: 'Täglicher Login-Bonus',
    });
  }

  return amount;
}

/**
 * Update game stats in profile after a game finishes.
 */
export async function updateGameStats(userId: string, won: boolean) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('games_played, games_won')
    .eq('user_id', userId)
    .single();

  if (profile) {
    await supabase
      .from('profiles')
      .update({
        games_played: (profile.games_played ?? 0) + 1,
        games_won: won ? (profile.games_won ?? 0) + 1 : (profile.games_won ?? 0),
      })
      .eq('user_id', userId);
  }
}
