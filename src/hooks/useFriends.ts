import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FriendRequest = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
  display_name?: string;
};

export type Friend = {
  user_id: string;
  display_name: string;
  is_online: boolean;
  last_seen: string | null;
};

export function useFriends(userId: string) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFriends = async () => {
    // Get friendships where user is either side
    const { data: friendships } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (!friendships || friendships.length === 0) {
      setFriends([]);
      setLoading(false);
      return;
    }

    // Get friend user IDs
    const friendIds = friendships.map(f =>
      f.user_id === userId ? f.friend_id : f.user_id
    );

    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', friendIds);

    // Fetch presence
    const { data: presence } = await supabase
      .from('online_presence')
      .select('user_id, is_online, last_seen')
      .in('user_id', friendIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);
    const presenceMap = new Map(presence?.map(p => [p.user_id, p]) || []);

    setFriends(friendIds.map(fid => ({
      user_id: fid,
      display_name: profileMap.get(fid) || 'Player_' + fid.slice(0, 6),
      is_online: presenceMap.get(fid)?.is_online ?? false,
      last_seen: presenceMap.get(fid)?.last_seen ?? null,
    })));
    setLoading(false);
  };

  const fetchRequests = async () => {
    // Incoming
    const { data: incoming } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('to_user_id', userId)
      .eq('status', 'pending');

    if (incoming && incoming.length > 0) {
      const fromIds = incoming.map(r => r.from_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', fromIds);
      const nameMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

      setIncomingRequests(incoming.map(r => ({
        ...r,
        display_name: nameMap.get(r.from_user_id) || 'Player_' + r.from_user_id.slice(0, 6),
      })));
    } else {
      setIncomingRequests([]);
    }

    // Outgoing
    const { data: outgoing } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('from_user_id', userId)
      .eq('status', 'pending');

    setOutgoingRequests(outgoing || []);
  };

  useEffect(() => {
    fetchFriends();
    fetchRequests();

    // Realtime for friend requests
    const reqChannel = supabase
      .channel('friend-requests-' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'friend_requests',
      }, () => {
        fetchRequests();
      })
      .subscribe();

    // Realtime for friendships
    const friendChannel = supabase
      .channel('friendships-' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'friendships',
      }, () => {
        fetchFriends();
      })
      .subscribe();

    // Realtime for presence
    const presenceChannel = supabase
      .channel('presence-' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'online_presence',
      }, () => {
        fetchFriends();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(reqChannel);
      supabase.removeChannel(friendChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [userId]);

  const sendRequest = async (targetDisplayName: string) => {
    // Look up user by display name
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .ilike('display_name', targetDisplayName.trim());

    if (!profiles || profiles.length === 0) {
      return { error: 'Benutzer nicht gefunden.' };
    }

    const target = profiles[0];
    if (target.user_id === userId) {
      return { error: 'Du kannst dir nicht selbst eine Anfrage senden.' };
    }

    // Check if already friends
    const alreadyFriend = friends.some(f => f.user_id === target.user_id);
    if (alreadyFriend) {
      return { error: 'Ihr seid bereits befreundet.' };
    }

    // Check for existing request
    const existingOut = outgoingRequests.some(r => r.to_user_id === target.user_id);
    if (existingOut) {
      return { error: 'Anfrage bereits gesendet.' };
    }

    const { error } = await supabase.from('friend_requests').insert({
      from_user_id: userId,
      to_user_id: target.user_id,
    });

    if (error) return { error: error.message };
    return { error: null };
  };

  const acceptRequest = async (requestId: string, fromUserId: string) => {
    // Update request status
    await supabase.from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    // Create bidirectional friendship
    await supabase.from('friendships').insert([
      { user_id: userId, friend_id: fromUserId },
      { user_id: fromUserId, friend_id: userId },
    ]);
  };

  const rejectRequest = async (requestId: string) => {
    await supabase.from('friend_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId);
  };

  const removeFriend = async (friendId: string) => {
    await supabase.from('friendships')
      .delete()
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);
  };

  const inviteToGame = async (friendId: string, gameId: string) => {
    const { error } = await supabase.from('game_invitations').insert({
      from_user_id: userId,
      to_user_id: friendId,
      game_id: gameId,
    });
    return { error: error?.message || null };
  };

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    loading,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
    inviteToGame,
    refresh: () => { fetchFriends(); fetchRequests(); },
  };
}
