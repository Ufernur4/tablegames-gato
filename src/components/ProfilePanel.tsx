import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, User, Trophy, Gamepad2, Loader2 } from 'lucide-react';

interface ProfilePanelProps {
  userId: string;
  onClose: () => void;
}

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
  games_played: number;
  games_won: number;
};

export function ProfilePanel({ userId, onClose }: ProfilePanelProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, games_played, games_won')
        .eq('user_id', userId)
        .single();

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || '');
      }
      setLoading(false);
    };
    fetchProfile();
  }, [userId]);

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    setMessage('');

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('user_id', userId);

    if (error) {
      setMessage('Fehler beim Speichern.');
    } else {
      setMessage('Profil gespeichert!');
      setTimeout(() => setMessage(''), 3000);
    }
    setSaving(false);
  };

  const winRate = profile && profile.games_played > 0
    ? Math.round((profile.games_won / profile.games_played) * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center">
          <User className="w-8 h-8 text-primary" />
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">
          {userId.slice(0, 12)}…
        </p>
      </div>

      {/* Edit name */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Anzeigename</label>
        <div className="flex gap-2">
          <Input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="bg-secondary border-border text-sm"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg bg-[hsl(var(--success)/0.15)] border border-[hsl(var(--success)/0.2)] p-2 text-[11px] text-[hsl(var(--success))]">
          {message}
        </div>
      )}

      {/* Stats */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Statistiken</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-secondary/60 p-3 text-center">
            <Gamepad2 className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground tabular-nums">{profile?.games_played ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Gespielt</p>
          </div>
          <div className="rounded-xl bg-secondary/60 p-3 text-center">
            <Trophy className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold text-foreground tabular-nums">{profile?.games_won ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Gewonnen</p>
          </div>
          <div className="rounded-xl bg-secondary/60 p-3 text-center">
            <div className="w-4 h-4 mx-auto mb-1 text-[10px] font-bold text-muted-foreground flex items-center justify-center">%</div>
            <p className="text-lg font-bold text-foreground tabular-nums">{winRate}</p>
            <p className="text-[10px] text-muted-foreground">Winrate</p>
          </div>
        </div>
      </div>

      <Button variant="secondary" className="w-full text-xs" onClick={onClose}>
        Schließen
      </Button>
    </div>
  );
}
