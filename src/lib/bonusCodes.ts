import { supabase } from '@/integrations/supabase/client';

// Hardcoded bonus codes (could be DB-driven later)
const BONUS_CODES: Record<string, { coins: number; description: string; maxUses: number }> = {
  'XPLAY100': { coins: 100, description: '100 Startmünzen!', maxUses: 999 },
  'WELCOME50': { coins: 50, description: 'Willkommensbonus!', maxUses: 999 },
  'BONUS200': { coins: 200, description: 'Mega-Bonus!', maxUses: 100 },
  'GEHEIM': { coins: 500, description: 'Geheimcode gefunden! 🎉', maxUses: 50 },
  'PARTY': { coins: 75, description: 'Party-Bonus! 🎊', maxUses: 999 },
};

export async function redeemBonusCode(userId: string, code: string): Promise<{ success: boolean; message: string; coins?: number }> {
  const upperCode = code.trim().toUpperCase();
  const bonus = BONUS_CODES[upperCode];
  
  if (!bonus) {
    return { success: false, message: 'Ungültiger Bonuscode.' };
  }

  // Check if already redeemed
  const { data: existing } = await supabase
    .from('coin_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', `Bonuscode: ${upperCode}`);

  if (existing && existing.length > 0) {
    return { success: false, message: 'Code bereits eingelöst!' };
  }

  // Award coins
  const { data: profile } = await supabase
    .from('profiles')
    .select('coins')
    .eq('user_id', userId)
    .single();

  if (!profile) return { success: false, message: 'Profil nicht gefunden.' };

  await supabase.from('profiles').update({ coins: profile.coins + bonus.coins }).eq('user_id', userId);
  await supabase.from('coin_transactions').insert({
    user_id: userId,
    amount: bonus.coins,
    reason: `Bonuscode: ${upperCode}`,
  });

  return { success: true, message: bonus.description, coins: bonus.coins };
}
