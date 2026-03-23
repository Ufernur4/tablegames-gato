import { useState } from 'react';
import { redeemBonusCode } from '@/lib/bonusCodes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Gift, Loader2, Sparkles } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface BonusCodePanelProps {
  userId: string;
}

export function BonusCodePanel({ userId }: BonusCodePanelProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; coins?: number } | null>(null);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    const res = await redeemBonusCode(userId, code);
    setResult(res);
    if (res.success) {
      sounds.bonus();
      setCode('');
    } else {
      sounds.invalid();
    }
    setLoading(false);
    setTimeout(() => setResult(null), 5000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Bonuscode einlösen</h3>
      </div>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleRedeem()}
          placeholder="CODE EINGEBEN…"
          className="bg-secondary border-border text-xs font-mono uppercase tracking-wider"
        />
        <Button size="sm" onClick={handleRedeem} disabled={loading || !code.trim()}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        </Button>
      </div>
      {result && (
        <div className={`rounded-lg p-2.5 text-xs flex items-center gap-2 animate-fade-in ${
          result.success
            ? 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]'
            : 'bg-destructive/10 text-destructive'
        }`}>
          {result.success && <Sparkles className="w-3.5 h-3.5" />}
          {result.message}
          {result.coins && <span className="font-bold">+{result.coins} 🪙</span>}
        </div>
      )}
    </div>
  );
}
