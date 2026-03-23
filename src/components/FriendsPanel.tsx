import { useState } from 'react';
import { useFriends } from '@/hooks/useFriends';
import { useGameInvitations } from '@/hooks/useGameInvitations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  UserPlus,
  Check,
  X,
  Trash2,
  Gamepad2,
  Loader2,
  Bell,
  Users,
  Send,
} from 'lucide-react';
import type { Game } from '@/hooks/useGames';

interface FriendsPanelProps {
  userId: string;
  activeGameId?: string;
  onJoinGame?: (game: Game) => void;
}

export function FriendsPanel({ userId, activeGameId, onJoinGame }: FriendsPanelProps) {
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    loading,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
    inviteToGame,
  } = useFriends(userId);

  const { invitations, acceptInvitation, declineInvitation } = useGameInvitations(userId);
  const [searchName, setSearchName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState<'friends' | 'requests' | 'invites'>('friends');

  const handleSendRequest = async () => {
    if (!searchName.trim()) return;
    setError('');
    setSuccess('');
    const result = await sendRequest(searchName);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess('Anfrage gesendet!');
      setSearchName('');
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleInvite = async (friendId: string) => {
    if (!activeGameId) return;
    const result = await inviteToGame(friendId, activeGameId);
    if (result.error) setError(result.error);
  };

  const handleAcceptInvitation = async (inv: typeof invitations[0]) => {
    await acceptInvitation(inv.id);
    // Join the game
    if (onJoinGame) {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data } = await supabase.from('games').select('*').eq('id', inv.game_id).single();
      if (data) {
        // Join as player_o
        await supabase.from('games').update({
          player_o: userId,
          status: 'playing' as any,
        }).eq('id', inv.game_id);
        onJoinGame(data as unknown as Game);
      }
    }
  };

  const requestCount = incomingRequests.length;
  const inviteCount = invitations.length;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('friends')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            tab === 'friends' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-3.5 h-3.5 inline mr-1" />
          Freunde ({friends.length})
        </button>
        <button
          onClick={() => setTab('requests')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
            tab === 'requests' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5 inline mr-1" />
          Anfragen
          {requestCount > 0 && (
            <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
              {requestCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('invites')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
            tab === 'invites' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bell className="w-3.5 h-3.5 inline mr-1" />
          Einlad.
          {inviteCount > 0 && (
            <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
              {inviteCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin min-h-0">
        {/* Friends tab */}
        {tab === 'friends' && (
          <>
            {/* Add friend */}
            <div className="flex gap-1.5 mb-3">
              <Input
                value={searchName}
                onChange={e => setSearchName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendRequest()}
                placeholder="Spielername…"
                className="bg-secondary border-border text-xs h-8"
              />
              <Button size="sm" onClick={handleSendRequest} className="h-8 w-8 p-0 shrink-0">
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2 text-[11px] text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg bg-[hsl(var(--success)/0.15)] border border-[hsl(var(--success)/0.2)] p-2 text-[11px] text-[hsl(var(--success))]">
                {success}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : friends.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Noch keine Freunde. Sende eine Anfrage!
              </p>
            ) : (
              friends.map(friend => (
                <div
                  key={friend.user_id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      friend.is_online ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'
                    }`} />
                    <span className="text-xs font-medium text-foreground truncate">
                      {friend.display_name}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {activeGameId && (
                      <button
                        onClick={() => handleInvite(friend.user_id)}
                        className="w-6 h-6 rounded-md bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
                        title="Zum Spiel einladen"
                      >
                        <Gamepad2 className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={() => removeFriend(friend.user_id)}
                      className="w-6 h-6 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition-colors"
                      title="Entfernen"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Requests tab */}
        {tab === 'requests' && (
          <>
            {incomingRequests.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Eingehend</p>
                {incomingRequests.map(req => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2"
                  >
                    <span className="text-xs font-medium text-foreground truncate">
                      {req.display_name}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => acceptRequest(req.id, req.from_user_id)}
                        className="w-6 h-6 rounded-md bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.25)] flex items-center justify-center transition-colors"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => rejectRequest(req.id)}
                        className="w-6 h-6 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {outgoingRequests.length > 0 && (
              <div className="space-y-1.5 mt-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gesendet</p>
                {outgoingRequests.map(req => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2"
                  >
                    <span className="text-xs text-muted-foreground truncate">
                      An: {req.to_user_id.slice(0, 8)}…
                    </span>
                    <span className="text-[10px] text-muted-foreground">Wartend</span>
                  </div>
                ))}
              </div>
            )}

            {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Keine offenen Anfragen.
              </p>
            )}
          </>
        )}

        {/* Invitations tab */}
        {tab === 'invites' && (
          <>
            {invitations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Keine Einladungen.
              </p>
            ) : (
              invitations.map(inv => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-foreground block truncate">
                      {inv.from_display_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {inv.game_type === 'tic-tac-toe' ? 'Tic-Tac-Toe' : inv.game_type === 'darts' ? 'Darts' : inv.game_type}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleAcceptInvitation(inv)}
                      className="w-6 h-6 rounded-md bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.25)] flex items-center justify-center transition-colors"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => declineInvitation(inv.id)}
                      className="w-6 h-6 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
