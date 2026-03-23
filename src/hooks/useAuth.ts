import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string>('');

  useEffect(() => {
    let resolved = false;
    const resolve = () => { if (!resolved) { resolved = true; setLoading(false); } };

    // Timeout fallback - stop loading after 3 seconds no matter what
    const timeout = setTimeout(resolve, 3000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const { data } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', session.user.id)
            .single();
          setDisplayName(data?.display_name || 'Player_' + session.user.id.slice(0, 6));
        }
        resolve();
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', session.user.id)
          .single()
          .then(({ data }) => {
            setDisplayName(data?.display_name || 'Player_' + session.user.id.slice(0, 6));
          });
      }
      resolve();
    }).catch(() => resolve());

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, loading, displayName, signUp, signIn, signOut };
}
