import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Loader2, Lock } from 'lucide-react';

interface AchievementsPanelProps {
  userId: string;
}

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

type UserAchievement = {
  achievement_id: string;
  unlocked_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  wins: '🏆 Siege',
  games: '🎮 Spiele',
  coins: '💰 Münzen',
  social: '👥 Social',
  streak: '🔥 Serien',
  special: '✨ Spezial',
  shop: '🛒 Shop',
  daily: '📅 Täglich',
};

export function AchievementsPanel({ userId }: AchievementsPanelProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [unlockedDates, setUnlockedDates] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ games_played: number; games_won: number; coins: number } | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const [{ data: all }, { data: ua }, { data: p }] = await Promise.all([
        supabase.from('achievements').select('*'),
        supabase.from('user_achievements').select('achievement_id, unlocked_at').eq('user_id', userId),
        supabase.from('profiles').select('games_played, games_won, coins').eq('user_id', userId).single(),
      ]);
      setAchievements((all || []) as Achievement[]);
      const uSet = new Set((ua || []).map((u: UserAchievement) => u.achievement_id));
      setUnlocked(uSet);
      const dMap = new Map((ua || []).map((u: UserAchievement) => [u.achievement_id, u.unlocked_at]));
      setUnlockedDates(dMap);
      setProfile(p);
      setLoading(false);
    };
    fetch();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const unlockedCount = unlocked.size;
  const totalCount = achievements.length;
  const progress = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  // Group by category
  const grouped = achievements.reduce<Record<string, Achievement[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a);
    return acc;
  }, {});

  // Get progress value for an achievement
  const getProgress = (a: Achievement): number => {
    if (unlocked.has(a.id)) return 100;
    if (!profile) return 0;
    let current = 0;
    switch (a.key) {
      case 'first_win': case 'wins_5': case 'wins_25': case 'wins_100':
        current = profile.games_won; break;
      case 'games_10': case 'games_50': case 'games_200':
        current = profile.games_played; break;
      case 'coins_500': case 'coins_2000':
        current = profile.coins; break;
      default: current = 0;
    }
    return Math.min(100, Math.round((current / a.threshold) * 100));
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Overview */}
      <div className="text-center space-y-2">
        <p className="text-2xl font-bold text-foreground tabular-nums">{unlockedCount}/{totalCount}</p>
        <p className="text-[10px] text-muted-foreground">Achievements freigeschaltet</p>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Categories */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{CATEGORY_LABELS[cat] || cat}</p>
          <div className="space-y-1">
            {items.map(a => {
              const isUnlocked = unlocked.has(a.id);
              const prog = getProgress(a);
              const date = unlockedDates.get(a.id);
              return (
                <div
                  key={a.id}
                  className={`rounded-xl p-2.5 flex items-start gap-2.5 transition-all ${
                    isUnlocked
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-secondary/40 border border-border opacity-70'
                  }`}
                >
                  <span className="text-xl leading-none mt-0.5">{isUnlocked ? a.emoji : '🔒'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-semibold ${isUnlocked ? 'text-foreground' : 'text-muted-foreground'}`}>{a.title}</p>
                      {a.coin_reward > 0 && (
                        <span className={`text-[10px] tabular-nums ${isUnlocked ? 'text-primary' : 'text-muted-foreground'}`}>+{a.coin_reward} 🪙</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{a.description}</p>
                    {!isUnlocked && prog > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={prog} className="h-1 flex-1" />
                        <span className="text-[9px] text-muted-foreground tabular-nums">{prog}%</span>
                      </div>
                    )}
                    {isUnlocked && date && (
                      <p className="text-[9px] text-primary/60 mt-0.5">
                        ✓ {new Date(date).toLocaleDateString('de-DE')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
