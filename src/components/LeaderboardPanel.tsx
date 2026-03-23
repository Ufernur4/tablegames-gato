import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, Medal, Crown, TrendingUp, Gamepad2, Coins } from 'lucide-react';

type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  games_won: number;
  games_played: number;
  coins: number;
  win_rate: number;
};

type SortBy = 'wins' | 'games' | 'coins' | 'winrate';

export function LeaderboardPanel({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('wins');

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name, games_won, games_played, coins')
        .gt('games_played', 0)
        .order('games_won', { ascending: false })
        .limit(50);

      if (data) {
        setEntries(
          data.map(p => ({
            ...p,
            display_name: p.display_name || 'Anonym',
            win_rate: p.games_played > 0 ? Math.round((p.games_won / p.games_played) * 100) : 0,
          }))
        );
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const sorted = [...entries].sort((a, b) => {
    if (sortBy === 'wins') return b.games_won - a.games_won;
    if (sortBy === 'games') return b.games_played - a.games_played;
    if (sortBy === 'coins') return b.coins - a.coins;
    return b.win_rate - a.win_rate;
  });

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="w-4 h-4 text-yellow-500" />;
    if (index === 1) return <Medal className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Medal className="w-4 h-4 text-amber-600" />;
    return <span className="w-4 text-center text-[10px] font-bold text-muted-foreground tabular-nums">{index + 1}</span>;
  };

  const sortOptions: { key: SortBy; label: string; icon: React.ReactNode }[] = [
    { key: 'wins', label: 'Siege', icon: <Trophy className="w-3 h-3" /> },
    { key: 'winrate', label: 'Quote', icon: <TrendingUp className="w-3 h-3" /> },
    { key: 'games', label: 'Spiele', icon: <Gamepad2 className="w-3 h-3" /> },
    { key: 'coins', label: 'Münzen', icon: <Coins className="w-3 h-3" /> },
  ];

  return (
    <div className="p-4 space-y-3 overflow-y-auto h-full">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary" /> Rangliste
      </h3>

      <div className="flex gap-1">
        {sortOptions.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              sortBy === key
                ? 'bg-primary/15 text-primary'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-xs">Laden…</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-xs">
          Noch keine Spieler mit abgeschlossenen Spielen.
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map((entry, i) => {
            const isMe = entry.user_id === userId;
            return (
              <div
                key={entry.user_id}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors ${
                  isMe
                    ? 'bg-primary/10 border border-primary/20'
                    : 'bg-card border border-border hover:border-border/80'
                } ${i < 3 ? 'shadow-sm' : ''}`}
              >
                <div className="flex items-center justify-center w-5 shrink-0">
                  {getRankIcon(i)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`font-medium truncate block ${isMe ? 'text-primary' : 'text-foreground'}`}>
                    {entry.display_name}
                    {isMe && <span className="text-[9px] ml-1 text-muted-foreground">(Du)</span>}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                  <span className="text-muted-foreground flex items-center gap-0.5">
                    <Trophy className="w-3 h-3" /> {entry.games_won}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-0.5">
                    <Gamepad2 className="w-3 h-3" /> {entry.games_played}
                  </span>
                  <span className={`font-medium ${entry.win_rate >= 60 ? 'text-green-500' : entry.win_rate >= 40 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {entry.win_rate}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
