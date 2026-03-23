import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Manages online presence for the current user.
 * Upserts presence on mount and heartbeats every 30s.
 * Sets offline on unmount/tab close.
 */
export function usePresence(userId: string | undefined) {
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!userId) return;

    const setOnline = async () => {
      await supabase.from('online_presence').upsert({
        user_id: userId,
        is_online: true,
        last_seen: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    };

    const setOffline = async () => {
      await supabase.from('online_presence').upsert({
        user_id: userId,
        is_online: false,
        last_seen: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    };

    setOnline();
    intervalRef.current = setInterval(setOnline, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setOffline();
      } else {
        setOnline();
      }
    };

    const handleBeforeUnload = () => {
      // Use sendBeacon for reliability
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/online_presence?user_id=eq.${userId}`;
      const body = JSON.stringify({ is_online: false, last_seen: new Date().toISOString() });
      navigator.sendBeacon?.(url); // Best-effort
      setOffline();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setOffline();
    };
  }, [userId]);
}
