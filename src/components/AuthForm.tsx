import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LogIn, UserPlus, Loader2, Gamepad2, Sparkles, Eye } from 'lucide-react';
import { sounds } from '@/lib/sounds';

interface AuthFormProps {
  onGuestPlay?: () => void;
}

export function AuthForm({ onGuestPlay }: AuthFormProps) {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, name || 'Player');
        if (error) setError(error.message);
        else sounds.levelUp();
      } else {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
        else sounds.coinEarn();
      }
    } catch {
      setError('Ein unerwarteter Fehler ist aufgetreten.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background overflow-hidden relative">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      
      <div className="w-full max-w-sm animate-fade-in-up relative z-10">
        <div className="text-center mb-8 space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-[hsl(25,90%,48%)] flex items-center justify-center mx-auto shadow-lg animate-pulse-glow card-3d">
            <Gamepad2 className="w-8 h-8 text-background" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            X-Play
          </h1>
          <p className="text-muted-foreground text-sm">
            Spiel. Spaß. Zusammen.
          </p>
          <div className="flex justify-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-primary" /> 14+ Spiele</span>
            <span>•</span>
            <span>Multiplayer & KI</span>
          </div>
        </div>

        <div className="game-card card-3d">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="animate-fade-in">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Anzeigename
                </label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Dein Spielername"
                  className="bg-secondary border-border"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                E-Mail
              </label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@beispiel.de"
                required
                className="bg-secondary border-border"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Passwort
              </label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-secondary border-border"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive animate-shake">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full glow-primary-sm" disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Registrieren
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Anmelden
                </>
              )}
            </Button>
          </form>

          <div className="mt-4 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-[10px]"><span className="bg-card px-2 text-muted-foreground">oder</span></div>
            </div>

            {onGuestPlay && (
              <Button
                variant="secondary"
                className="w-full gap-2 text-xs"
                onClick={() => { sounds.click(); onGuestPlay(); }}
              >
                <Eye className="w-4 h-4" />
                Als Gast zuschauen
              </Button>
            )}

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); setError(''); sounds.click(); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {isSignUp ? 'Bereits registriert? Anmelden' : 'Noch kein Konto? Registrieren'}
              </button>
            </div>
          </div>
        </div>

        {/* Social proof */}
        <div className="mt-6 text-center animate-fade-in" style={{ animationDelay: '400ms' }}>
          <p className="text-[10px] text-muted-foreground">
            📱 Installiere X-Play als App auf deinem Gerät
          </p>
        </div>
      </div>
    </div>
  );
}
