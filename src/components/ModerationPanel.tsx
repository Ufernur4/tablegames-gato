import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, UserX, UserCheck, Crown, AlertTriangle, Loader2 } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface ModerationPanelProps {
  userId: string;
}

interface RoleEntry {
  id: string;
  user_id: string;
  role: string;
  display_name?: string;
}

interface BanEntry {
  id: string;
  user_id: string;
  reason: string;
  active: boolean;
  expires_at: string | null;
  display_name?: string;
}

export function ModerationPanel({ userId }: ModerationPanelProps) {
  const [isStaff, setIsStaff] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [bans, setBans] = useState<BanEntry[]>([]);
  const [banTarget, setBanTarget] = useState('');
  const [banReason, setBanReason] = useState('');
  const [modTarget, setModTarget] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // Check user's permissions
  useEffect(() => {
    const check = async () => {
      const { data: staffData } = await supabase.rpc('is_staff', { _user_id: userId });
      const { data: devData } = await supabase.rpc('has_role', { _user_id: userId, _role: 'developer' });
      setIsStaff(!!staffData);
      setIsDev(!!devData);
      setLoading(false);
    };
    check();
  }, [userId]);

  // Load roles and bans
  useEffect(() => {
    if (!isStaff) return;

    const loadData = async () => {
      const { data: rolesData } = await supabase.from('user_roles').select('*');
      if (rolesData) {
        // Enrich with display names
        const userIds = [...new Set(rolesData.map(r => r.user_id))];
        const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
        const nameMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);
        setRoles(rolesData.map(r => ({ ...r, display_name: nameMap.get(r.user_id) || r.user_id.slice(0, 8) })));
      }

      const { data: bansData } = await supabase.from('banned_users').select('*').eq('active', true);
      if (bansData) {
        const userIds = [...new Set(bansData.map(b => b.user_id))];
        const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds.length ? userIds : ['none']);
        const nameMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);
        setBans(bansData.map(b => ({ ...b, display_name: nameMap.get(b.user_id) || b.user_id.slice(0, 8) })));
      }
    };
    loadData();
  }, [isStaff]);

  const claimDeveloper = async () => {
    setBusy(true); setError(''); setSuccess('');
    const { data, error: err } = await supabase.rpc('claim_developer_role');
    if (err) setError(err.message);
    else if (data) { setSuccess('Developer-Rolle beansprucht!'); setIsDev(true); setIsStaff(true); sounds.achievement(); }
    else setError('Developer-Rolle bereits vergeben.');
    setBusy(false);
  };

  const assignMod = async () => {
    if (!modTarget.trim()) return;
    setBusy(true); setError(''); setSuccess('');
    // Find user by display name
    const { data: profile } = await supabase.from('profiles').select('user_id').eq('display_name', modTarget.trim()).single();
    if (!profile) { setError('Spieler nicht gefunden.'); setBusy(false); return; }

    const { error: err } = await supabase.from('user_roles').insert({
      user_id: profile.user_id,
      role: 'moderator' as any,
      granted_by: userId,
    });
    if (err) setError(err.message);
    else { setSuccess(`${modTarget} ist jetzt Moderator!`); setModTarget(''); sounds.coinEarn(); }
    setBusy(false);
  };

  const banUser = async () => {
    if (!banTarget.trim() || !banReason.trim()) return;
    setBusy(true); setError(''); setSuccess('');
    const { data: profile } = await supabase.from('profiles').select('user_id').eq('display_name', banTarget.trim()).single();
    if (!profile) { setError('Spieler nicht gefunden.'); setBusy(false); return; }

    const { error: err } = await supabase.from('banned_users').insert({
      user_id: profile.user_id,
      banned_by: userId,
      reason: banReason,
    });
    if (err) setError(err.message);
    else { setSuccess(`${banTarget} wurde gesperrt.`); setBanTarget(''); setBanReason(''); sounds.click(); }
    setBusy(false);
  };

  const unbanUser = async (banId: string) => {
    setBusy(true);
    await supabase.from('banned_users').update({ active: false }).eq('id', banId);
    setBans(prev => prev.filter(b => b.id !== banId));
    setSuccess('Sperre aufgehoben.');
    setBusy(false);
  };

  const removeMod = async (roleId: string) => {
    setBusy(true);
    await supabase.from('user_roles').delete().eq('id', roleId);
    setRoles(prev => prev.filter(r => r.id !== roleId));
    setSuccess('Rolle entfernt.');
    setBusy(false);
  };

  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  // Non-staff: show claim developer button
  if (!isStaff) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-center space-y-2">
          <Shield className="w-8 h-8 mx-auto text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">Nur für Staff-Mitglieder</p>
          <Button size="sm" onClick={claimDeveloper} disabled={busy} className="gap-2 text-xs">
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            <Crown className="w-3 h-3" /> Developer-Rolle beanspruchen
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-primary">{success}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Moderation</h3>
        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{isDev ? 'Developer' : 'Staff'}</span>
      </div>

      {error && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-lg">{error}</div>}
      {success && <div className="text-xs text-primary bg-primary/10 p-2 rounded-lg">{success}</div>}

      {/* Assign Moderator */}
      {isDev && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1"><UserCheck className="w-3 h-3" /> Mod ernennen</h4>
          <div className="flex gap-2">
            <Input value={modTarget} onChange={e => setModTarget(e.target.value)} placeholder="Spielername…" className="text-xs h-8" />
            <Button size="sm" onClick={assignMod} disabled={busy} className="h-8 text-xs shrink-0">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ernennen'}
            </Button>
          </div>
        </div>
      )}

      {/* Ban User */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1"><UserX className="w-3 h-3" /> Spieler sperren</h4>
        <Input value={banTarget} onChange={e => setBanTarget(e.target.value)} placeholder="Spielername…" className="text-xs h-8" />
        <Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Grund…" className="text-xs h-8" />
        <Button size="sm" variant="destructive" onClick={banUser} disabled={busy} className="w-full h-8 text-xs gap-1">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <><AlertTriangle className="w-3 h-3" /> Sperren</>}
        </Button>
      </div>

      {/* Active Bans */}
      {bans.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">🚫 Aktive Sperren</h4>
          {bans.map(ban => (
            <div key={ban.id} className="flex items-center justify-between bg-destructive/5 border border-destructive/10 rounded-lg p-2">
              <div>
                <p className="text-xs font-medium text-foreground">{ban.display_name}</p>
                <p className="text-[10px] text-muted-foreground">{ban.reason}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => unbanUser(ban.id)} className="h-6 text-[10px] text-primary">
                Entsperren
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Roles Overview */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground">👥 Rollen</h4>
        {roles.map(role => (
          <div key={role.id} className="flex items-center justify-between bg-secondary/30 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                role.role === 'developer' ? 'bg-amber-500/20 text-amber-400' :
                role.role === 'admin' ? 'bg-red-500/20 text-red-400' :
                role.role === 'moderator' ? 'bg-blue-500/20 text-blue-400' :
                'bg-secondary text-muted-foreground'
              }`}>{role.role}</span>
              <span className="text-xs text-foreground">{role.display_name}</span>
            </div>
            {isDev && role.role === 'moderator' && (
              <Button size="sm" variant="ghost" onClick={() => removeMod(role.id)} className="h-6 text-[10px] text-destructive">
                Entfernen
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
