import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Coins, ShoppingBag, Gift, Sparkles, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShopPanelProps {
  userId: string;
}

type ShopItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_emoji: string | null;
};

export function ShopPanel({ userId }: ShopPanelProps) {
  const [coins, setCoins] = useState(0);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [purchased, setPurchased] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'cosmetic' | 'badge' | 'effect' | 'boost'>('all');

  const fetchData = async () => {
    const [{ data: profile }, { data: shopItems }, { data: purchases }] = await Promise.all([
      supabase.from('profiles').select('coins').eq('user_id', userId).single(),
      supabase.from('shop_items').select('*').eq('is_active', true),
      supabase.from('user_purchases').select('item_id').eq('user_id', userId),
    ]);

    setCoins(profile?.coins ?? 0);
    setItems((shopItems || []) as ShopItem[]);
    setPurchased(purchases?.map(p => p.item_id) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [userId]);

  const handleBuy = async (item: ShopItem) => {
    if (coins < item.price) {
      setMessage('Nicht genug Münzen!');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setBuying(item.id);
    setMessage('');

    // Deduct coins
    const { error: coinErr } = await supabase
      .from('profiles')
      .update({ coins: coins - item.price })
      .eq('user_id', userId);

    if (coinErr) {
      setMessage('Fehler beim Kauf.');
      setBuying(null);
      return;
    }

    // Record purchase
    await supabase.from('user_purchases').insert({
      user_id: userId,
      item_id: item.id,
    });

    // Log transaction
    await supabase.from('coin_transactions').insert({
      user_id: userId,
      amount: -item.price,
      reason: `Kauf: ${item.name}`,
    });

    setCoins(prev => prev - item.price);
    setPurchased(prev => [...prev, item.id]);
    setBuying(null);
    setMessage(`${item.name} gekauft! ✨`);
    setTimeout(() => setMessage(''), 3000);
  };

  const filteredItems = items.filter(i => filter === 'all' || i.category === filter);

  const categoryLabels: Record<string, string> = {
    all: 'Alle',
    cosmetic: '🎨 Kosmetik',
    badge: '⭐ Abzeichen',
    effect: '✨ Effekte',
    boost: '🚀 Boosts',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Coins header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <ShoppingBag className="w-3.5 h-3.5" /> Shop
        </h3>
        <div className="flex items-center gap-1 bg-primary/15 rounded-full px-2.5 py-1">
          <Coins className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold text-primary tabular-nums">{coins}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-border">
        {Object.entries(categoryLabels).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
              filter === key ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div className={`mx-3 mt-2 rounded-lg p-2 text-[11px] ${
          message.includes('Nicht') || message.includes('Fehler')
            ? 'bg-destructive/10 text-destructive'
            : 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
        }`}>
          {message}
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin min-h-0">
        {filteredItems.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Keine Items verfügbar.</p>
        ) : (
          filteredItems.map(item => {
            const owned = purchased.includes(item.id);
            return (
              <div
                key={item.id}
                className={`rounded-xl p-3 transition-all ${
                  owned ? 'bg-secondary/30 border border-[hsl(var(--success)/0.2)]' : 'bg-secondary/50 border border-transparent hover:border-primary/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background/50 flex items-center justify-center text-xl shrink-0">
                    {item.image_emoji || '🎁'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">{item.name}</span>
                      {owned ? (
                        <span className="text-[10px] text-[hsl(var(--success))] flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Gekauft
                        </span>
                      ) : (
                        <button
                          onClick={() => handleBuy(item)}
                          disabled={buying === item.id || coins < item.price}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all active:scale-95
                            ${coins >= item.price
                              ? 'bg-primary/15 text-primary hover:bg-primary/25'
                              : 'bg-secondary text-muted-foreground/50'}
                          `}
                        >
                          {buying === item.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Coins className="w-3 h-3" />
                              {item.price}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.description}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground text-center">
          <Gift className="w-3 h-3 inline mr-0.5" />
          Gewinne Spiele um Münzen zu verdienen!
        </p>
      </div>
    </div>
  );
}
