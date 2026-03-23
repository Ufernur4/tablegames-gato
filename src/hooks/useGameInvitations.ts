import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type GameInvitation = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  game_id: string;
  status: string;
  created_at: string;
  from_display_name?: string;
  game_type?: string;
};

export function useGameInvitations(userId: string) {
  const [invitations, setInvitations] = useState<GameInvitation[]>([]);

  const fetchInvitations = async () => {
    const { data } = await supabase
      .from('game_invitations')
      .select('*')
      .eq('to_user_id', userId)
      .eq('status', 'pending');

    if (data && data.length > 0) {
      // Fetch sender names
      const fromIds = [...new Set(data.map(i => i.from_user_id))];
      const gameIds = [...new Set(data.map(i => i.game_id))];

      const [{ data: profiles }, { data: games }] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name').in('user_id', fromIds),
        supabase.from('games').select('id, game_type').in('id', gameIds),
      ]);

      const nameMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);
      const gameMap = new Map(games?.map(g => [g.id, g.game_type]) || []);

      setInvitations(data.map(i => ({
        ...i,
        from_display_name: nameMap.get(i.from_user_id) || 'Player_' + i.from_user_id.slice(0, 6),
        game_type: gameMap.get(i.game_id) || 'unknown',
      })));
    } else {
      setInvitations([]);
    }
  };

  useEffect(() => {
    fetchInvitations();

    const channel = supabase
      .channel('invitations-' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_invitations',
      }, () => {
        fetchInvitations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const acceptInvitation = async (invitationId: string) => {
    await supabase.from('game_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitationId);
  };

  const declineInvitation = async (invitationId: string) => {
    await supabase.from('game_invitations')
      .update({ status: 'declined' })
      .eq('id', invitationId);
  };

  return { invitations, acceptInvitation, declineInvitation };
}
