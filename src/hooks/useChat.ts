import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ChatMessage = {
  id: string;
  user_id: string;
  game_id: string | null;
  message: string;
  is_lobby: boolean;
  created_at: string;
  display_name?: string;
};

export function useChat(gameId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isLobby = !gameId;

    const fetchMessages = async () => {
      let query = supabase.from('chat_messages').select('*');
      if (isLobby) {
        query = query.eq('is_lobby', true);
      } else {
        query = query.eq('game_id', gameId);
      }
      const { data } = await query;
      if (data) {
        const sorted = [...data].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        // Fetch display names
        const userIds = [...new Set(sorted.map(m => m.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds);
        
        const nameMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);
        
        setMessages(sorted.map(m => ({
          ...m,
          is_lobby: m.is_lobby ?? true,
          display_name: nameMap.get(m.user_id) || 'Player_' + m.user_id.slice(0, 6),
        })));
      }
    };
    fetchMessages();

    const filter = isLobby 
      ? 'is_lobby=eq.true'
      : `game_id=eq.${gameId}`;

    const channel = supabase
      .channel(`chat-${gameId || 'lobby'}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter,
      }, async (payload) => {
        const msg = payload.new as any;
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', msg.user_id)
          .single();
        
        setMessages(prev => [...prev, {
          ...msg,
          is_lobby: msg.is_lobby ?? true,
          display_name: profile?.display_name || 'Player_' + msg.user_id.slice(0, 6),
        }]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (userId: string, text: string) => {
    if (!text.trim()) return;
    const { error } = await supabase.from('chat_messages').insert({
      user_id: userId,
      message: text.trim(),
      is_lobby: !gameId,
      game_id: gameId || null,
    });
    return { error };
  };

  return { messages, sendMessage, bottomRef };
}
