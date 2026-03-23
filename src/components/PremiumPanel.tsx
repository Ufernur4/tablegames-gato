import { Crown, Zap, Shield, Sparkles, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sounds } from '@/lib/sounds';

const PREMIUM_PERKS = [
  { icon: Shield, title: 'Werbefrei', desc: 'Keine Unterbrechungen, reines Spielerlebnis' },
  { icon: Zap, title: '2x Münzen', desc: 'Doppelte Belohnungen für alle Spiele' },
  { icon: Sparkles, title: 'Exklusive Items', desc: 'Zugang zu Premium-Shop-Items' },
  { icon: Star, title: 'VIP-Badge', desc: 'Goldenes Abzeichen neben deinem Namen' },
];

export function PremiumPanel() {
  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(38,92%,55%)] to-[hsl(25,90%,48%)] flex items-center justify-center mx-auto shadow-lg animate-pulse-glow">
          <Crown className="w-7 h-7 text-background" />
        </div>
        <h3 className="text-base font-bold text-foreground">X-Play Premium</h3>
        <p className="text-xs text-muted-foreground">Das ultimative Spielerlebnis</p>
      </div>

      <div className="space-y-2">
        {PREMIUM_PERKS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3 rounded-xl bg-secondary/50 border border-border p-3 card-3d">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{title}</p>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4 text-center space-y-2">
        <p className="text-xs text-muted-foreground">Bald verfügbar</p>
        <p className="text-2xl font-bold text-primary tabular-nums">4,99€<span className="text-xs font-normal text-muted-foreground">/Monat</span></p>
        <Button
          className="w-full gap-2 glow-primary"
          onClick={() => { sounds.notification(); }}
        >
          <Crown className="w-4 h-4" /> Bald verfügbar
        </Button>
        <p className="text-[10px] text-muted-foreground">Benachrichtige mich zum Launch</p>
      </div>
    </div>
  );
}
